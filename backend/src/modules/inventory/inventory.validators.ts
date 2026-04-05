import { z } from 'zod';

// Preprocess: empty string → undefined
const emptyToUndefined = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const emptyToUndefinedNum = z.preprocess(
  (v) => (v === '' || v === null ? undefined : typeof v === 'string' ? Number(v) : v),
  z.number().min(0).optional(),
);

export const createProductSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  sku: emptyToUndefined,
  categoryId: emptyToUndefined,
  quantity: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().min(0).default(0)),
  minQuantity: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().min(0).default(0)),
  unit: z.string().default('un'),
  costPrice: emptyToUndefinedNum,
  salePrice: emptyToUndefinedNum,
  supplier: emptyToUndefined,
  batch: emptyToUndefined,
  expiresAt: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().optional(),
  ),
  location: emptyToUndefined,
  imageUrl: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
});

export const updateProductSchema = createProductSchema.partial();

export const movementSchema = z.object({
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.number().int().min(1, 'Quantidade deve ser pelo menos 1'),
  reason: z.string().optional(),
  reference: z.string().optional(),
});
