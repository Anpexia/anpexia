import prisma from '../../config/database';

export const dashboardService = {
  async getDashboard(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      totalCustomers,
      newCustomersThisWeek,
      newCustomersThisMonth,
      lowStockProducts,
      expiringProducts,
      messagesToday,
      messagesThisWeek,
      totalProducts,
      todayAppointments,
      totalAppointments,
    ] = await Promise.all([
      // Total de clientes ativos
      prisma.customer.count({ where: { tenantId, isActive: true } }),

      // Clientes novos esta semana
      prisma.customer.count({
        where: { tenantId, isActive: true, createdAt: { gte: weekAgo } },
      }),

      // Clientes novos este mês
      prisma.customer.count({
        where: { tenantId, isActive: true, createdAt: { gte: monthAgo } },
      }),

      // Produtos com estoque baixo (fetch + filter for column comparison)
      prisma.product.findMany({
        where: { tenantId, isActive: true, minQuantity: { gt: 0 } },
        select: { quantity: true, minQuantity: true },
      }),

      // Produtos vencidos + perto do vencimento (30 dias)
      prisma.product.count({
        where: {
          tenantId,
          isActive: true,
          expiresAt: {
            not: null,
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Mensagens enviadas hoje
      prisma.messageSent.count({
        where: { tenantId, status: 'SENT', sentAt: { gte: today } },
      }),

      // Mensagens enviadas esta semana
      prisma.messageSent.count({
        where: { tenantId, status: 'SENT', sentAt: { gte: weekAgo } },
      }),

      // Total de produtos ativos
      prisma.product.count({ where: { tenantId, isActive: true } }),

      // Consultas de hoje
      prisma.scheduledCall.findMany({
        where: {
          date: { gte: today, lt: tomorrow },
          status: { notIn: ['cancelled'] },
          customer: { tenantId },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { date: 'asc' },
      }),

      // Total de consultas do mês
      prisma.scheduledCall.count({
        where: {
          date: { gte: monthAgo },
          status: { notIn: ['cancelled'] },
        },
      }),
    ]);

    return {
      customers: {
        total: totalCustomers,
        newThisWeek: newCustomersThisWeek,
        newThisMonth: newCustomersThisMonth,
      },
      inventory: {
        totalProducts,
        lowStock: lowStockProducts.filter(p => p.quantity <= p.minQuantity).length,
        expiringSoon: expiringProducts,
      },
      messages: {
        sentToday: messagesToday,
        sentThisWeek: messagesThisWeek,
      },
      scheduling: {
        todayAppointments,
        totalThisMonth: totalAppointments,
      },
    };
  },
};
