import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  cpfCnpj: z.string().optional(),
  birthDate: z.string().datetime().optional().or(z.literal('')),
  address: z.object({
    cep: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  }).optional(),
  notes: z.string().optional(),
  origin: z.string().optional(),
  optInWhatsApp: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();
