import { z } from 'zod';

export const bookCallSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido').optional().nullable(),
  phone: z.string().min(10, 'Telefone deve ter pelo menos 10 dígitos'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:MM').optional(),
  notes: z.string().max(500).optional().nullable(),
  customerId: z.string().optional().nullable(),
  doctorId: z.string().optional().nullable(),
  paymentType: z.enum(['PARTICULAR', 'CONVENIO']).optional(),
  convenioId: z.string().optional().nullable(),
});

export const linkProceduresSchema = z.object({
  procedures: z.array(z.object({
    tussProcedureId: z.string().min(1),
    authorizationNumber: z.string().optional().nullable(),
  })).min(1, 'Informe ao menos um procedimento'),
});

export const updateConfigSchema = z.object({
  availableDays: z.array(z.number().min(0).max(6)).optional(),
  startHour: z.number().min(0).max(23).optional(),
  endHour: z.number().min(1).max(24).optional(),
  slotDuration: z.number().min(15).max(120).optional(),
  breakStart: z.number().min(0).max(23).optional().nullable(),
  breakEnd: z.number().min(1).max(24).optional().nullable(),
  timezone: z.string().optional(),
  maxDaysAhead: z.number().min(1).max(90).optional(),
});

export const updateCallStatusSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateCallDoctorSchema = z.object({
  doctorId: z.string().nullable().optional(),
});

export const updateCallAuthorizationSchema = z.object({
  authorizationNumber: z.string().max(100).nullable().optional(),
});

export const replaceProceduresSchema = z.object({
  procedures: z.array(z.object({
    tussProcedureId: z.string().min(1),
    authorizationNumber: z.string().optional().nullable(),
  })),
});

export type BookCallInput = z.infer<typeof bookCallSchema>;
export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
export type UpdateCallStatusInput = z.infer<typeof updateCallStatusSchema>;
export type LinkProceduresInput = z.infer<typeof linkProceduresSchema>;
export type UpdateCallDoctorInput = z.infer<typeof updateCallDoctorSchema>;
export type UpdateCallAuthorizationInput = z.infer<typeof updateCallAuthorizationSchema>;
export type ReplaceProceduresInput = z.infer<typeof replaceProceduresSchema>;
