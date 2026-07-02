import { z } from 'zod';

export const TEMPLATE_CONTEXTS = ['ANAMNESE', 'EVOLUCAO', 'GERAL'] as const;

export const createTemplateSchema = z.object({
  title: z.string().min(1, 'Titulo e obrigatorio').max(120, 'Titulo muito longo'),
  content: z.string().min(1, 'Conteudo e obrigatorio'),
  context: z.enum(TEMPLATE_CONTEXTS).optional().nullable(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
