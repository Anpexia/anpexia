import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { aiService } from './ai.service';
import { evolutionApi } from '../messaging/evolution.client';
import { handleAppointmentReply } from '../scheduling/scheduling.notifications';
import { handleConversationFlow, FlowResponse } from './conversation-flow';
import { startCollection, getMissingFields } from './data-collection.service';

interface UpdateConfigData {
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
  sender?: string; // Phone@s.whatsapp.net (from Evolution v1.8.2 webhook payload)
}

/**
 * Send a FlowResponse via the appropriate Evolution API method (text, buttons, or list).
 * Falls back to plain text if interactive message fails.
 */
async function sendFlowResponse(
  instanceName: string,
  sendTo: string,
  response: FlowResponse,
  tenantId: string,
  config: any,
  dbPhone?: string,
) {
  const phoneForDb = dbPhone || sendTo;

  // Handoff to human
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

  let sentText = response.text;

  try {
    if (response.type === 'buttons' && response.buttons) {
      await evolutionApi.sendButtons(
        instanceName, sendTo, response.text, response.buttons,
        response.title, response.footer,
      );
    } else if (response.type === 'list' && response.listSections) {
      await evolutionApi.sendList(
        instanceName, sendTo, response.text,
        response.listButtonText || 'Ver opcoes',
        response.listSections,
        response.title, response.footer,
      );
    } else {
      await evolutionApi.sendText(instanceName, sendTo, response.text);
    }
  } catch (err) {
    // Fallback: send as plain text with options listed
    console.error('[CHATBOT] Interactive message failed, falling back to text:', err);
    let fallback = response.text;
    if (response.buttons) {
      fallback += '\n\n' + response.buttons.map((b, i) => `*${i + 1}* - ${b.text}`).join('\n');
    }
    if (response.listSections) {
      for (const section of response.listSections) {
        fallback += '\n\n' + section.rows.map((r, i) => `*${i + 1}* - ${r.title}${r.description ? ` (${r.description})` : ''}`).join('\n');
      }
    }
    sentText = fallback;
    try {
      await evolutionApi.sendText(instanceName, sendTo, fallback);
    } catch {}
  }

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
  /**
   * Processa mensagem recebida do WhatsApp
   */
  async handleIncomingMessage(data: IncomingMessage) {
    // Ignorar mensagens enviadas por nós mesmos
    if (data.data.key.fromMe) return;

    // Só processar mensagens de texto
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

    // Skip group messages and non-standard JIDs (status@broadcast, etc.)
    if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

    console.log(`[CHATBOT] 📩 MENSAGEM RECEBIDA: "${messageText}" de ${data.data.pushName || 'Desconhecido'} (${remoteJid})`);

    // Extract phone number — handle @s.whatsapp.net and @lid (Linked ID) formats
    const senderPhone = remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');
    const senderName = data.data.pushName || 'Cliente';

    // Evolution v1.8.2 sends 'sender' at top level BUT it's the instance owner, NOT the message sender.
    // For LID remoteJid, we need to use the Evolution API to resolve it, or use the LID directly
    // since Evolution API accepts sending to LID format.
    // The 'sender' field = instance owner (557181449402@s.whatsapp.net), NOT useful for incoming messages.
    // Solution: send responses using the original remoteJid (LID format) — Evolution API handles the mapping.
    const phoneForSend = remoteJid; // Use full JID for sending (Evolution resolves LID internally)
    const phoneForDb = data.sender?.replace(/@s\.whatsapp\.net$/, '') || senderPhone; // For DB/lookups
    console.log(`[CHATBOT] remoteJid=${remoteJid} phoneForSend=${phoneForSend} phoneForDb=${phoneForDb} fromMe=${data.data.key.fromMe}`);

    // Encontrar o tenant pela instância do WhatsApp
    const config = await prisma.chatbotConfig.findFirst({
      where: { instanceName, isActive: true },
      include: { tenant: true },
    });

    if (!config) {
      console.log(`[CHATBOT] ❌ Nenhum config ativo para instancia "${instanceName}"`);
      return;
    }
    console.log(`[CHATBOT] ✅ Config encontrado: tenant=${config.tenantId}, business=${config.businessName}`);

    const tenantId = config.tenantId;

    // phoneForSend = full remoteJid for Evolution API (handles LID format)
    // phoneForDb = clean number for database storage and lookups
    const phone = phoneForDb; // For DB operations

    // Save incoming message
    await prisma.chatMessage.create({
      data: {
        tenantId,
        phone,
        senderName,
        direction: 'INCOMING',
        body: messageText,
      },
    });

    // --- Conversation Flow Engine (registration, booking, menu) ---
    console.log(`[CHATBOT] 🔄 Verificando conversation flow...`);
    const flowResponse = await handleConversationFlow(tenantId, phone, senderName, messageText);

    if (flowResponse) {
      console.log(`[CHATBOT] 📋 Flow response: type=${flowResponse.type}, text="${(flowResponse.text || '').substring(0, 100)}"`);
      await sendFlowResponse(instanceName, phoneForSend, flowResponse, tenantId, config, phone);
      return;
    }
    console.log(`[CHATBOT] ➡️ Sem flow response, seguindo para AI...`);

    // --- Appointment reply handler (SIM, CANCELAR, button IDs from notifications) ---
    const appointmentReply = await handleAppointmentReply(phone, messageText);
    if (appointmentReply) {
      if (appointmentReply === '__HANDOFF__') {
        await sendFlowResponse(instanceName, phoneForSend, { type: 'handoff', text: '' }, tenantId, config, phone);
        return;
      }
      await evolutionApi.sendText(instanceName, phoneForSend, appointmentReply);
      await prisma.chatMessage.create({
        data: {
          tenantId,
          phone,
          senderName: 'Anpexia Bot',
          direction: 'OUTGOING',
          body: appointmentReply,
          metadata: { type: 'appointment_reply' },
        },
      });
      return;
    }

    // --- Fallback: AI response ---
    const customer = await prisma.customer.findFirst({
      where: { tenantId, phone: { contains: phone.slice(-8) } },
    });

    const recentMessages = await prisma.chatMessage.findMany({
      where: { tenantId, phone },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const faqs = await prisma.chatbotFaq.findMany({
      where: { tenantId, isActive: true },
    });

    console.log(`[CHATBOT] 🤖 Chamando Claude AI... (customer=${customer?.name || 'nao encontrado'}, faqs=${faqs.length}, historico=${recentMessages.length})`);
    const aiResponse = await aiService.generateResponse({
      userMessage: messageText,
      senderName,
      config,
      faqs,
      conversationHistory: recentMessages.reverse(),
      customer,
    });
    console.log(`[CHATBOT] 🤖 Claude respondeu: handoff=${aiResponse.handoffToHuman}, registration=${aiResponse.startRegistration}, texto="${aiResponse.text.substring(0, 150)}..."`);

    if (aiResponse.handoffToHuman) {
      const handoffMsg = config.humanHandoffMessage ||
        'Vou te encaminhar para um atendente. Aguarde um momento!';
      await evolutionApi.sendText(instanceName, phoneForSend, handoffMsg);
      await prisma.chatMessage.create({
        data: {
          tenantId,
          phone,
          senderName: 'Anpexia Bot',
          direction: 'OUTGOING',
          body: handoffMsg,
          metadata: { handoff: true },
        },
      });
      return;
    }

    // Send the AI text response first
    if (aiResponse.text) {
      console.log(`[CHATBOT] 📤 Enviando resposta via Evolution API para ${phoneForSend}...`);
      await evolutionApi.sendText(instanceName, phoneForSend, aiResponse.text);
      console.log(`[CHATBOT] ✅ Resposta enviada com sucesso!`);
      await prisma.chatMessage.create({
        data: {
          tenantId,
          phone,
          senderName: 'Anpexia Bot',
          direction: 'OUTGOING',
          body: aiResponse.text,
          metadata: (aiResponse.metadata || undefined) as any,
        },
      });
    }

    // If AI detected patient intent, start structured data collection
    if (aiResponse.startRegistration) {
      const requiredFields = (config.requiredPatientFields as string[]) || ['name', 'birthDate'];

      if (!customer) {
        // New person → collect all required fields
        const collectionResponse = await startCollection(tenantId, phone, requiredFields);
        await sendFlowResponse(instanceName, phoneForSend, collectionResponse, tenantId, config, phone);
      } else {
        // Existing customer → check for missing fields
        const missing = await getMissingFields(tenantId, customer.id, requiredFields);
        if (missing.length > 0) {
          const existingData: Record<string, any> = {};
          if (customer.name) existingData.name = customer.name;
          if (customer.birthDate) existingData.birthDate = customer.birthDate;
          if ((customer as any).cpfCnpj) existingData.cpfCnpj = (customer as any).cpfCnpj;
          if (customer.email) existingData.email = customer.email;

          const collectionResponse = await startCollection(tenantId, phone, requiredFields, customer.id, existingData);
          await sendFlowResponse(instanceName, phoneForSend, collectionResponse, tenantId, config, phone);
        }
      }
    }
  },

  /**
   * Test endpoint: simulates incoming message without sending to WhatsApp.
   * Returns the bot responses as an array.
   */
  async handleTestMessage(phone: string, messageText: string): Promise<{ responses: FlowResponse[]; debug: Record<string, any> }> {
    const responses: FlowResponse[] = [];
    const debug: Record<string, any> = {};

    // Use the anpexia instance / clinica teste
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
    debug.instanceName = 'anpexia';

    // Save incoming message (same as real flow)
    await prisma.chatMessage.create({
      data: { tenantId, phone, senderName, direction: 'INCOMING', body: messageText },
    });

    // --- Conversation Flow Engine ---
    const flowResponse = await handleConversationFlow(tenantId, phone, senderName, messageText);
    if (flowResponse) {
      debug.source = 'conversation_flow';
      responses.push(flowResponse);

      // Save outgoing message
      await prisma.chatMessage.create({
        data: { tenantId, phone, senderName: 'Anpexia Bot', direction: 'OUTGOING', body: flowResponse.text, metadata: { type: 'conversation_flow', responseType: flowResponse.type } },
      });

      return { responses, debug };
    }

    // --- Appointment reply handler ---
    const appointmentReply = await handleAppointmentReply(phone, messageText);
    if (appointmentReply) {
      debug.source = 'appointment_reply';
      if (appointmentReply === '__HANDOFF__') {
        responses.push({ type: 'handoff', text: config.humanHandoffMessage || 'Vou te encaminhar para um atendente.' });
      } else {
        responses.push({ type: 'text', text: appointmentReply });
      }
      return { responses, debug };
    }

    // --- AI response ---
    debug.source = 'ai_fallback';
    const customer = await prisma.customer.findFirst({
      where: { tenantId, phone: { contains: phone.slice(-8) } },
    });
    debug.customerFound = !!customer;
    debug.customerName = customer?.name || null;

    const recentMessages = await prisma.chatMessage.findMany({
      where: { tenantId, phone },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const faqs = await prisma.chatbotFaq.findMany({
      where: { tenantId, isActive: true },
    });

    const aiResponse = await aiService.generateResponse({
      userMessage: messageText,
      senderName,
      config,
      faqs,
      conversationHistory: recentMessages.reverse(),
      customer,
    });

    debug.aiHandoff = aiResponse.handoffToHuman;
    debug.aiStartRegistration = aiResponse.startRegistration;

    if (aiResponse.handoffToHuman) {
      const handoffMsg = config.humanHandoffMessage || 'Vou te encaminhar para um atendente.';
      responses.push({ type: 'handoff', text: handoffMsg });
      await prisma.chatMessage.create({
        data: { tenantId, phone, senderName: 'Anpexia Bot', direction: 'OUTGOING', body: handoffMsg, metadata: { handoff: true } },
      });
      return { responses, debug };
    }

    // Send AI text
    if (aiResponse.text) {
      responses.push({ type: 'text', text: aiResponse.text });
      await prisma.chatMessage.create({
        data: { tenantId, phone, senderName: 'Anpexia Bot', direction: 'OUTGOING', body: aiResponse.text, metadata: { type: 'ai_response' } },
      });
    }

    // If AI detected patient intent, start registration
    if (aiResponse.startRegistration) {
      const requiredFields = (config.requiredPatientFields as string[]) || ['name', 'birthDate'];

      if (!customer) {
        const collectionResponse = await startCollection(tenantId, phone, requiredFields);
        responses.push(collectionResponse);
        await prisma.chatMessage.create({
          data: { tenantId, phone, senderName: 'Anpexia Bot', direction: 'OUTGOING', body: collectionResponse.text, metadata: { type: 'data_collection_start' } },
        });
      } else {
        const missing = await getMissingFields(tenantId, customer.id, requiredFields);
        if (missing.length > 0) {
          const existingData: Record<string, any> = {};
          if (customer.name) existingData.name = customer.name;
          if (customer.birthDate) existingData.birthDate = customer.birthDate;
          if ((customer as any).cpfCnpj) existingData.cpfCnpj = (customer as any).cpfCnpj;
          if (customer.email) existingData.email = customer.email;

          const collectionResponse = await startCollection(tenantId, phone, requiredFields, customer.id, existingData);
          responses.push(collectionResponse);
          await prisma.chatMessage.create({
            data: { tenantId, phone, senderName: 'Anpexia Bot', direction: 'OUTGOING', body: collectionResponse.text, metadata: { type: 'data_collection_start' } },
          });
        }
      }
    }

    return { responses, debug };
  },

  /**
   * Configuração do chatbot
   */
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

  /**
   * FAQs
   */
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

  /**
   * Conversas
   */
  async listConversations(tenantId: string, params: { skip: number; take: number }) {
    // Agrupar por telefone, pegar última mensagem de cada
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

  /**
   * Estatísticas
   */
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
