import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { BookCallInput, UpdateConfigInput, UpdateCallStatusInput } from './scheduling.validators';
import { sendBookingConfirmation, sendCancellationNotice } from './scheduling.notifications';

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

// Generate time slots for a given date
async function getAvailableSlots(date: string) {
  const config = await getConfig();
  const dayOfWeek = new Date(date + 'T12:00:00').getDay();

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

  // Fetch booked calls for this date
  const startOfDay = new Date(date + 'T00:00:00');
  const endOfDay = new Date(date + 'T23:59:59');

  const bookedCalls = await prisma.scheduledCall.findMany({
    where: {
      date: { gte: startOfDay, lte: endOfDay },
      status: { notIn: ['cancelled'] },
    },
    select: { date: true },
  });

  const bookedTimes = new Set(
    bookedCalls.map((call) => {
      const d = new Date(call.date);
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    }),
  );

  // Mark booked slots as unavailable
  for (const slot of slots) {
    if (bookedTimes.has(slot.time)) {
      slot.available = false;
    }
  }

  // Mark past slots as unavailable if date is today
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (date === today) {
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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
  const today = new Date();

  // Calculate date range
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + 1);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + config.maxDaysAhead);

  // Single query: fetch ALL booked calls in the range
  const bookedCalls = await prisma.scheduledCall.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { notIn: ['cancelled'] },
    },
    select: { date: true },
  });

  // Group booked times by date string
  const bookedByDate = new Map<string, Set<string>>();
  for (const call of bookedCalls) {
    const d = new Date(call.date);
    const dateStr = d.toISOString().slice(0, 10);
    if (!bookedByDate.has(dateStr)) bookedByDate.set(dateStr, new Set());
    bookedByDate.get(dateStr)!.add(
      `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    );
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

  for (let i = 1; i <= config.maxDaysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayOfWeek = d.getDay();

    if (!config.availableDays.includes(dayOfWeek)) continue;

    const dateStr = d.toISOString().slice(0, 10);
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
  const config = await getConfig();

  // Validate date is available
  const dayOfWeek = new Date(data.date + 'T12:00:00').getDay();
  if (!config.availableDays.includes(dayOfWeek)) {
    throw new AppError(400, 'INVALID_DATE', 'Esta data não está disponível para agendamento');
  }

  // If no time specified, pick the first available slot
  let time = data.time;
  if (!time) {
    const slots = await getAvailableSlots(data.date);
    const firstAvailable = slots.find((s) => s.available);
    if (!firstAvailable) {
      throw new AppError(400, 'NO_SLOTS', 'Não há horários disponíveis nesta data');
    }
    time = firstAvailable.time;
  }

  // Validate slot is available
  const slots = await getAvailableSlots(data.date);
  const targetSlot = slots.find((s) => s.time === time);
  if (!targetSlot) {
    throw new AppError(400, 'INVALID_TIME', 'Este horário não existe na agenda');
  }
  if (!targetSlot.available) {
    throw new AppError(400, 'SLOT_TAKEN', 'Este horário já está ocupado');
  }

  // Build datetime
  const [hour, minute] = time.split(':').map(Number);
  const callDate = new Date(data.date + 'T00:00:00Z');
  callDate.setUTCHours(hour, minute, 0, 0);

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
        duration: config.slotDuration,
        status: 'scheduled',
        notes: data.notes ?? undefined,
        leadId: lead?.id,
        customerId: customer?.id,
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
    duration: config.slotDuration,
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
}) {
  const where: Record<string, unknown> = { tenantId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.date) {
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

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

  const updated = await prisma.scheduledCall.update({
    where: { id },
    data: { status: 'cancelled' },
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
};
