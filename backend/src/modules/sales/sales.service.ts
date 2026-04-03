import { LeadStage, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { CreateLeadInput, UpdateLeadInput } from './sales.validators';

interface ListLeadsFilters {
  stage?: LeadStage;
  source?: string;
  search?: string;
  page: number;
  limit: number;
  skip: number;
}

export async function listLeads(filters: ListLeadsFilters) {
  const where: Prisma.LeadWhereInput = {};

  if (filters.stage) where.stage = filters.stage;
  if (filters.source) where.source = filters.source;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search } },
      { company: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip: filters.skip,
      take: filters.limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            activities: true,
            messages: true,
            proposals: true,
          },
        },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return { leads, total };
}

export async function getLeadById(id: string) {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'desc' } },
      activities: { orderBy: { createdAt: 'desc' } },
      proposals: { orderBy: { createdAt: 'desc' } },
      scheduledCalls: { orderBy: { date: 'desc' } },
      convertedTenant: true,
    },
  });

  if (!lead) throw new AppError(404, 'NOT_FOUND', 'Lead não encontrado');
  return lead;
}

export async function createLead(data: CreateLeadInput) {
  const lead = await prisma.lead.create({
    data: {
      ...data,
      nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : null,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: 'stage_change',
      description: 'Lead criado',
      metadata: { stage: 'NEW' } as any,
    },
  });

  return lead;
}

export async function updateLead(id: string, data: UpdateLeadInput) {
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Lead não encontrado');

  const stageChanged = data.stage && data.stage !== existing.stage;

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...data,
      nextFollowUp: data.nextFollowUp !== undefined
        ? (data.nextFollowUp ? new Date(data.nextFollowUp) : null)
        : undefined,
    },
  });

  if (stageChanged) {
    await prisma.leadActivity.create({
      data: {
        leadId: id,
        type: 'stage_change',
        description: `Stage alterado: ${existing.stage} → ${data.stage}`,
        metadata: { from: existing.stage, to: data.stage } as any,
      },
    });
  }

  return lead;
}

export async function updateStage(id: string, stage: LeadStage, reason?: string) {
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Lead não encontrado');

  const updateData: Prisma.LeadUpdateInput = { stage };
  if (stage === 'LOST' && reason) updateData.lostReason = reason;

  const lead = await prisma.lead.update({ where: { id }, data: updateData });

  await prisma.leadActivity.create({
    data: {
      leadId: id,
      type: 'stage_change',
      description: `Stage alterado: ${existing.stage} → ${stage}${reason ? ` (${reason})` : ''}`,
      metadata: { from: existing.stage, to: stage, reason } as any,
    },
  });

  return lead;
}

export async function addNote(leadId: string, note: string) {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Lead não encontrado');

  return prisma.leadActivity.create({
    data: {
      leadId,
      type: 'note',
      description: note,
    },
  });
}

export async function getStats() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [byStage, thisWeek, thisMonth, contracted, total] = await Promise.all([
    prisma.lead.groupBy({ by: ['stage'], _count: { id: true } }),
    prisma.lead.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.lead.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.lead.count({ where: { stage: 'CONTRACTED' } }),
    prisma.lead.count(),
  ]);

  const stageMap: Record<string, number> = {};
  for (const s of byStage) {
    stageMap[s.stage] = s._count.id;
  }

  const conversionRate = total > 0 ? ((contracted / total) * 100).toFixed(1) : '0';

  const contractedLeads = await prisma.lead.findMany({
    where: { stage: 'CONTRACTED' },
    select: { createdAt: true, updatedAt: true },
  });

  let avgDaysToClose = 0;
  if (contractedLeads.length > 0) {
    const totalDays = contractedLeads.reduce((acc, l) => {
      return acc + (l.updatedAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    }, 0);
    avgDaysToClose = Math.round(totalDays / contractedLeads.length);
  }

  return {
    byStage: stageMap,
    leadsThisWeek: thisWeek,
    leadsThisMonth: thisMonth,
    conversionRate: Number(conversionRate),
    avgDaysToClose,
    total,
  };
}

export async function getPipeline() {
  const stages: LeadStage[] = [
    'NEW', 'CONTACTED', 'QUALIFIED', 'CALL_SCHEDULED', 'CALL_DONE',
    'PROPOSAL_SENT', 'NEGOTIATION', 'CONTRACTED', 'ONBOARDING', 'ACTIVE', 'LOST',
  ];

  const leads = await prisma.lead.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: { activities: true, messages: true, proposals: true },
      },
    },
  });

  const pipeline: Record<string, typeof leads> = {};
  for (const stage of stages) {
    pipeline[stage] = [];
  }
  for (const lead of leads) {
    pipeline[lead.stage].push(lead);
  }

  return pipeline;
}
