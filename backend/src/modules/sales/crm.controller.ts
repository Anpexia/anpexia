import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { LeadStage } from '@prisma/client';
import prisma from '../../config/database';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { success, created } from '../../shared/utils/response';
import { AppError } from '../../shared/middleware/error-handler';
import * as crm from './crm.service';
import { sendEmail } from '../../services/email.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ============ Public router ============
export const publicLeadsRouter = Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Tente novamente em 1 minuto.' } },
});

publicLeadsRouter.post('/', publicLimiter, asyncHandler(async (req, res) => {
  const { name, companyName, company, phone, email, estimatedValue, notes } = req.body || {};
  if (!name || !phone) throw new AppError(400, 'VALIDATION_ERROR', 'Nome e telefone são obrigatórios');

  const lead = await prisma.lead.create({
    data: {
      name,
      phone,
      email: email || null,
      companyName: companyName || company || null,
      company: company || companyName || null,
      source: 'landing_page',
      stage: 'NEW',
      notes: notes || null,
      estimatedValue: estimatedValue != null ? Number(estimatedValue) : null,
      lastInteractionAt: new Date(),
    },
  });

  await prisma.leadActivity.create({
    data: { leadId: lead.id, type: 'NOTE', description: 'Lead criado via landing page', content: 'Lead criado via landing page' },
  });

  await crm.executeAutomations('LEAD_CREATED', lead);

  // Fire-and-forget admin notification
  sendEmail({
    to: 'angelolarocca10@gmail.com',
    subject: `Novo lead: ${name}`,
    html: `<h2>Novo lead recebido</h2>
      <p><b>Nome:</b> ${name}</p>
      <p><b>Empresa:</b> ${companyName || company || '-'}</p>
      <p><b>Telefone:</b> ${phone}</p>
      <p><b>Email:</b> ${email || '-'}</p>
      <p><b>Origem:</b> landing_page</p>`,
  }).catch((err) => console.error('[PUBLIC LEAD] email error', err));

  return created(res, { id: lead.id, message: 'Lead capturado com sucesso' });
}));

// ============ Admin router ============
export const adminCrmRouter = Router();
adminCrmRouter.use(authenticate, requireRole('SUPER_ADMIN'));

// Automations — placed before /leads/:id (different path so no conflict)
adminCrmRouter.get('/automations', asyncHandler(async (_req, res) => {
  const list = await prisma.crmAutomation.findMany({ orderBy: { createdAt: 'asc' } });
  return success(res, list);
}));

adminCrmRouter.post('/automations', asyncHandler(async (req, res) => {
  const { name, trigger, triggerConfig, action, actionConfig, active } = req.body;
  const a = await prisma.crmAutomation.create({
    data: { name, trigger, triggerConfig, action, actionConfig, active: active ?? true },
  });
  return created(res, a);
}));

adminCrmRouter.patch('/automations/:id', asyncHandler(async (req, res) => {
  const a = await prisma.crmAutomation.update({ where: { id: req.params.id as string }, data: req.body });
  return success(res, a);
}));

adminCrmRouter.patch('/automations/:id/toggle', asyncHandler(async (req, res) => {
  const cur = await prisma.crmAutomation.findUnique({ where: { id: req.params.id as string } });
  if (!cur) throw new AppError(404, 'NOT_FOUND', 'Automação não encontrada');
  const a = await prisma.crmAutomation.update({ where: { id: cur.id }, data: { active: !cur.active } });
  return success(res, a);
}));

adminCrmRouter.delete('/automations/:id', asyncHandler(async (req, res) => {
  await prisma.crmAutomation.delete({ where: { id: req.params.id as string } });
  return success(res, { ok: true });
}));

// Tasks — task-level endpoints (must come before /leads/:id)
adminCrmRouter.patch('/leads/tasks/:taskId', asyncHandler(async (req, res) => {
  const data: any = {};
  if (req.body.status !== undefined) data.status = req.body.status;
  if (req.body.dueAt !== undefined) data.dueAt = new Date(req.body.dueAt);
  if (req.body.type !== undefined) data.type = req.body.type;
  if (req.body.responsible !== undefined) data.responsible = req.body.responsible;
  const t = await prisma.leadTask.update({ where: { id: req.params.taskId as string }, data });
  return success(res, t);
}));

adminCrmRouter.delete('/leads/tasks/:taskId', asyncHandler(async (req, res) => {
  await prisma.leadTask.delete({ where: { id: req.params.taskId as string } });
  return success(res, { ok: true });
}));

// Leads
adminCrmRouter.get('/leads', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 20);
  const { leads, total } = await crm.listLeads({
    stage: req.query.stage as string | undefined,
    search: req.query.search as string | undefined,
    responsible: req.query.responsible as string | undefined,
    page,
    limit,
  });
  return success(res, leads, { total, page, limit });
}));

adminCrmRouter.get('/leads/stats', asyncHandler(async (_req, res) => {
  const s = await crm.getStats();
  return success(res, s);
}));

adminCrmRouter.get('/leads/:id', asyncHandler(async (req, res) => {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id as string },
    include: {
      activities: { orderBy: { createdAt: 'desc' } },
      tasks: { orderBy: { dueAt: 'asc' } },
    },
  });
  if (!lead) throw new AppError(404, 'NOT_FOUND', 'Lead não encontrado');
  return success(res, lead);
}));

adminCrmRouter.post('/leads', asyncHandler(async (req, res) => {
  const { name, phone, email, companyName, company, source, estimatedValue, responsible, tags, notes, stage, zoomLink, scheduledAt } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'Nome é obrigatório');
  const lead = await prisma.lead.create({
    data: {
      name,
      phone: phone || '',
      email: email || null,
      companyName: companyName || company || null,
      company: company || companyName || null,
      source: source || null,
      stage: (stage as LeadStage) || 'NEW',
      estimatedValue: estimatedValue != null ? Number(estimatedValue) : null,
      responsible: responsible || null,
      tags: Array.isArray(tags) ? tags : [],
      notes: notes || null,
      zoomLink: zoomLink || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      lastInteractionAt: new Date(),
    },
  });
  await crm.executeAutomations('LEAD_CREATED', lead);
  return created(res, lead);
}));

adminCrmRouter.patch('/leads/:id', asyncHandler(async (req, res) => {
  const data: any = { ...req.body };
  if (data.estimatedValue !== undefined && data.estimatedValue !== null) data.estimatedValue = Number(data.estimatedValue);
  if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);
  if (data.proposalSentAt) data.proposalSentAt = new Date(data.proposalSentAt);
  // never let stage pass through here — use /stage
  delete data.stage;
  data.lastInteractionAt = new Date();
  const lead = await prisma.lead.update({ where: { id: req.params.id as string }, data });
  return success(res, lead);
}));

adminCrmRouter.patch('/leads/:id/stage', asyncHandler(async (req, res) => {
  const { stage, lostReason } = req.body;
  const existing = await prisma.lead.findUnique({ where: { id: req.params.id as string } });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Lead não encontrado');
  const updateData: any = { stage, lastInteractionAt: new Date() };
  if (stage === 'LOST' && lostReason) updateData.lostReason = lostReason;
  if (stage === 'PROPOSAL_SENT') updateData.proposalSentAt = new Date();
  const lead = await prisma.lead.update({ where: { id: existing.id }, data: updateData });
  await prisma.leadActivity.create({
    data: { leadId: lead.id, type: 'NOTE', description: `Stage alterado para ${stage}`, content: `Stage alterado para ${stage}` },
  });
  await crm.executeAutomations('STAGE_CHANGED', lead, stage);
  if (stage === 'WON') await crm.executeAutomations('DEAL_WON', lead);
  return success(res, lead);
}));

adminCrmRouter.delete('/leads/:id', asyncHandler(async (req, res) => {
  await prisma.lead.delete({ where: { id: req.params.id as string } });
  return success(res, { ok: true });
}));

// Activities
adminCrmRouter.post('/leads/:id/activities', asyncHandler(async (req, res) => {
  const { type, content, description, responsible } = req.body;
  const activity = await prisma.leadActivity.create({
    data: {
      leadId: req.params.id as string,
      type: type || 'NOTE',
      content: content || description || '',
      description: description || content || '',
      responsible: responsible || null,
    },
  });
  await prisma.lead.update({ where: { id: req.params.id as string }, data: { lastInteractionAt: new Date() } });
  return created(res, activity);
}));

adminCrmRouter.get('/leads/:id/activities', asyncHandler(async (req, res) => {
  const list = await prisma.leadActivity.findMany({
    where: { leadId: req.params.id as string },
    orderBy: { createdAt: 'desc' },
  });
  return success(res, list);
}));

// Tasks (lead-scoped)
adminCrmRouter.post('/leads/:id/tasks', asyncHandler(async (req, res) => {
  const { type, dueAt, responsible, status } = req.body;
  const task = await prisma.leadTask.create({
    data: {
      leadId: req.params.id as string,
      type: type || 'FOLLOWUP',
      dueAt: dueAt ? new Date(dueAt) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      responsible: responsible || null,
      status: status || 'PENDING',
    },
  });
  return created(res, task);
}));

adminCrmRouter.get('/leads/:id/tasks', asyncHandler(async (req, res) => {
  const list = await prisma.leadTask.findMany({
    where: { leadId: req.params.id as string },
    orderBy: { dueAt: 'asc' },
  });
  return success(res, list);
}));
