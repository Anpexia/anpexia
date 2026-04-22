import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { evolutionApi } from '../messaging/evolution.client';
import { handleAppointmentReply } from '../scheduling/scheduling.notifications';
import { handleConversationFlow, FlowResponse } from './conversation-flow';

interface UpdateConfigData {
  instanceName?: string;
  isActive?: boolean;
  businessName?: string;
  businessDescription?: string;
  businessHours?: string;
  businessAddress?: string;
  businessPhone?: string;
  servicesOffered?: string;
  priceInfo?: string;
  customInstructions?: string;
  greetingMessage?: string;
  fallbackMessage?: string;
  humanHandoffMessage?: string;
  allowScheduling?: boolean;
  allowOrderStatus?: boolean;
  maxResponseTime?: number;
  operatingHoursOnly?: boolean;
  assistantName?: string;
  specialties?: string;
  acceptedInsurance?: string;
}

interface IncomingMessage {
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
    };
    messageType?: string;
    pushName?: string;
  };
  event: string;
  sender?: string;
}

async function sendFlowResponse(
  instanceName: string,
  sendTo: string,
  response: FlowResponse,
  tenantId: string,
  config: any,
  dbPhone?: string,
) {
  const phoneForDb = dbPhone || sendTo;

  if (response.type === 'handoff') {
    const handoffMsg = config.humanHandoffMessage ||
      'Vou te encaminhar para um atendente. Aguarde um momento!';
    await evolutionApi.sendText(instanceName, sendTo, handoffMsg);
    await prisma.chatMessage.create({
      data: {
        tenantId,
        phone: phoneForDb,
        senderName: 'Anpexia Bot',
        direction: 'OUTGOING',
        body: handoffMsg,
        metadata: { handoff: true },
      },
    });
    return;
  }

  const sentText = response.text;
  await evolutionApi.sendText(instanceName, sendTo, sentText);

  await prisma.chatMessage.create({
    data: {
      tenantId,
      phone: phoneForDb,
      senderName: 'Anpexia Bot',
      direction: 'OUTGOING',
      body: sentText,
      metadata: { type: 'conversation_flow', responseType: response.type },
    },
  });
}

export const chatbotService = {
  async handleIncomingMessage(data: IncomingMessage) {
    if (data.data.key.fromMe) return;
    if (data.event !== 'messages.upsert') return;

    const messageText =
      data.data.message?.conversation ||
      data.data.message?.extendedTextMessage?.text;

    if (!messageText) {
      if (!data.data.key.remoteJid.includes('@g.us')) {
        console.log(`[CHATBOT] Ignorando: sem texto (messageType=${data.data.messageType})`);
      }
      return;
    }

    const instanceName = data.instance;
    const remoteJid = data.data.key.remoteJid;

    if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

    console.log(`[CHATBOT] 📩 "${messageText}" de ${data.data.pushName || 'Desconhecido'} (${remoteJid})`);

    const senderPhone = remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');
    const senderName = data.data.pushName || 'Cliente';

    const phoneForSend = remoteJid;
    const phoneForDb = evolutionApi.ensureBrazilian9thDigit(
      senderPhone.startsWith('55') ? senderPhone : `55${senderPhone}`
    );

    const config = await prisma.chatbotConfig.findFirst({
      where: { instanceName, isActive: true },
      include: { tenant: true },
    });

    if (!config) {
      console.log(`[CHATBOT] Nenhum config ativo para instancia "${instanceName}"`);
      return;
    }

    const tenantId = config.tenantId;
    const phone = phoneForDb;

    await prisma.chatMessage.create({
      data: { tenantId, phone, senderName, direction: 'INCOMING', body: messageText },
    });

    // --- Appointment reply handler (from reminders) ---
    const appointmentReply = await handleAppointmentReply(phone, messageText, tenantId);
    if (appointmentReply) {
      if (appointmentReply === '__HANDOFF__') {
        await sendFlowResponse(instanceName, phoneForSend, { type: 'handoff', text: '' }, tenantId, config, phone);
        return;
      }
      await evolutionApi.sendText(instanceName, phoneForSend, appointmentReply);
      await prisma.chatMessage.create({
        data: { tenantId, phone, senderName: 'Anpexia Bot', direction: 'OUTGOING', body: appointmentReply, metadata: { type: 'appointment_reply' } },
      });
      return;
    }

    // --- Conversation flow (menu, registration, scheduling) ---
    const flowResponse = await handleConversationFlow(tenantId, phone, senderName, messageText);
    if (flowResponse) {
      await sendFlowResponse(instanceName, phoneForSend, flowResponse, tenantId, config, phone);
      return;
    }

    // No handler matched — repeat entry menu
    const entryResponse: FlowResponse = {
      type: 'text',
      text: 'Ola! 👋 Este canal e exclusivo para agendamento de consultas.\n\n' +
            '1 - Agendar consulta\n' +
            '2 - Falar com atendente\n\n' +
            'Responda com o numero da opcao.',
    };
    await sendFlowResponse(instanceName, phoneForSend, entryResponse, tenantId, config, phone);
  },

  async handleTestMessage(phone: string, messageText: string): Promise<{ responses: FlowResponse[]; debug: Record<string, any> }> {
    const responses: FlowResponse[] = [];
    const debug: Record<string, any> = {};

    const config = await prisma.chatbotConfig.findFirst({
      where: { instanceName: 'anpexia', isActive: true },
      include: { tenant: true },
    });

    if (!config) {
      return { responses: [{ type: 'text', text: 'ERROR: No active chatbot config for instance anpexia' }], debug: {} };
    }

    const tenantId = config.tenantId;
    const senderName = 'Test User';
    debug.tenantId = tenantId;

    await prisma.chatMessage.create({
      data: { tenantId, phone, senderName, direction: 'INCOMING', body: messageText },
    });

    const appointmentReply = await handleAppointmentReply(phone, messageText, tenantId);
    if (appointmentReply) {
      debug.source = 'appointment_reply';
      if (appointmentReply === '__HANDOFF__') {
        responses.push({ type: 'handoff', text: config.humanHandoffMessage || 'Vou te encaminhar para um atendente.' });
      } else {
        responses.push({ type: 'text', text: appointmentReply });
      }
      return { responses, debug };
    }

    const flowResponse = await handleConversationFlow(tenantId, phone, senderName, messageText);
    if (flowResponse) {
      debug.source = 'conversation_flow';
      responses.push(flowResponse);
      await prisma.chatMessage.create({
        data: { tenantId, phone, senderName: 'Anpexia Bot', direction: 'OUTGOING', body: flowResponse.text, metadata: { type: 'conversation_flow' } },
      });
      return { responses, debug };
    }

    debug.source = 'entry_menu';
    responses.push({
      type: 'text',
      text: 'Ola! 👋 Este canal e exclusivo para agendamento de consultas.\n\n1 - Agendar consulta\n2 - Falar com atendente\n\nResponda com o numero da opcao.',
    });

    return { responses, debug };
  },

  async getConfig(tenantId: string) {
    let config = await prisma.chatbotConfig.findFirst({ where: { tenantId } });

    if (!config) {
      config = await prisma.chatbotConfig.create({
        data: {
          tenantId,
          isActive: false,
          greetingMessage: 'Olá! Sou o assistente virtual. Como posso te ajudar?',
          fallbackMessage: 'Desculpe, não entendi. Pode reformular a pergunta?',
          humanHandoffMessage: 'Vou te encaminhar para um atendente. Aguarde um momento!',
        },
      });
    }

    return config;
  },

  async updateConfig(tenantId: string, data: UpdateConfigData) {
    let config = await prisma.chatbotConfig.findFirst({ where: { tenantId } });

    if (config) {
      return prisma.chatbotConfig.update({
        where: { id: config.id },
        data,
      });
    }

    return prisma.chatbotConfig.create({
      data: { tenantId, ...data },
    });
  },

  async listFaqs(tenantId: string) {
    return prisma.chatbotFaq.findMany({
      where: { tenantId },
      orderBy: { category: 'asc' },
    });
  },

  async createFaq(tenantId: string, data: { question: string; answer: string; category?: string }) {
    return prisma.chatbotFaq.create({
      data: { tenantId, ...data },
    });
  },

  async updateFaq(tenantId: string, id: string, data: Partial<{ question: string; answer: string; category: string; isActive: boolean }>) {
    const faq = await prisma.chatbotFaq.findFirst({ where: { id, tenantId } });
    if (!faq) throw new AppError(404, 'FAQ_NOT_FOUND', 'FAQ não encontrada');

    return prisma.chatbotFaq.update({ where: { id }, data });
  },

  async deleteFaq(tenantId: string, id: string) {
    const faq = await prisma.chatbotFaq.findFirst({ where: { id, tenantId } });
    if (!faq) throw new AppError(404, 'FAQ_NOT_FOUND', 'FAQ não encontrada');

    await prisma.chatbotFaq.delete({ where: { id } });
  },

  async listConversations(tenantId: string, params: { skip: number; take: number }) {
    const conversations = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT ON (phone)
        phone,
        sender_name,
        body as last_message,
        direction as last_direction,
        created_at as last_message_at
      FROM chat_messages
      WHERE tenant_id = ${tenantId}
      ORDER BY phone, created_at DESC
      LIMIT ${params.take} OFFSET ${params.skip}
    `;

    const total = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT phone) as count
      FROM chat_messages
      WHERE tenant_id = ${tenantId}
    `;

    return { conversations, total: Number(total[0]?.count ?? 0) };
  },

  async getConversation(tenantId: string, phone: string) {
    return prisma.chatMessage.findMany({
      where: { tenantId, phone },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  },

  async getStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [totalMessages, messagesToday, messagesThisWeek, uniqueContacts, handoffs] = await Promise.all([
      prisma.chatMessage.count({ where: { tenantId } }),
      prisma.chatMessage.count({ where: { tenantId, createdAt: { gte: today } } }),
      prisma.chatMessage.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT phone) as count FROM chat_messages WHERE tenant_id = ${tenantId}
      `,
      prisma.chatMessage.count({
        where: { tenantId, metadata: { path: ['handoff'], equals: true } },
      }),
    ]);

    return {
      totalMessages,
      messagesToday,
      messagesThisWeek,
      uniqueContacts: Number(uniqueContacts[0]?.count ?? 0),
      handoffs,
    };
  },
};
