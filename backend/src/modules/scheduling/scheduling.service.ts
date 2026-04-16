import prisma from '../../config/database';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/middleware/error-handler';
import {
  BookCallInput,
  UpdateConfigInput,
  UpdateCallStatusInput,
  LinkProceduresInput,
  ReplaceProceduresInput,
} from './scheduling.validators';
import { sendBookingConfirmation, sendCancellationNotice } from './scheduling.notifications';

// Tag embedded in FinancialTransaction.notes so we can find and revert entries
// tied to a specific scheduled call. Format: [AGENDAMENTO:{scheduledCallId}]
const AGENDAMENTO_TAG = (id: string) => `[AGENDAMENTO:${id}]`;

// ============================================================
// São Paulo timezone helpers (UTC-3, no DST since 2019)
// ============================================================
const SP_OFFSET = '-03:00';
const SP_OFFSET_MS = 3 * 60 * 60 * 1000; // 3 hours in ms

/** Convert a UTC Date to SP hours, minutes, and date string */
function toSP(d: Date): { hours: number; minutes: number; dateStr: string } {
  const sp = new Date(d.getTime() - SP_OFFSET_MS);
  return { hours: sp.getUTCHours(), minutes: sp.getUTCMinutes(), dateStr: sp.toISOString().slice(0, 10) };
}

/** Format SP hours:minutes as HH:MM */
function spTimeStr(d: Date): string {
  const { hours, minutes } = toSP(d);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Get start and end of a SP calendar day as UTC Dates */
function spDayBounds(dateStr: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateStr}T00:00:00${SP_OFFSET}`),
    end: new Date(`${dateStr}T23:59:59.999${SP_OFFSET}`),
  };
}

const DEFAULT_CONFIG = {
  availableDays: [1, 2, 3, 4, 5], // Mon-Fri
  startHour: 9,
  endHour: 18,
  slotDuration: 30,
  breakStart: 12,
  breakEnd: 13,
  timezone: 'America/Sao_Paulo',
  maxDaysAhead: 14,
};

// Day-of-week (0=Sun..6=Sat) → horarios key used in TenantSettings.horarios JSON
const DAY_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;

interface TenantHours {
  durationMin: number;
  days: Record<string, { ativo: boolean; inicio: string; fim: string } | undefined>;
}

// Load tenant working hours from TenantSettings.horarios, falling back to defaults
async function loadTenantHours(tenantId: string | null | undefined): Promise<TenantHours> {
  const defaultDays: TenantHours['days'] = {
    dom: { ativo: false, inicio: '08:00', fim: '18:00' },
    seg: { ativo: true, inicio: '08:00', fim: '18:00' },
    ter: { ativo: true, inicio: '08:00', fim: '18:00' },
    qua: { ativo: true, inicio: '08:00', fim: '18:00' },
    qui: { ativo: true, inicio: '08:00', fim: '18:00' },
    sex: { ativo: true, inicio: '08:00', fim: '18:00' },
    sab: { ativo: false, inicio: '08:00', fim: '12:00' },
  };

  if (!tenantId) {
    return { durationMin: 30, days: defaultDays };
  }

  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  const horarios = (settings?.horarios as any) || null;

  const days: TenantHours['days'] = { ...defaultDays };
  if (horarios && typeof horarios === 'object') {
    for (const key of DAY_KEYS) {
      if (horarios[key] && typeof horarios[key] === 'object') {
        days[key] = {
          ativo: Boolean(horarios[key].ativo),
          inicio: String(horarios[key].inicio || defaultDays[key]!.inicio),
          fim: String(horarios[key].fim || defaultDays[key]!.fim),
        };
      }
    }
  }

  return {
    durationMin: settings?.duracaoConsultaPadrao ?? 30,
    days,
  };
}

// Convert "HH:MM" to minutes since midnight
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Validate that a booking request fits within tenant working hours and has no
// conflict with an existing call for the same doctor at the same datetime.
async function validateBookingWithinHours(params: {
  tenantId: string | null | undefined;
  date: string; // YYYY-MM-DD (SP)
  time: string; // HH:MM
  doctorId?: string | null;
  excludeCallId?: string;
}) {
  const hours = await loadTenantHours(params.tenantId);

  // Day of week in SP
  const dayOfWeek = new Date(`${params.date}T12:00:00${SP_OFFSET}`).getDay();
  const key = DAY_KEYS[dayOfWeek];
  const daySettings = hours.days[key];

  if (!daySettings || !daySettings.ativo) {
    throw new AppError(400, 'INVALID_DATE', 'Esta data não está disponível para agendamento');
  }

  const reqMin = timeToMinutes(params.time);
  const startMin = timeToMinutes(daySettings.inicio);
  const endMin = timeToMinutes(daySettings.fim);

  if (reqMin < startMin || reqMin + hours.durationMin > endMin) {
    throw new AppError(400, 'INVALID_TIME', 'Horário fora do expediente configurado');
  }

  // Per-doctor conflict check: another call at the exact same datetime for same doctor
  if (params.doctorId && params.tenantId) {
    const callDate = new Date(`${params.date}T${params.time}:00${SP_OFFSET}`);
    const conflict = await prisma.scheduledCall.findFirst({
      where: {
        tenantId: params.tenantId,
        doctorId: params.doctorId,
        date: callDate,
        status: { notIn: ['cancelled'] },
        ...(params.excludeCallId ? { NOT: { id: params.excludeCallId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new AppError(400, 'SLOT_TAKEN', 'Este médico já tem uma consulta neste horário');
    }
  }

  return { durationMin: hours.durationMin };
}

// Get or create default ScheduleConfig
async function getConfig() {
  let config = await prisma.scheduleConfig.findFirst();

  if (!config) {
    config = await prisma.scheduleConfig.create({ data: DEFAULT_CONFIG });
  }

  return config;
}

// Update schedule config (SUPER_ADMIN)
async function updateConfig(data: UpdateConfigInput) {
  const config = await getConfig();

  return prisma.scheduleConfig.update({
    where: { id: config.id },
    data,
  });
}

// Generate time slots for a given date.
// doctorId: when provided, only conflicts with calls for that doctor count as "booked".
// This allows multiple doctors to have consults in the same slot without interfering.
async function getAvailableSlots(date: string, doctorId?: string | null) {
  const config = await getConfig();
  const dayOfWeek = new Date(`${date}T12:00:00${SP_OFFSET}`).getDay();

  if (!config.availableDays.includes(dayOfWeek)) {
    return [];
  }

  // Generate all possible slots
  const slots: { time: string; available: boolean }[] = [];
  const totalMinutes = (config.endHour - config.startHour) * 60;

  for (let offset = 0; offset < totalMinutes; offset += config.slotDuration) {
    const hour = config.startHour + Math.floor(offset / 60);
    const minute = offset % 60;

    // Skip break period
    if (config.breakStart != null && config.breakEnd != null) {
      if (hour >= config.breakStart && hour < config.breakEnd) continue;
    }

    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    slots.push({ time, available: true });
  }

  // Fetch booked calls for this date (SP day boundaries)
  const { start: startOfDay, end: endOfDay } = spDayBounds(date);

  const where: any = {
    date: { gte: startOfDay, lte: endOfDay },
    status: { notIn: ['cancelled'] },
  };
  if (doctorId) where.doctorId = doctorId;

  const bookedCalls = await prisma.scheduledCall.findMany({
    where,
    select: { date: true },
  });

  // Convert booked call UTC dates to SP time strings
  const bookedTimes = new Set(
    bookedCalls.map((call) => spTimeStr(new Date(call.date))),
  );

  // Mark booked slots as unavailable
  for (const slot of slots) {
    if (bookedTimes.has(slot.time)) {
      slot.available = false;
    }
  }

  // Mark past slots as unavailable if date is today (SP timezone)
  const now = new Date();
  const nowSP = toSP(now);
  if (date === nowSP.dateStr) {
    const currentTime = `${String(nowSP.hours).padStart(2, '0')}:${String(nowSP.minutes).padStart(2, '0')}`;
    for (const slot of slots) {
      if (slot.time <= currentTime) {
        slot.available = false;
      }
    }
  }

  return slots;
}

// Return next N available dates (optimized: single DB query for all booked calls)
async function getAvailableDates() {
  const config = await getConfig();
  const dates: { date: string; dayOfWeek: number; availableSlots: number }[] = [];
  const todaySP = toSP(new Date()).dateStr;

  // Calculate date range (SP days)
  const startDate = new Date(`${todaySP}T00:00:00${SP_OFFSET}`);
  startDate.setDate(startDate.getDate() + 1);
  const endDate = new Date(`${todaySP}T23:59:59${SP_OFFSET}`);
  endDate.setDate(endDate.getDate() + config.maxDaysAhead);

  // Single query: fetch ALL booked calls in the range
  const bookedCalls = await prisma.scheduledCall.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { notIn: ['cancelled'] },
    },
    select: { date: true },
  });

  // Group booked times by SP date string
  const bookedByDate = new Map<string, Set<string>>();
  for (const call of bookedCalls) {
    const d = new Date(call.date);
    const sp = toSP(d);
    const dateStr = sp.dateStr;
    if (!bookedByDate.has(dateStr)) bookedByDate.set(dateStr, new Set());
    bookedByDate.get(dateStr)!.add(spTimeStr(d));
  }

  // Generate slots for each available day
  const totalMinutes = (config.endHour - config.startHour) * 60;
  const allSlotTimes: string[] = [];
  for (let offset = 0; offset < totalMinutes; offset += config.slotDuration) {
    const hour = config.startHour + Math.floor(offset / 60);
    const minute = offset % 60;
    if (config.breakStart != null && config.breakEnd != null) {
      if (hour >= config.breakStart && hour < config.breakEnd) continue;
    }
    allSlotTimes.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }

  // Iterate over next N days from SP "today"
  const baseDate = new Date(`${todaySP}T12:00:00${SP_OFFSET}`);
  for (let i = 1; i <= config.maxDaysAhead; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dayOfWeek = d.getDay();

    if (!config.availableDays.includes(dayOfWeek)) continue;

    const dateStr = toSP(d).dateStr;
    const bookedTimes = bookedByDate.get(dateStr) || new Set();
    const availableSlots = allSlotTimes.filter((t) => !bookedTimes.has(t)).length;

    if (availableSlots > 0) {
      dates.push({ date: dateStr, dayOfWeek, availableSlots });
    }
  }

  return dates;
}

// Book a call — auto-link to Customer by phone
async function bookCall(data: BookCallInput, tenantId?: string | null) {
  // If no time specified, pick the first available pre-generated slot for UI compat
  let time = data.time;
  if (!time) {
    const slots = await getAvailableSlots(data.date, data.doctorId);
    const firstAvailable = slots.find((s) => s.available);
    if (!firstAvailable) {
      throw new AppError(400, 'NO_SLOTS', 'Não há horários disponíveis nesta data');
    }
    time = firstAvailable.time;
  }

  // Validate against tenant working hours + per-doctor conflict (no pre-generated slot grid)
  const { durationMin } = await validateBookingWithinHours({
    tenantId,
    date: data.date,
    time,
    doctorId: data.doctorId,
  });

  // Build datetime — interpret time as São Paulo (UTC-3)
  const callDate = new Date(`${data.date}T${time}:00${SP_OFFSET}`);

  // Find or link existing lead by phone
  let lead = await prisma.lead.findFirst({
    where: { phone: data.phone },
  });

  // Auto-link to customer by phone (last 8 digits match)
  const phoneSuffix = data.phone.replace(/\D/g, '').slice(-8);
  let customer = data.customerId
    ? await prisma.customer.findFirst({ where: { id: data.customerId } })
    : await prisma.customer.findFirst({
        where: { phone: { contains: phoneSuffix } },
      });

  const call = await prisma.$transaction(async (tx) => {
    // Create the scheduled call
    // Resolve tenantId: explicit param > customer's tenant > null
    const resolvedTenantId = tenantId || customer?.tenantId || null;

    const scheduledCall = await tx.scheduledCall.create({
      data: {
        tenantId: resolvedTenantId ?? undefined,
        name: data.name,
        email: data.email ?? undefined,
        phone: data.phone,
        date: callDate,
        duration: durationMin,
        status: 'scheduled',
        notes: data.notes ?? undefined,
        leadId: lead?.id,
        customerId: customer?.id,
        doctorId: data.doctorId || undefined,
      },
    });

    // If lead exists, update stage and log activity
    if (lead) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { stage: 'CALL_SCHEDULED' },
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'call',
          description: `Call agendada para ${data.date} às ${time}`,
          metadata: { scheduledCallId: scheduledCall.id },
        },
      });
    }

    return scheduledCall;
  });

  // Send immediate WhatsApp confirmation (non-blocking)
  sendBookingConfirmation({
    id: call.id,
    name: data.name,
    phone: data.phone,
    date: callDate,
    duration: durationMin,
    leadId: lead?.id,
  }).catch((err) => console.error('[SCHEDULING] Confirmation send failed:', err));

  return call;
}

// List calls with pagination and filters
async function listCalls(tenantId: string, filters: {
  page: number;
  limit: number;
  skip: number;
  status?: string;
  date?: string;
  from?: string;
  to?: string;
}) {
  const where: Record<string, unknown> = { tenantId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.from && filters.to) {
    where.date = {
      gte: new Date(filters.from + 'T00:00:00' + SP_OFFSET),
      lte: new Date(filters.to + 'T23:59:59.999' + SP_OFFSET),
    };
  } else if (filters.date) {
    const startOfDay = new Date(filters.date + 'T00:00:00');
    const endOfDay = new Date(filters.date + 'T23:59:59');
    where.date = { gte: startOfDay, lte: endOfDay };
  }

  const [calls, total] = await Promise.all([
    prisma.scheduledCall.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true, stage: true, company: true } },
        customer: { select: { id: true, name: true, phone: true, email: true } },
        doctor: { select: { id: true, name: true } },
        procedures: { include: { tussProcedure: { select: { id: true, code: true, description: true, type: true, value: true } } } },
      },
      orderBy: { date: 'asc' },
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.scheduledCall.count({ where }),
  ]);

  return { calls, total };
}

// Get today's appointments for dashboard
async function getTodayAppointments(tenantId: string) {
  const todaySP = toSP(new Date()).dateStr;
  const { start: today, end: _ } = spDayBounds(todaySP);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  return prisma.scheduledCall.findMany({
    where: {
      tenantId,
      date: { gte: today, lt: tomorrow },
      status: { notIn: ['cancelled'] },
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { date: 'asc' },
  });
}

// Link TUSS procedures to a scheduled call (appends to any existing ones).
async function linkProcedures(id: string, tenantId: string, data: LinkProceduresInput) {
  const call = await prisma.scheduledCall.findUnique({ where: { id } });
  if (!call || call.tenantId !== tenantId) {
    throw new AppError(404, 'NOT_FOUND', 'Agendamento não encontrado');
  }

  // Validate all procedure IDs belong to this tenant
  const procIds = data.procedures.map((p) => p.tussProcedureId);
  const procs = await prisma.tussProcedure.findMany({
    where: { id: { in: procIds }, tenantId },
  });
  if (procs.length !== procIds.length) {
    throw new AppError(400, 'INVALID_PROCEDURE', 'Procedimento TUSS inválido');
  }

  await prisma.$transaction(async (tx) => {
    for (const p of data.procedures) {
      await tx.scheduledCallProcedure.create({
        data: {
          scheduledCallId: id,
          tussProcedureId: p.tussProcedureId,
          authorizationNumber: p.authorizationNumber || null,
        },
      });
    }
  });

  return prisma.scheduledCall.findUnique({
    where: { id },
    include: { procedures: { include: { tussProcedure: true } } },
  });
}

// Replace all TUSS procedures linked to a call. If the call is already completed,
// re-sync financial transactions to reflect the new procedures and doctor repasse.
async function replaceProcedures(id: string, tenantId: string, data: ReplaceProceduresInput) {
  const call = await prisma.scheduledCall.findUnique({ where: { id } });
  if (!call || call.tenantId !== tenantId) {
    throw new AppError(404, 'NOT_FOUND', 'Agendamento não encontrado');
  }

  // Validate all procedure IDs belong to this tenant
  if (data.procedures.length > 0) {
    const procIds = data.procedures.map((p) => p.tussProcedureId);
    const procs = await prisma.tussProcedure.findMany({
      where: { id: { in: procIds }, tenantId },
    });
    if (procs.length !== procIds.length) {
      throw new AppError(400, 'INVALID_PROCEDURE', 'Procedimento TUSS inválido');
    }
  }

  await prisma.$transaction(async (tx) => {
    // Remove existing procedure links
    await tx.scheduledCallProcedure.deleteMany({ where: { scheduledCallId: id } });

    // Create new ones
    for (const p of data.procedures) {
      await tx.scheduledCallProcedure.create({
        data: {
          scheduledCallId: id,
          tussProcedureId: p.tussProcedureId,
          authorizationNumber: p.authorizationNumber || null,
        },
      });
    }

    // If call is completed, re-sync financials (revert old + apply new)
    if (call.status === 'completed') {
      await revertFinancialsForCall(tx, id, tenantId);
      await applyFinancialsForCompletedCall(tx, id, tenantId);
    }
  });

  return prisma.scheduledCall.findUnique({
    where: { id },
    include: { procedures: { include: { tussProcedure: true } } },
  });
}

// Update the doctor assigned to a call. If already completed, re-sync financials
// so the doctor repasse expense reflects the new doctor.
async function updateCallDoctor(id: string, tenantId: string, doctorId: string | null | undefined) {
  const call = await prisma.scheduledCall.findUnique({ where: { id } });
  if (!call || call.tenantId !== tenantId) {
    throw new AppError(404, 'NOT_FOUND', 'Agendamento não encontrado');
  }

  // If assigning a doctor, validate it belongs to this tenant and has DOCTOR role
  if (doctorId) {
    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, tenantId, role: 'DOCTOR', isActive: true },
    });
    if (!doctor) {
      throw new AppError(400, 'INVALID_DOCTOR', 'Médico não encontrado ou inativo');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.scheduledCall.update({
      where: { id },
      data: { doctorId: doctorId || null },
    });

    // If completed, revert and re-apply financials with new doctor
    if (call.status === 'completed') {
      await revertFinancialsForCall(tx, id, tenantId);
      await applyFinancialsForCompletedCall(tx, id, tenantId);
    }

    return u;
  });

  return updated;
}

// Update authorization number for a call
async function updateCallAuthorization(id: string, tenantId: string, authorizationNumber: string | null | undefined) {
  const call = await prisma.scheduledCall.findUnique({ where: { id } });
  if (!call || call.tenantId !== tenantId) {
    throw new AppError(404, 'NOT_FOUND', 'Agendamento não encontrado');
  }

  return prisma.scheduledCall.update({
    where: { id },
    data: { authorizationNumber: authorizationNumber || null },
  });
}

// Create financial transactions (revenue + doctor repasse expenses) for a completed call.
// Idempotent: if entries already exist for this call, does nothing.
async function applyFinancialsForCompletedCall(tx: Prisma.TransactionClient, callId: string, tenantId: string) {
  const existing = await tx.financialTransaction.count({
    where: {
      tenantId,
      notes: { contains: AGENDAMENTO_TAG(callId) },
    },
  });
  if (existing > 0) return; // already processed

  const call = await tx.scheduledCall.findUnique({
    where: { id: callId },
    include: {
      customer: { select: { id: true, name: true } },
      doctor: { select: { id: true, name: true } },
      procedures: { include: { tussProcedure: true } },
    },
  });
  if (!call || call.procedures.length === 0) return;

  const dateIso = call.date.toISOString().slice(0, 10);
  const patientName = call.customer?.name || call.name;

  // Load doctor repasse percentages (if a doctor is assigned)
  let repasseMap = new Map<string, number>();
  if (call.doctorId) {
    const repasses = await tx.doctorRepasse.findMany({
      where: { tenantId, doctorId: call.doctorId },
    });
    repasseMap = new Map(repasses.map((r) => [r.procedureType, r.percentage]));
  }

  for (const p of call.procedures) {
    const proc = p.tussProcedure;
    const valor = Number(proc.value);

    // Revenue entry
    await tx.financialTransaction.create({
      data: {
        tenantId,
        type: 'INCOME',
        category: 'Procedimentos',
        description: `${proc.description} - ${patientName} - ${dateIso}`,
        amount: new Prisma.Decimal(valor),
        date: call.date,
        paymentMethod: 'DINHEIRO',
        customerId: call.customerId || undefined,
        status: 'PENDENTE',
        notes: `${AGENDAMENTO_TAG(callId)} [PROCEDIMENTO:${p.id}]`,
      },
    });

    // Doctor repasse expense
    if (call.doctorId && call.doctor) {
      const pct = repasseMap.get(proc.type) ?? 0;
      if (pct > 0) {
        const repasse = (valor * pct) / 100;
        await tx.financialTransaction.create({
          data: {
            tenantId,
            type: 'EXPENSE',
            category: 'Repasse Médico',
            description: `Repasse Dr. ${call.doctor.name} - ${proc.description} - ${dateIso}`,
            amount: new Prisma.Decimal(repasse),
            date: call.date,
            paymentMethod: 'TRANSFERENCIA',
            status: 'PENDENTE',
            notes: `${AGENDAMENTO_TAG(callId)} [REPASSE:${p.id}] [DOCTOR:${call.doctorId}]`,
          },
        });
      }
    }
  }
}

// Remove financial transactions tied to a scheduled call
async function revertFinancialsForCall(tx: Prisma.TransactionClient, callId: string, tenantId: string) {
  await tx.financialTransaction.deleteMany({
    where: {
      tenantId,
      notes: { contains: AGENDAMENTO_TAG(callId) },
    },
  });
}

// Update call status
async function updateCallStatus(id: string, data: UpdateCallStatusInput, tenantId?: string) {
  const call = await prisma.scheduledCall.findUnique({ where: { id } });

  if (!call || (tenantId && call.tenantId !== tenantId)) {
    throw new AppError(404, 'NOT_FOUND', 'Agendamento não encontrado');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedCall = await tx.scheduledCall.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes ?? call.notes,
      },
    });

    // If completed, create financial entries (revenue + repasse)
    if (data.status === 'completed' && call.tenantId) {
      await applyFinancialsForCompletedCall(tx, id, call.tenantId);
    }

    // If transitioning away from completed (e.g., cancelled/no_show), revert entries
    if (call.status === 'completed' && data.status !== 'completed' && call.tenantId) {
      await revertFinancialsForCall(tx, id, call.tenantId);
    }

    // If completed and linked to a lead, update lead stage
    if (data.status === 'completed' && call.leadId) {
      await tx.lead.update({
        where: { id: call.leadId },
        data: { stage: 'CALL_DONE' },
      });

      await tx.leadActivity.create({
        data: {
          leadId: call.leadId,
          type: 'call',
          description: `Call realizada em ${call.date.toISOString().slice(0, 10)}`,
          metadata: { scheduledCallId: id, status: data.status },
        },
      });
    }

    return updatedCall;
  });

  return updated;
}

// Cancel a call
async function cancelCall(id: string, tenantId?: string) {
  const call = await prisma.scheduledCall.findUnique({ where: { id } });

  if (!call || (tenantId && call.tenantId !== tenantId)) {
    throw new AppError(404, 'NOT_FOUND', 'Agendamento não encontrado');
  }

  if (call.status === 'cancelled') {
    throw new AppError(400, 'ALREADY_CANCELLED', 'Este agendamento já foi cancelado');
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Revert any financial entries previously created for this call
    if (call.tenantId) {
      await revertFinancialsForCall(tx, id, call.tenantId);
    }
    return tx.scheduledCall.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  });

  // Send cancellation notice via WhatsApp (non-blocking)
  sendCancellationNotice({
    id: call.id,
    name: call.name,
    phone: call.phone,
    date: call.date,
    leadId: call.leadId,
  }).catch((err) => console.error('[SCHEDULING] Cancellation notice failed:', err));

  return updated;
}

// ============================================================
// Inventory withdrawal for a completed appointment
// ============================================================
interface WithdrawMaterialInput {
  productId: string;
  quantity: number;
}

async function withdrawInventoryForCall(
  scheduledCallId: string,
  tenantId: string,
  materials: WithdrawMaterialInput[],
  userId?: string | null,
) {
  if (!Array.isArray(materials) || materials.length === 0) {
    throw new AppError(400, 'MATERIALS_REQUIRED', 'Pelo menos um material e obrigatorio');
  }

  // Validate the call exists and belongs to the tenant
  const call = await prisma.scheduledCall.findUnique({ where: { id: scheduledCallId } });
  if (!call || call.tenantId !== tenantId) {
    throw new AppError(404, 'CALL_NOT_FOUND', 'Agendamento nao encontrado');
  }

  // Idempotency — already processed?
  const existing = await prisma.inventoryMovement.findFirst({
    where: { tenantId, reference: scheduledCallId, type: 'OUT' },
    select: { id: true },
  });
  if (existing) {
    return { alreadyProcessed: true as const, movements: [] as any[] };
  }

  // Aggregate quantities per product (in case the same product appears twice)
  const aggregated = new Map<string, number>();
  for (const m of materials) {
    if (!m.productId || typeof m.quantity !== 'number' || m.quantity <= 0) {
      throw new AppError(400, 'INVALID_MATERIAL', 'Material invalido (productId e quantity > 0 obrigatorios)');
    }
    aggregated.set(m.productId, (aggregated.get(m.productId) || 0) + m.quantity);
  }

  // Pre-validate: load all products + check ownership + stock availability
  const productIds = Array.from(aggregated.keys());
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, tenantId: true, name: true, quantity: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const productId of productIds) {
    const p = productMap.get(productId);
    if (!p) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `Produto nao encontrado: ${productId}`);
    }
    if (p.tenantId !== tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Produto nao pertence ao tenant');
    }
    const required = aggregated.get(productId)!;
    if (p.quantity < required) {
      throw new AppError(
        400,
        'INSUFFICIENT_STOCK',
        `Estoque insuficiente para o produto: ${p.name}`,
      );
    }
  }

  // Apply in a single transaction
  const movements = await prisma.$transaction(async (tx) => {
    const created: any[] = [];
    for (const [productId, quantity] of aggregated.entries()) {
      const mv = await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId,
          type: 'OUT',
          quantity,
          reason: 'Uso em procedimento',
          reference: scheduledCallId,
          userId: userId || null,
        },
      });
      await tx.product.update({
        where: { id: productId },
        data: { quantity: { decrement: quantity } },
      });
      created.push(mv);
    }
    return created;
  });

  return { alreadyProcessed: false as const, movements };
}

export const schedulingService = {
  getConfig,
  updateConfig,
  getAvailableSlots,
  getAvailableDates,
  bookCall,
  listCalls,
  getTodayAppointments,
  updateCallStatus,
  cancelCall,
  linkProcedures,
  replaceProcedures,
  updateCallDoctor,
  updateCallAuthorization,
  withdrawInventoryForCall,
};
