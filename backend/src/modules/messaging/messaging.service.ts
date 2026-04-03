import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { evolutionApi } from './evolution.client';

interface CreateTemplateData {
  type: string;
  name: string;
  body: string;
  isActive?: boolean;
  config?: {
    sendHoursStart?: number;
    sendHoursEnd?: number;
    intervalDays?: number;
    reminderHours?: number;
  };
}

interface SendMessageData {
  customerId?: string;
  phone: string;
  templateId?: string;
  body: string;
}

interface ListParams {
  skip: number;
  take: number;
  status?: string;
}

export const messagingService = {
  async listTemplates(tenantId: string) {
    return prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { type: 'asc' },
    });
  },

  async createTemplate(tenantId: string, data: CreateTemplateData) {
    return prisma.messageTemplate.create({
      data: {
        tenantId,
        type: data.type as any,
        name: data.name,
        body: data.body,
        isActive: data.isActive ?? true,
        config: data.config ? JSON.parse(JSON.stringify(data.config)) : undefined,
      },
    });
  },

  async updateTemplate(tenantId: string, id: string, data: Partial<CreateTemplateData>) {
    const existing = await prisma.messageTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template não encontrado');
    }

    return prisma.messageTemplate.update({
      where: { id },
      data: {
        ...data,
        type: data.type as any,
        config: data.config ? JSON.parse(JSON.stringify(data.config)) : undefined,
      },
    });
  },

  async sendMessage(tenantId: string, data: SendMessageData) {
    // Registrar a mensagem como pendente
    const message = await prisma.messageSent.create({
      data: {
        tenantId,
        templateId: data.templateId,
        customerId: data.customerId,
        phone: data.phone,
        body: data.body,
        status: 'PENDING',
      },
    });

    try {
      // Enviar via Evolution API (resolve tenantId → instanceName)
      await evolutionApi.sendTextByTenant(tenantId, data.phone, data.body);

      // Atualizar status para enviado
      await prisma.messageSent.update({
        where: { id: message.id },
        data: { status: 'SENT', sentAt: new Date() },
      });

      return { ...message, status: 'SENT' };
    } catch (error: any) {
      // Registrar falha
      await prisma.messageSent.update({
        where: { id: message.id },
        data: { status: 'FAILED', error: error.message },
      });

      throw new AppError(502, 'MESSAGE_SEND_FAILED', 'Falha ao enviar mensagem via WhatsApp');
    }
  },

  async listSentMessages(tenantId: string, params: ListParams) {
    const where: any = { tenantId };

    if (params.status) {
      where.status = params.status;
    }

    const [messages, total] = await Promise.all([
      prisma.messageSent.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { name: true, type: true } },
          customer: { select: { name: true, phone: true } },
        },
      }),
      prisma.messageSent.count({ where }),
    ]);

    return { messages, total };
  },

  async getStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);

    const [totalSent, sentToday, sentThisWeek, failed] = await Promise.all([
      prisma.messageSent.count({ where: { tenantId, status: 'SENT' } }),
      prisma.messageSent.count({ where: { tenantId, status: 'SENT', sentAt: { gte: today } } }),
      prisma.messageSent.count({ where: { tenantId, status: 'SENT', sentAt: { gte: thisWeek } } }),
      prisma.messageSent.count({ where: { tenantId, status: 'FAILED' } }),
    ]);

    return { totalSent, sentToday, sentThisWeek, failed };
  },
};
