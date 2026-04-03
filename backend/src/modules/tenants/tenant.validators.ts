import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  segment: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional(),
  address: z.string().optional(),
  plan: z.enum(['ESSENTIAL', 'PROFESSIONAL', 'ENTERPRISE']).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  segment: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  plan: z.enum(['ESSENTIAL', 'PROFESSIONAL', 'ENTERPRISE']).optional(),
  logo: z.string().optional(),
});
