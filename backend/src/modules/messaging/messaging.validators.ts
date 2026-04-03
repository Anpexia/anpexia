import { z } from 'zod';

export const createTemplateSchema = z.object({
  type: z.enum([
    'APPOINTMENT_REMINDER',
    'RETURN_REMINDER',
    'BIRTHDAY',
    'WELCOME',
    'LOW_STOCK_ALERT',
    'CONFIRMATION',
    'POST_SERVICE',
    'CUSTOM',
  ]),
  name: z.string().min(1, 'Nome é obrigatório'),
  body: z.string().min(1, 'Texto da mensagem é obrigatório'),
  isActive: z.boolean().default(true),
  config: z.object({
    sendHoursStart: z.number().min(0).max(23).default(8),
    sendHoursEnd: z.number().min(0).max(23).default(20),
    intervalDays: z.number().min(1).optional(), // Para retorno
    reminderHours: z.number().min(1).optional(), // Para agendamento
  }).optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const sendMessageSchema = z.object({
  customerId: z.string().optional(),
  phone: z.string().min(10, 'Número de telefone inválido'),
  templateId: z.string().optional(),
  body: z.string().min(1, 'Texto da mensagem é obrigatório'),
});
