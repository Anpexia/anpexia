import { z } from 'zod';

export const updateConfigSchema = z.object({
  isActive: z.boolean().optional(),
  businessName: z.string().optional(),
  businessDescription: z.string().optional(),
  businessHours: z.string().optional(), // Ex: "Seg-Sex 8h-18h, Sáb 8h-12h"
  businessAddress: z.string().optional(),
  businessPhone: z.string().optional(),
  servicesOffered: z.string().optional(), // Descrição dos serviços/produtos
  priceInfo: z.string().optional(), // Informações de preços
  customInstructions: z.string().optional(), // Instruções extras para a IA
  greetingMessage: z.string().optional(), // Mensagem de boas-vindas
  fallbackMessage: z.string().optional(), // Mensagem quando não sabe responder
  humanHandoffMessage: z.string().optional(), // Mensagem ao transferir para humano
  allowScheduling: z.boolean().optional(), // Permitir agendamento pelo chat
  allowOrderStatus: z.boolean().optional(), // Permitir consulta de pedidos
  maxResponseTime: z.number().min(1).max(30).optional(), // Timeout em segundos
  operatingHoursOnly: z.boolean().optional(), // Só responder em horário comercial
  assistantName: z.string().optional(), // Nome do assistente virtual
  specialties: z.string().optional(), // Especialidades da clínica
  acceptedInsurance: z.string().optional(), // Convênios aceitos
});

export const webhookMessageSchema = z.object({
  instance: z.string(), // Nome da instância (tenant identifier)
  data: z.object({
    key: z.object({
      remoteJid: z.string(), // Número do remetente (pode ser LID format)
      fromMe: z.boolean(),
      id: z.string(),
    }),
    message: z.object({
      conversation: z.string().optional(),
      extendedTextMessage: z.object({
        text: z.string(),
      }).optional(),
    }).optional(),
    messageType: z.string().optional(),
    pushName: z.string().optional(), // Nome do contato
  }),
  event: z.string(), // Tipo de evento (messages.upsert, etc.)
  sender: z.string().optional(), // Phone@s.whatsapp.net do remetente (Evolution v1.8.2)
  destination: z.string().optional(), // Webhook destination URL
  server_url: z.string().optional(), // Evolution API server URL
});

export const createFaqSchema = z.object({
  question: z.string().min(3, 'Pergunta deve ter pelo menos 3 caracteres'),
  answer: z.string().min(1, 'Resposta é obrigatória'),
  category: z.string().optional(),
  isActive: z.boolean().default(true),
});
