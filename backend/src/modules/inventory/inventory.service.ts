import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface ListParams {
  skip: number;
  take: number;
  search?: string;
  category?: string;
  lowStock?: boolean;
}

interface CreateProductData {
  name: string;
  sku?: string;
  categoryId?: string;
  quantity?: number;
  minQuantity?: number;
  unit?: string;
  costPrice?: number;
  salePrice?: number;
  supplier?: string;
  batch?: string;
  expiresAt?: string;
  location?: string;
  imageUrl?: string;
}

interface MovementData {
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  reason?: string;
  reference?: string;
}

export const inventoryService = {
  async listProducts(tenantId: string, params: ListParams) {
    const where: any = { tenantId, isActive: true };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { sku: { contains: params.search, mode: 'insensitive' } },
        { supplier: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.category) {
      where.categoryId = params.category;
    }

    // lowStock filter is handled via raw query in getLowStockProducts()
    // For the list endpoint, we skip this filter and let the frontend use the alerts endpoint

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: { category: true },
      }),
      prisma.product.count({ where }),
    ]);

    // Adicionar margem calculada
    const productsWithMargin = products.map((p) => ({
      ...p,
      margin: p.costPrice && p.salePrice
        ? ((p.salePrice - p.costPrice) / p.costPrice * 100).toFixed(1)
        : null,
    }));

    return { products: productsWithMargin, total };
  },

  async getProductById(tenantId: string, id: string) {
    const product = await prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado');
    }

    return {
      ...product,
      margin: product.costPrice && product.salePrice
        ? ((product.salePrice - product.costPrice) / product.costPrice * 100).toFixed(1)
        : null,
    };
  },

  async createProduct(tenantId: string, data: CreateProductData) {
    const { expiresAt, ...rest } = data;

    return prisma.product.create({
      data: {
        ...rest,
        tenantId,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
      include: { category: true },
    });
  },

  async updateProduct(tenantId: string, id: string, data: Partial<CreateProductData>) {
    const existing = await prisma.product.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado');
    }

    const { expiresAt, ...rest } = data;

    return prisma.product.update({
      where: { id },
      data: {
        ...rest,
        expiresAt: expiresAt ? new Date(expiresAt) : expiresAt === null ? null : undefined,
      },
      include: { category: true },
    });
  },

  async deleteProduct(tenantId: string, id: string) {
    const existing = await prisma.product.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado');
    }

    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  },

  async createMovement(tenantId: string, productId: string, data: MovementData, userId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado');
    }

    // Calcular nova quantidade
    let newQuantity = product.quantity;
    if (data.type === 'IN') {
      newQuantity += data.quantity;
    } else if (data.type === 'OUT') {
      newQuantity -= data.quantity;
      if (newQuantity < 0) {
        throw new AppError(400, 'INSUFFICIENT_STOCK', 'Estoque insuficiente para esta saída');
      }
    } else {
      // ADJUSTMENT: define a quantidade diretamente
      newQuantity = data.quantity;
    }

    // Transação: criar movimentação + atualizar estoque
    const [movement] = await prisma.$transaction([
      prisma.inventoryMovement.create({
        data: {
          tenantId,
          productId,
          type: data.type,
          quantity: data.quantity,
          reason: data.reason,
          reference: data.reference,
          userId,
        },
      }),
      prisma.product.update({
        where: { id: productId },
        data: { quantity: newQuantity },
      }),
    ]);

    return movement;
  },

  async listMovements(tenantId: string, productId: string, skip: number, take: number) {
    const where = { tenantId, productId };

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return { movements, total };
  },

  async listCategories(tenantId: string) {
    return prisma.productCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  },

  async createCategory(tenantId: string, name: string) {
    return prisma.productCategory.create({
      data: { tenantId, name },
    });
  },

  async getLowStockProducts(tenantId: string) {
    const products = await prisma.product.findMany({
      where: { tenantId, isActive: true, minQuantity: { gt: 0 } },
      select: { id: true, name: true, quantity: true, minQuantity: true, unit: true, expiresAt: true, supplier: true },
      orderBy: { quantity: 'asc' },
    });
    // Filter where quantity <= minQuantity and map to snake_case for frontend compatibility
    return products
      .filter(p => p.quantity <= p.minQuantity)
      .map(p => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        min_quantity: p.minQuantity,
        unit: p.unit,
        expires_at: p.expiresAt,
        supplier: p.supplier,
      }));
  },

  async getExpiringProducts(tenantId: string, days: number) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + days);

    // Returns both already-expired AND expiring within `days`
    const products = await prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        expiresAt: {
          not: null,
          lte: deadline,
        },
      },
      orderBy: { expiresAt: 'asc' },
    });

    const now = new Date();
    return products.map(p => ({
      ...p,
      isExpired: p.expiresAt! < now,
    }));
  },
};
