import prisma from '../../config/database';
import { LeadStage, Prisma } from '@prisma/client';

export type Trigger = 'LEAD_CREATED' | 'STAGE_CHANGED' | 'LEAD_IDLE' | 'DEAL_WON';

const DEFAULT_AUTOMATIONS = [
  { name: 'Ligar para novo lead', trigger: 'LEAD_CREATED', triggerConfig: {}, action: 'CREATE_TASK', actionConfig: { type: 'CALL', daysOffset: 1 } },
  { name: 'Follow-up após contato', trigger: 'STAGE_CHANGED', triggerConfig: { toStage: 'CONTACTED' }, action: 'CREATE_TASK', actionConfig: { type: 'FOLLOWUP', daysOffset: 2 } },
  { name: 'Enviar proposta após qualificação', trigger: 'STAGE_CHANGED', triggerConfig: { toStage: 'QUALIFIED' }, action: 'CREATE_TASK', actionConfig: { type: 'PROPOSAL', daysOffset: 3 } },
  { name: 'Follow-up após proposta', trigger: 'STAGE_CHANGED', triggerConfig: { toStage: 'PROPOSAL_SENT' }, action: 'CREATE_TASK', actionConfig: { type: 'FOLLOWUP', daysOffset: 2 } },
  { name: 'Lead inativo — cobrar retorno', trigger: 'LEAD_IDLE', triggerConfig: { idleDays: 3 }, action: 'CREATE_TASK', actionConfig: { type: 'FOLLOWUP', daysOffset: 1 } },
  { name: 'Negócio fechado', trigger: 'DEAL_WON', triggerConfig: {}, action: 'SEND_NOTIFICATION', actionConfig: { message: 'Parabéns! Negócio fechado. Iniciar onboarding.' } },
];

export async function seedDefaultAutomations() {
  for (const a of DEFAULT_AUTOMATIONS) {
    await prisma.crmAutomation.upsert({
      where: { name: a.name },
      create: { name: a.name, trigger: a.trigger, triggerConfig: a.triggerConfig as any, action: a.action, actionConfig: a.actionConfig as any, active: true },
      update: {},
    });
  }
}

export async function executeAutomations(trigger: Trigger, lead: { id: string; responsible?: string | null }, toStage?: string) {
  const automations = await prisma.crmAutomation.findMany({ where: { active: true, trigger } });
  const now = new Date();
  for (const a of automations) {
    if (trigger === 'STAGE_CHANGED') {
      const cfg = (a.triggerConfig as any) || {};
      if (cfg.toStage && cfg.toStage !== toStage) continue;
    }
    const action = a.action;
    const cfg = (a.actionConfig as any) || {};
    if (action === 'CREATE_TASK') {
      const daysOffset = Number(cfg.daysOffset || 1);
      const dueAt = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
      await prisma.leadTask.create({
        data: { leadId: lead.id, type: cfg.type || 'FOLLOWUP', dueAt, responsible: lead.responsible || null, status: 'PENDING' },
      });
    } else if (action === 'SEND_NOTIFICATION') {
      await prisma.leadActivity.create({
        data: { leadId: lead.id, type: 'NOTE', description: cfg.message || '', content: cfg.message || '' },
      });
    }
  }
  await prisma.lead.update({ where: { id: lead.id }, data: { lastInteractionAt: now } }).catch(() => {});
}

// ================= Leads =================

export async function listLeads(opts: { stage?: string; search?: string; responsible?: string; page: number; limit: number }) {
  const where: Prisma.LeadWhereInput = {};
  if (opts.stage) where.stage = opts.stage as LeadStage;
  if (opts.responsible) where.responsible = opts.responsible;
  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { email: { contains: opts.search, mode: 'insensitive' } },
      { phone: { contains: opts.search } },
      { companyName: { contains: opts.search, mode: 'insensitive' } },
      { company: { contains: opts.search, mode: 'insensitive' } },
    ];
  }
  const skip = (opts.page - 1) * opts.limit;
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({ where, skip, take: opts.limit, orderBy: { updatedAt: 'desc' } }),
    prisma.lead.count({ where }),
  ]);
  return { leads, total };
}

export async function getStats() {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const [all, byStageRaw, bySourceRaw, recent] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, stage: true, estimatedValue: true, source: true, responsible: true, createdAt: true, updatedAt: true } }),
    prisma.lead.groupBy({ by: ['stage'], _count: { id: true }, _sum: { estimatedValue: true } }),
    prisma.lead.groupBy({ by: ['source'], _count: { id: true } }),
    prisma.lead.findMany({ where: { createdAt: { gte: threeMonthsAgo } }, select: { createdAt: true } }),
  ]);

  const total = all.length;
  const byStage: Record<string, { count: number; sum: number }> = {};
  for (const s of byStageRaw) {
    byStage[s.stage] = { count: s._count.id, sum: Number(s._sum.estimatedValue || 0) };
  }
  const wonLeads = all.filter((l) => l.stage === 'WON');
  const conversionRate = total > 0 ? Number(((wonLeads.length / total) * 100).toFixed(1)) : 0;
  const negotiationValue = all
    .filter((l) => l.stage === 'PROPOSAL_SENT' || l.stage === 'NEGOTIATION')
    .reduce((acc, l) => acc + Number(l.estimatedValue || 0), 0);
  const avgTicket = wonLeads.length > 0 ? wonLeads.reduce((acc, l) => acc + Number(l.estimatedValue || 0), 0) / wonLeads.length : 0;
  const avgCloseDays = wonLeads.length > 0
    ? wonLeads.reduce((acc, l) => acc + (l.updatedAt.getTime() - l.createdAt.getTime()) / 86400000, 0) / wonLeads.length
    : 0;

  const byResponsible: Record<string, { total: number; won: number; sum: number }> = {};
  for (const l of all) {
    const r = l.responsible || 'Sem responsável';
    if (!byResponsible[r]) byResponsible[r] = { total: 0, won: 0, sum: 0 };
    byResponsible[r].total++;
    if (l.stage === 'WON') {
      byResponsible[r].won++;
      byResponsible[r].sum += Number(l.estimatedValue || 0);
    }
  }

  const byWeek: Record<string, number> = {};
  for (const r of recent) {
    const d = r.createdAt;
    const year = d.getUTCFullYear();
    // ISO week calc
    const tmp = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    const key = `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    byWeek[key] = (byWeek[key] || 0) + 1;
  }

  const bySource: Record<string, number> = {};
  for (const s of bySourceRaw) {
    bySource[s.source || 'Não informado'] = s._count.id;
  }

  return {
    total,
    byStage,
    conversionRate,
    negotiationValue,
    avgTicket: Math.round(avgTicket * 100) / 100,
    avgCloseDays: Math.round(avgCloseDays * 10) / 10,
    byResponsible,
    byWeek,
    bySource,
  };
}
