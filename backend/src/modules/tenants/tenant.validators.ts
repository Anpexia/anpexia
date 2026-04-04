import { z } from 'zod';

const tenantSegmentEnum = z.enum(['CLINICA_OFTALMOLOGICA', 'CLINICA_GERAL', 'CLINICA_MEDICA', 'SALAO_BELEZA', 'OUTROS']);

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  segment: tenantSegmentEnum.optional(),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional(),
  address: z.string().optional(),
  plan: z.enum(['STARTER', 'PRO', 'BUSINESS']).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  segment: tenantSegmentEnum.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  plan: z.enum(['STARTER', 'PRO', 'BUSINESS']).optional(),
  logo: z.string().optional(),
});
