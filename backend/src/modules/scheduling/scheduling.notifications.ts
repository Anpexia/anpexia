import prisma from '../../config/database';
import { evolutionApi } from '../messaging/evolution.client';
import { env } from '../../config/env';

const TAG = '[SCHEDULING-NOTIFY]';

async function resolveInstance(tenantId?: string | null): Promise<string | null> {
  if (tenantId) {
    const config = await prisma.chatbotConfig.findFirst({
      where: { tenantId },
      select: { instanceName: true },
    });
    if (config?.instanceName) return config.instanceName;
  }
  return 'anpexia';
}

function isWhatsAppConfigured(): boolean {
  return !!(env.evolutionApiUrl && env.evolutionApiKey && !env.evolutionApiUrl.includes('localhost'));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

function formatDayOfWeek(date: Date): string {
  const days = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
  const spDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return days[spDate.getDay()];
}

async function getDoctorName(doctorId: string | null | undefined): Promise<string | null> {
  if (!doctorId) return null;
  const doctor = await prisma.user.findUnique({ where: { id: doctorId }, select: { name: true } });
  return doctor?.name || null;
}

async function getTenantAddress(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { address: true } });
  return (tenant as any)?.address || null;
}

/**
 * Send immediate confirmation after booking
 */
export async function sendBookingConfirmation(call: {
  id: string;
  name: string;
  phone: string;
  date: Date;
  duration: number;
  leadId?: string | null;
  tenantId?: string | null;
  tenantName?: string;
  doctorName?: string;
}) {
  const dateStr = formatDate(call.date);
  const timeStr = formatTime(call.date);
  const dayOfWeek = formatDayOfWeek(call.date);
  const doctorLine = call.doctorName ? `\n👨‍⚕️ ${call.doctorName}` : '';

  const body =
    `Agendamento confirmado! ✅\n\n` +
    `📅 ${dayOfWeek}, ${dateStr} as ${timeStr}` +
    doctorLine +
    `\n\nVoce recebera um lembrete antes da consulta.`;

  if (isWhatsAppConfigured()) {
    const instance = await resolveInstance(call.tenantId);
    if (instance) {
      try {
        await evolutionApi.sendText(instance, call.phone, body);
        console.log(`${TAG} Booking confirmation sent to ${call.phone}`);
      } catch (err) {
        console.error(`${TAG} Failed to send booking confirmation:`, err);
      }
    }
  }

  if (call.leadId) {
    await prisma.leadActivity.create({
      data: {
        leadId: call.leadId,
        type: 'message_sent',
        description: `Confirmacao de agendamento enviada para ${dateStr} as ${timeStr}`,
        metadata: { callId: call.id, type: 'booking_confirmation' },
      },
    });
  }
}

/**
 * Send cancellation notification
 */
export async function sendCancellationNotice(call: {
  id: string;
  name: string;
  phone: string;
  date: Date;
  leadId?: string | null;
  tenantId?: string | null;
}) {
  const dateStr = formatDate(call.date);
  const timeStr = formatTime(call.date);

  const body = `Sua consulta de ${dateStr} as ${timeStr} foi cancelada.\n\nQuando quiser reagendar, e so mandar mensagem novamente!`;

  if (isWhatsAppConfigured()) {
    const instance = await resolveInstance(call.tenantId);
    if (instance) {
      try {
        await evolutionApi.sendText(instance, call.phone, body);
        console.log(`${TAG} Cancellation notice sent to ${call.phone}`);
      } catch (err) {
        console.error(`${TAG} Failed to send cancellation notice:`, err);
      }
    }
  }
}

/**
 * Send 48h reminder with confirmation options
 */
export async function sendReminder48h(call: {
  id: string;
  name: string;
  patientName?: string;
  phone: string;
  date: Date;
  leadId: string | null;
  tenantId?: string | null;
  doctorId?: string | null;
}) {
  const dateStr = formatDate(call.date);
  const timeStr = formatTime(call.date);
  const dayOfWeek = formatDayOfWeek(call.date);
  const doctorName = await getDoctorName(call.doctorId);
  const doctorLine = doctorName ? `\n👨‍⚕️ ${doctorName}` : '';

  const greeting = call.patientName
    ? `Ola ${call.name}! Lembrete da consulta de ${call.patientName}:`
    : `Ola ${call.name}! Lembrete da sua consulta:`;

  const body =
    `${greeting}\n\n` +
    `📅 ${dayOfWeek}, ${dateStr} as ${timeStr}` +
    doctorLine +
    `\n\nPodemos contar com ${call.patientName ? 'a presenca' : 'sua presenca'}?\n\n` +
    `1 - Confirmar presenca\n` +
    `2 - Cancelar\n` +
    `3 - Reagendar`;

  if (isWhatsAppConfigured()) {
    const instance = await resolveInstance(call.tenantId);
    if (instance) {
      try {
        await evolutionApi.sendText(instance, call.phone, body);
        console.log(`${TAG} 48h reminder sent to ${call.phone}`);
      } catch (err) {
        console.error(`${TAG} 48h reminder failed:`, err);
      }
    }
  }

  if (call.leadId) {
    await prisma.leadActivity.create({
      data: {
        leadId: call.leadId,
        type: 'message_sent',
        description: `Lembrete 48h enviado: ${dateStr} as ${timeStr}`,
        metadata: { callId: call.id, reminderType: 'REMINDER_48H' },
      },
    });
  }
}

/**
 * Send 2h reminder with clinic address
 */
export async function sendReminder2h(call: {
  id: string;
  name: string;
  patientName?: string;
  phone: string;
  date: Date;
  leadId: string | null;
  tenantId?: string | null;
  doctorId?: string | null;
}) {
  const timeStr = formatTime(call.date);
  const doctorName = await getDoctorName(call.doctorId);
  const doctorLine = doctorName ? `\n👨‍⚕️ ${doctorName}` : '';
  const address = await getTenantAddress(call.tenantId);
  const addressLine = address ? `\n\nEndereco: ${address}` : '';

  const consultaRef = call.patientName
    ? `A consulta de ${call.patientName} e em 2 horas!`
    : `Sua consulta e em 2 horas!`;

  const body =
    `${consultaRef} ⏰\n\n` +
    `📅 Hoje as ${timeStr}` +
    doctorLine +
    addressLine +
    `\n\nNos vemos em breve! 😊`;

  if (isWhatsAppConfigured()) {
    const instance = await resolveInstance(call.tenantId);
    if (instance) {
      try {
        await evolutionApi.sendText(instance, call.phone, body);
        console.log(`${TAG} 2h reminder sent to ${call.phone}`);
      } catch (err) {
        console.error(`${TAG} 2h reminder failed:`, err);
      }
    }
  }

  if (call.leadId) {
    await prisma.leadActivity.create({
      data: {
        leadId: call.leadId,
        type: 'message_sent',
        description: `Lembrete 2h enviado: ${timeStr}`,
        metadata: { callId: call.id, reminderType: 'REMINDER_2H' },
      },
    });
  }
}

/**
 * Handle incoming WhatsApp reply for appointment flow
 * Handles both text replies and button IDs from reminders
 */
export async function handleAppointmentReply(phone: string, message: string, tenantId?: string | null): Promise<string | null> {
  const msg = message.trim().toUpperCase();

  // Only handle direct replies to reminders (1/2/3 or keywords)
  const isReminderReply = ['1', '2', '3', 'SIM', 'CONFIRMAR', 'CONFIRMO', 'OK',
    'CANCELAR', 'CANCELA', 'REAGENDAR', 'REMARCAR',
    'BTN_CONFIRM', 'BTN_CANCEL', 'BTN_RESCHEDULE', 'BTN_OK',
    'CONFIRMAR PRESENCA', 'OK, ESTAREI LA', 'PRECISO CANCELAR'].includes(msg);

  if (!isReminderReply) return null;

  const where: any = {
    phone: { contains: phone.slice(-8) },
    status: { in: ['scheduled', 'confirmed'] },
    date: { gte: new Date() },
  };
  if (tenantId) where.tenantId = tenantId;

  const activeCall = await prisma.scheduledCall.findFirst({
    where,
    orderBy: { date: 'asc' },
  });

  if (!activeCall) return null;

  const dateStr = formatDate(activeCall.date);
  const timeStr = formatTime(activeCall.date);

  // CONFIRM
  if (['1', 'SIM', 'CONFIRMAR', 'CONFIRMO', 'OK', 'BTN_CONFIRM', 'BTN_OK',
       'CONFIRMAR PRESENCA', 'OK, ESTAREI LA'].includes(msg)) {
    await prisma.scheduledCall.update({
      where: { id: activeCall.id },
      data: { status: 'confirmed' },
    });
    return `Perfeito, ${activeCall.name}! Sua consulta de ${dateStr} as ${timeStr} esta confirmada. Ate la! 😊`;
  }

  // CANCEL
  if (['2', 'CANCELAR', 'CANCELA', 'BTN_CANCEL', 'PRECISO CANCELAR'].includes(msg)) {
    await prisma.scheduledCall.update({
      where: { id: activeCall.id },
      data: { status: 'cancelled' },
    });
    await sendCancellationNotice({
      id: activeCall.id,
      name: activeCall.name,
      phone: activeCall.phone,
      date: activeCall.date,
      leadId: activeCall.leadId,
      tenantId: activeCall.tenantId,
    });
    return null;
  }

  // RESCHEDULE
  if (['3', 'REAGENDAR', 'REMARCAR', 'BTN_RESCHEDULE', 'BTN_REBOOK'].includes(msg)) {
    await prisma.scheduledCall.update({
      where: { id: activeCall.id },
      data: { status: 'cancelled' },
    });
    return `Sua consulta de ${dateStr} as ${timeStr} foi cancelada. Para reagendar, envie qualquer mensagem e escolha "Agendar consulta".`;
  }

  return null;
}
