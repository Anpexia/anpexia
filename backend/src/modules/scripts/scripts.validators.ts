import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Nome e obrigatorio'),
  icon: z.string().optional(),
  order: z.number().int().min(0).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createScriptSchema = z.object({
  categoryId: z.string().min(1, 'Categoria e obrigatoria'),
  title: z.string().min(1, 'Titulo e obrigatorio'),
  content: z.string().min(1, 'Conteudo e obrigatorio'),
  tags: z.array(z.string()).optional(),
});

export const updateScriptSchema = createScriptSchema.partial();
