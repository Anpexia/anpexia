import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

// Check if product is low stock and send email to linked supplier (non-blocking)
async function checkLowStockEmail(productId: string, tenantId: string, quantity: number, minQuantity: number) {
  if (minQuantity <= 0 || quantity > minQuantity) return;

  try {
    const product = await prisma.product.findFirst({
      where: { id: productId },
      select: { id: true, name: true, sku: true, unit: true, lastLowStockEmailAt: true },
    });
    if (!product) return;

    // Only send if last email was >24h ago
    if (product.lastLowStockEmailAt) {
      const hoursSince = (Date.now() - product.lastLowStockEmailAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) return;
    }

    // Find primary supplier with email
    const link = await prisma.supplierProduct.findFirst({
      where: { productId, tenant: { id: tenantId } },
      orderBy: { isPrimary: 'desc' },
      include: { supplier: true },
    });
    if (!link?.supplier?.email) return;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, phone: true, email: true } });
    const { sendEmail } = await import('../../services/email.service');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1E3A5F">Pedido de reposicao — ${tenant?.name || 'Clinica'}</h2>
        <p>Ola ${link.supplier.contactName || link.supplier.name},</p>
        <p>O produto abaixo atingiu o estoque minimo e precisamos de reposicao:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f5f5f5">
            <td style="padding:10px;border:1px solid #ddd;font-weight:bold">Produto</td>
            <td style="padding:10px;border:1px solid #ddd">${product.name}</td>
          </tr>
          ${product.sku ? `<tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold">SKU</td><td style="padding:10px;border:1px solid #ddd">${product.sku}</td></tr>` : ''}
          <tr>
            <td style="padding:10px;border:1px solid #ddd;font-weight:bold">Quantidade atual</td>
            <td style="padding:10px;border:1px solid #ddd;color:#e53e3e;font-weight:bold">${quantity} ${product.unit || 'un'}</td>
          </tr>
          <tr>
            <td style="padding:10px;border:1px solid #ddd;font-weight:bold">Quantidade minima</td>
            <td style="padding:10px;border:1px solid #ddd">${minQuantity} ${product.unit || 'un'}</td>
          </tr>
        </table>
        <p>Solicitamos a reposicao do produto acima. Entre em contato para confirmar o pedido.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#666;font-size:13px">
          <strong>${tenant?.name || 'Clinica'}</strong><br/>
          ${tenant?.phone ? `Tel: ${tenant.phone}<br/>` : ''}
          ${tenant?.email ? `Email: ${tenant.email}` : ''}
        </p>
      </div>
    `;

    await sendEmail({
      to: link.supplier.email,
      subject: `Pedido de reposicao — ${tenant?.name || 'Clinica'}`,
      html,
    });

    await prisma.product.update({
      where: { id: productId },
      data: { lastLowStockEmailAt: new Date() },
    });

    console.log(`[ESTOQUE-EMAIL] Low stock email sent for ${product.name} to ${link.supplier.email}`);
  } catch (err: any) {
    console.error('[ESTOQUE-EMAIL] Failed:', err.message);
  }
}

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
        include: {
          category: true,
          supplierProducts: {
            include: { supplier: { select: { id: true, name: true } } },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
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

    const product = await prisma.product.create({
      data: {
        ...rest,
        tenantId,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
      include: { category: true },
    });

    // Check low stock on creation (non-blocking)
    checkLowStockEmail(product.id, tenantId, product.quantity, product.minQuantity).catch(() => {});

    return product;
  },

  async updateProduct(tenantId: string, id: string, data: Partial<CreateProductData>) {
    const existing = await prisma.product.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado');
    }

    const { expiresAt, ...rest } = data;

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...rest,
        expiresAt: expiresAt ? new Date(expiresAt) : expiresAt === null ? null : undefined,
      },
      include: { category: true },
    });

    // Check low stock after update (non-blocking)
    checkLowStockEmail(updated.id, tenantId, updated.quantity, updated.minQuantity).catch(() => {});

    return updated;
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

    // Check low stock after movement (non-blocking)
    checkLowStockEmail(productId, tenantId, newQuantity, product.minQuantity).catch(() => {});

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
