import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z.string().optional(), // legado — espelha cellPhone
  cellPhone: z.string().optional().or(z.literal('')),
  landlinePhone: z.string().optional().or(z.literal('')),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  cpfCnpj: z.string().optional(),
  documentType: z.enum(['RG', 'CNH', 'PASSPORT', 'RNM', 'OTHER']).optional().or(z.literal('')),
  documentNumber: z.string().optional().or(z.literal('')),
  // Nascimento obrigatório APENAS no cadastro manual (createCustomerSchema).
  // No update vira opcional via .partial() — registros antigos sem data continuam editáveis.
  birthDate: z.string({ required_error: 'Data de nascimento é obrigatória' }).min(1, 'Data de nascimento é obrigatória'),
  insurance: z.string().optional(),
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
  responsavelId: z.string().nullable().optional(),
  parentesco: z.string().nullable().optional(),
  usarTelResponsavel: z.boolean().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();
