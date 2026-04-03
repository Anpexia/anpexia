import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  sku: z.string().optional(),
  categoryId: z.string().optional(),
  quantity: z.number().int().min(0).default(0),
  minQuantity: z.number().int().min(0).default(0),
  unit: z.string().default('un'),
  costPrice: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
  supplier: z.string().optional(),
  batch: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  location: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const movementSchema = z.object({
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.number().int().min(1, 'Quantidade deve ser pelo menos 1'),
  reason: z.string().optional(),
  reference: z.string().optional(),
});
