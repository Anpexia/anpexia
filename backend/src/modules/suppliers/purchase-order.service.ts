import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface ListParams {
  skip: number;
  take: number;
  status?: string;
  supplierId?: string;
}

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  currentStock: number;
  minStock: number;
  unit: string;
}

interface CreateOrderData {
  supplierId: string;
  items: OrderItem[];
  message?: string;
}

export const purchaseOrderService = {
  async list(tenantId: string, params: ListParams) {
    const where: any = { tenantId };

    if (params.status) {
      where.status = params.status;
    }

    if (params.supplierId) {
      where.supplierId = params.supplierId;
    }

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, contactName: true, email: true, whatsapp: true } },
        },
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return { orders, total };
  },

  async create(tenantId: string, data: CreateOrderData) {
    // Validate supplier belongs to tenant
    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId, isActive: true },
    });
    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', 'Fornecedor nao encontrado');
    }

    const order = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        supplierId: data.supplierId,
        items: data.items as any,
        message: data.message,
        status: 'PENDING_APPROVAL',
      },
      include: {
        supplier: true,
      },
    });

    return order;
  },

  async approve(tenantId: string, id: string) {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { supplier: true, tenant: true },
    });

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Pedido nao encontrado');
    }

    if (order.status !== 'PENDING_APPROVAL') {
      throw new AppError(400, 'INVALID_STATUS', 'Apenas pedidos pendentes podem ser aprovados');
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
      },
      include: { supplier: true, tenant: true },
    });

    // Send notification to supplier
    try {
      await sendNotification(updated, updated.supplier, updated.tenant);

      await prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      console.error(`[PURCHASE-ORDER] Failed to send notification for order ${id}:`, err);
      // Order stays APPROVED even if notification fails
    }

    return updated;
  },

  async cancel(tenantId: string, id: string) {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
    });

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'Pedido nao encontrado');
    }

    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new AppError(400, 'INVALID_STATUS', 'Pedido ja finalizado ou cancelado');
    }

    return prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  },
};

async function sendNotification(
  order: any,
  supplier: any,
  tenant: any,
) {
  const items = order.items as OrderItem[];
  const itemList = items
    .map((item) => `- ${item.productName} (atual: ${item.currentStock}, mínimo: ${item.minStock})`)
    .join('\n');

  const whatsappMessage =
    `Olá ${supplier.contactName || supplier.name}! 👋\n` +
    `Aqui é a equipe da ${tenant.name}.\n` +
    `Precisamos repor os seguintes itens:\n\n` +
    `${itemList}\n\n` +
    `Poderia nos informar prazo e disponibilidade?\n` +
    `Obrigado! 🙏`;

  const method = supplier.notificationMethod as string;
  let sentVia: 'EMAIL' | 'WHATSAPP' | undefined;

  // Send via WhatsApp
  if ((method === 'WHATSAPP' || method === 'BOTH') && supplier.whatsapp) {
    try {
      const { evolutionApi } = await import('../messaging/evolution.client');
      await evolutionApi.sendTextByTenant(order.tenantId, supplier.whatsapp, whatsappMessage);
      sentVia = 'WHATSAPP';
      console.log(`[PURCHASE-ORDER] WhatsApp sent to supplier ${supplier.name} (${supplier.whatsapp})`);
    } catch (err) {
      console.error(`[PURCHASE-ORDER] WhatsApp failed for supplier ${supplier.name}:`, err);
    }
  }

  // Send via Email (Resend HTTP API)
  if ((method === 'EMAIL' || method === 'BOTH') && supplier.email) {
    try {
      const { sendPurchaseOrder } = await import('../../services/email.service');
      await sendPurchaseOrder(
        supplier.email,
        supplier.contactName || supplier.name,
        tenant.name,
        items,
        order.message || undefined,
      );
      sentVia = sentVia ? 'WHATSAPP' : 'EMAIL';
      console.log(`[PURCHASE-ORDER] Email sent to supplier ${supplier.name} (${supplier.email})`);
    } catch (err) {
      console.error(`[PURCHASE-ORDER] Email failed for supplier ${supplier.name}:`, err);
    }
  }

  // Update sentVia on the order
  if (sentVia) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { sentVia },
    });
  }
}

// Export for use in cron job
export { sendNotification as sendPurchaseOrderNotification };
