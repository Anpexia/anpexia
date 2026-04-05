import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface ListParams {
  skip: number;
  take: number;
  search?: string;
  active?: boolean;
}

interface CreateSupplierData {
  name: string;
  contactName?: string;
  email?: string;
  whatsapp?: string;
  phone?: string;
  notificationMethod?: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  autoDispatch?: boolean;
  notes?: string;
}

interface UpdateSupplierData {
  name?: string;
  contactName?: string;
  email?: string;
  whatsapp?: string;
  phone?: string;
  notificationMethod?: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  autoDispatch?: boolean;
  notes?: string;
}

export const supplierService = {
  async list(tenantId: string, params: ListParams) {
    const where: any = { tenantId, isActive: true };

    if (params.active === false) {
      delete where.isActive;
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { contactName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { whatsapp: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { products: true, purchaseOrders: true } },
        },
      }),
      prisma.supplier.count({ where }),
    ]);

    return { suppliers, total };
  },

  async getById(tenantId: string, id: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId },
      include: {
        products: {
          include: {
            product: { select: { id: true, name: true, sku: true, quantity: true, minQuantity: true, unit: true } },
          },
        },
        _count: { select: { purchaseOrders: true } },
      },
    });

    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', 'Fornecedor nao encontrado');
    }

    return supplier;
  },

  async create(tenantId: string, data: CreateSupplierData) {
    return prisma.supplier.create({
      data: {
        tenantId,
        name: data.name,
        contactName: data.contactName,
        email: data.email,
        whatsapp: data.whatsapp,
        phone: data.phone,
        notificationMethod: data.notificationMethod || 'WHATSAPP',
        autoDispatch: data.autoDispatch || false,
        notes: data.notes,
      },
    });
  },

  async update(tenantId: string, id: string, data: UpdateSupplierData) {
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Fornecedor nao encontrado');
    }

    return prisma.supplier.update({
      where: { id },
      data,
    });
  },

  async deactivate(tenantId: string, id: string) {
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Fornecedor nao encontrado');
    }

    return prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
  },

  async listProducts(tenantId: string, supplierId: string) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', 'Fornecedor nao encontrado');
    }

    return prisma.supplierProduct.findMany({
      where: { supplierId, tenantId },
      include: {
        product: {
          select: { id: true, name: true, sku: true, quantity: true, minQuantity: true, unit: true, costPrice: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async linkProduct(tenantId: string, supplierId: string, productId: string, isPrimary = false) {
    // Validate supplier belongs to tenant
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', 'Fornecedor nao encontrado');
    }

    // Validate product belongs to tenant
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) {
      throw new AppError(404, 'NOT_FOUND', 'Produto nao encontrado');
    }

    // Check if link already exists
    const existing = await prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId, productId } },
    });
    if (existing) {
      throw new AppError(409, 'ALREADY_EXISTS', 'Produto ja vinculado a este fornecedor');
    }

    // Auto-set isPrimary if this is the first supplier for the product
    const existingCount = await prisma.supplierProduct.count({ where: { productId, tenantId } });
    if (existingCount === 0) {
      isPrimary = true;
    }

    // If setting as primary, unset other primaries for this product
    if (isPrimary) {
      await prisma.supplierProduct.updateMany({
        where: { productId, tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return prisma.supplierProduct.create({
      data: {
        tenantId,
        supplierId,
        productId,
        isPrimary,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    });
  },

  async unlinkProduct(supplierId: string, productId: string) {
    const existing = await prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId, productId } },
    });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Vinculo nao encontrado');
    }

    return prisma.supplierProduct.delete({
      where: { supplierId_productId: { supplierId, productId } },
    });
  },

  async setPrimarySupplier(tenantId: string, supplierId: string, productId: string) {
    const existing = await prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId, productId } },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new AppError(404, 'NOT_FOUND', 'Vinculo nao encontrado');
    }

    // Unset all other primaries for this product
    await prisma.supplierProduct.updateMany({
      where: { productId, tenantId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Set this one as primary
    return prisma.supplierProduct.update({
      where: { supplierId_productId: { supplierId, productId } },
      data: { isPrimary: true },
      include: { supplier: { select: { id: true, name: true } } },
    });
  },

  async getSuppliersByProduct(tenantId: string, productId: string) {
    return prisma.supplierProduct.findMany({
      where: { productId, tenantId },
      include: {
        supplier: {
          select: { id: true, name: true, contactName: true, email: true, whatsapp: true, phone: true, notificationMethod: true, autoDispatch: true },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  },
};
