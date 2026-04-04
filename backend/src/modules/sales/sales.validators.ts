import { z } from 'zod';

const LeadStage = z.enum([
  'NEW', 'CONTACTED', 'QUALIFIED', 'CALL_SCHEDULED', 'CALL_DONE',
  'PROPOSAL_SENT', 'NEGOTIATION', 'CONTRACTED', 'ONBOARDING', 'ACTIVE', 'LOST',
]);

export const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().nullable(),
  company: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  utmSource: z.string().optional().nullable(),
  utmMedium: z.string().optional().nullable(),
  utmCampaign: z.string().optional().nullable(),
  utmContent: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  monthlyValue: z.number().optional().nullable(),
  plan: z.enum(['STARTER', 'PRO', 'BUSINESS']).optional().nullable(),
  score: z.number().int().optional(),
  nextFollowUp: z.string().datetime().optional().nullable(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  company: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  utmSource: z.string().optional().nullable(),
  utmMedium: z.string().optional().nullable(),
  utmCampaign: z.string().optional().nullable(),
  utmContent: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  monthlyValue: z.number().optional().nullable(),
  plan: z.enum(['STARTER', 'PRO', 'BUSINESS']).optional().nullable(),
  score: z.number().int().optional(),
  nextFollowUp: z.string().datetime().optional().nullable(),
  stage: LeadStage.optional(),
  lostReason: z.string().optional().nullable(),
});

export const createActivitySchema = z.object({
  type: z.string().min(1),
  description: z.string().min(1),
  metadata: z.any().optional(),
});

export const updateStageSchema = z.object({
  stage: LeadStage,
  reason: z.string().optional(),
});

export const addNoteSchema = z.object({
  note: z.string().min(1),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
