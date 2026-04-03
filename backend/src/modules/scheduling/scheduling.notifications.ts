import prisma from '../../config/database';
import { evolutionApi } from '../messaging/evolution.client';
import { env } from '../../config/env';

const TAG = '[SCHEDULING-NOTIFY]';

// ScheduledCalls are sales pipeline appointments (pre-tenant), so they use the global instance
const SALES_INSTANCE = 'anpexia';

function isWhatsAppConfigured(): boolean {
  return !!(env.evolutionApiUrl && env.evolutionApiKey && !env.evolutionApiUrl.includes('localhost'));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

/**
 * Send immediate confirmation after booking — with buttons
 */
export async function sendBookingConfirmation(call: {
  id: string;
  name: string;
  phone: string;
  date: Date;
  duration: number;
  leadId?: string | null;
}) {
  const dateStr = formatDate(call.date);
  const timeStr = formatTime(call.date);

  const body =
    `Oi ${call.name}, seu agendamento foi realizado com sucesso!\n\n` +
    `Data: ${dateStr}\n` +
    `Horario: ${timeStr}\n` +
    `Duracao: ${call.duration} minutos\n\n` +
    `Voce recebera um lembrete antes da consulta.`;

  if (isWhatsAppConfigured()) {
    try {
      await evolutionApi.sendButtons(SALES_INSTANCE, call.phone, body, [
        { id: 'btn_confirm', text: 'Confirmar presenca' },
        { id: 'btn_cancel', text: 'Cancelar consulta' },
      ], 'Consulta agendada!');
      console.log(`${TAG} Booking confirmation sent to ${call.phone}`);
    } catch (err) {
      // Fallback to plain text if buttons fail
      try {
        await evolutionApi.sendText(SALES_INSTANCE, call.phone,
          `✅ Consulta agendada!\n\n${body}\n\nResponda CONFIRMAR ou CANCELAR.`);
      } catch {}
      console.error(`${TAG} Failed to send booking confirmation:`, err);
    }
  } else {
    console.log(`${TAG} [DRY-RUN] Would send to ${call.phone}: ${body.slice(0, 60)}...`);
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
 * Send cancellation notification — with button to rebook
 */
export async function sendCancellationNotice(call: {
  id: string;
  name: string;
  phone: string;
  date: Date;
  leadId?: string | null;
}) {
  const dateStr = formatDate(call.date);
  const timeStr = formatTime(call.date);

  const body = `Sua consulta de ${dateStr} as ${timeStr} foi cancelada.\n\nQuando quiser reagendar, estamos aqui!`;

  if (isWhatsAppConfigured()) {
    try {
      await evolutionApi.sendButtons(SALES_INSTANCE, call.phone, body, [
        { id: 'btn_rebook', text: 'Agendar nova consulta' },
        { id: 'btn_ok', text: 'Ok, obrigado' },
      ], 'Consulta cancelada');
      console.log(`${TAG} Cancellation notice sent to ${call.phone}`);
    } catch (err) {
      try {
        await evolutionApi.sendText(SALES_INSTANCE, call.phone,
          `Consulta cancelada.\n\n${body}\n\nResponda AGENDAR para reagendar.`);
      } catch {}
      console.error(`${TAG} Failed to send cancellation notice:`, err);
    }
  } else {
    console.log(`${TAG} [DRY-RUN] Would send cancellation to ${call.phone}`);
  }

  await notifyWaitList(call.date);
}

/**
 * When a slot opens, notify recently cancelled customers
 */
async function notifyWaitList(freedDate: Date) {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentCancelled = await prisma.scheduledCall.findMany({
      where: {
        status: 'cancelled',
        updatedAt: { gte: sevenDaysAgo },
        date: { gte: new Date() },
      },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    });

    if (!isWhatsAppConfigured() || recentCancelled.length === 0) return;

    const dateStr = formatDate(freedDate);
    const timeStr = formatTime(freedDate);

    for (const cancelled of recentCancelled) {
      const body = `Oi ${cancelled.name}! Um horario acabou de abrir: ${dateStr} as ${timeStr}.`;

      try {
        await evolutionApi.sendButtons(SALES_INSTANCE, cancelled.phone, body, [
          { id: 'btn_confirm', text: 'Quero agendar' },
          { id: 'btn_no', text: 'Nao, obrigado' },
        ], 'Vaga disponivel!');
        console.log(`${TAG} Wait list notification sent to ${cancelled.phone}`);
      } catch (err) {
        try {
          await evolutionApi.sendText(SALES_INSTANCE, cancelled.phone,
            `${body} Deseja agendar? Responda SIM para confirmar.`);
        } catch {}
        console.error(`${TAG} Wait list notification failed:`, err);
      }
    }
  } catch (err) {
    console.error(`${TAG} notifyWaitList error:`, err);
  }
}

/**
 * Send 48h reminder — with buttons
 */
export async function sendReminder48h(call: {
  id: string;
  name: string;
  phone: string;
  date: Date;
  leadId: string | null;
}) {
  const dateStr = formatDate(call.date);
  const timeStr = formatTime(call.date);

  const body = `Sua consulta e amanha, ${dateStr}, as ${timeStr}.\n\nPodemos confirmar sua presenca?`;

  if (isWhatsAppConfigured()) {
    try {
      await evolutionApi.sendButtons(SALES_INSTANCE, call.phone, body, [
        { id: 'btn_confirm', text: 'Confirmar presenca' },
        { id: 'btn_cancel', text: 'Cancelar consulta' },
        { id: 'btn_reschedule', text: 'Reagendar' },
      ], 'Lembrete de consulta');
    } catch (err) {
      try {
        await evolutionApi.sendText(SALES_INSTANCE, call.phone,
          `⏰ Lembrete: ${body}\n\nResponda CONFIRMAR, CANCELAR ou REAGENDAR.`);
      } catch {}
      console.error(`${TAG} 48h reminder failed:`, err);
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
 * Send 2h reminder — with buttons
 */
export async function sendReminder2h(call: {
  id: string;
  name: string;
  phone: string;
  date: Date;
  leadId: string | null;
}) {
  const timeStr = formatTime(call.date);

  const body = `${call.name}, sua consulta e em 2 horas, as ${timeStr}!\n\nChegue 10 minutos antes para o check-in.`;

  if (isWhatsAppConfigured()) {
    try {
      await evolutionApi.sendButtons(SALES_INSTANCE, call.phone, body, [
        { id: 'btn_ok', text: 'Ok, estarei la' },
        { id: 'btn_cancel', text: 'Preciso cancelar' },
      ], 'Consulta em breve!');
    } catch (err) {
      try {
        await evolutionApi.sendText(SALES_INSTANCE, call.phone,
          `🏥 ${body}\n\nResponda OK ou CANCELAR.`);
      } catch {}
      console.error(`${TAG} 2h reminder failed:`, err);
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
 * Send post-consultation follow-up (2h after) — with buttons
 */
export async function sendPostConsultation(call: {
  id: string;
  name: string;
  phone: string;
  leadId: string | null;
}) {
  const body = `Como foi sua consulta, ${call.name}?\n\nQueremos saber se esta tudo bem com voce.`;

  if (isWhatsAppConfigured()) {
    try {
      await evolutionApi.sendButtons(SALES_INSTANCE, call.phone, body, [
        { id: 'btn_fine', text: 'Estou bem' },
        { id: 'btn_doubt', text: 'Tenho duvida' },
        { id: 'btn_return', text: 'Quero retorno' },
      ], 'Pos-consulta');
    } catch (err) {
      try {
        await evolutionApi.sendText(SALES_INSTANCE, call.phone,
          `${body}\n\nResponda:\n1 - Estou bem\n2 - Tenho duvida\n3 - Quero retorno`);
      } catch {}
      console.error(`${TAG} Post-consultation failed:`, err);
    }
  }

  if (call.leadId) {
    await prisma.leadActivity.create({
      data: {
        leadId: call.leadId,
        type: 'message_sent',
        description: `Pos-consulta enviado para ${call.name}`,
        metadata: { callId: call.id, reminderType: 'POST_CONSULTATION' },
      },
    });
  }
}

/**
 * Handle incoming WhatsApp reply for appointment flow
 * Handles both text replies and button IDs
 */
export async function handleAppointmentReply(phone: string, message: string): Promise<string | null> {
  const msg = message.trim().toUpperCase();

  const activeCall = await prisma.scheduledCall.findFirst({
    where: {
      phone: { contains: phone.slice(-8) },
      status: { in: ['scheduled', 'confirmed'] },
      date: { gte: new Date() },
    },
    orderBy: { date: 'asc' },
  });

  if (!activeCall) return null;

  const dateStr = formatDate(activeCall.date);
  const timeStr = formatTime(activeCall.date);

  // CONFIRM (text or button)
  if (['SIM', 'CONFIRMAR', 'CONFIRMO', 'OK', 'BTN_CONFIRM', 'BTN_OK'].includes(msg) ||
      msg === 'CONFIRMAR PRESENCA' || msg === 'OK, ESTAREI LA') {
    await prisma.scheduledCall.update({
      where: { id: activeCall.id },
      data: { status: 'confirmed' },
    });
    return `Perfeito, ${activeCall.name}! Sua consulta de ${dateStr} as ${timeStr} esta confirmada. Ate la!`;
  }

  // CANCEL (text or button)
  if (['CANCELAR', 'CANCELA', 'NAO', 'BTN_CANCEL', 'PRECISO CANCELAR'].includes(msg)) {
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
    });
    return null; // cancellation notice sent with buttons already
  }

  // RESCHEDULE (text or button)
  if (['REAGENDAR', 'REMARCAR', 'BTN_RESCHEDULE', 'BTN_REBOOK', 'AGENDAR', 'AGENDAR NOVA CONSULTA'].includes(msg)) {
    return `Para reagendar, digite *menu* e escolha "Agendar consulta". Vamos encontrar o melhor horario para voce!`;
  }

  // POST-CONSULTATION replies
  if (['ESTOU BEM', 'BTN_FINE', '1'].includes(msg)) {
    return `Que bom saber, ${activeCall.name}! Se precisar de algo, estamos aqui. Ate a proxima!`;
  }

  if (['TENHO DUVIDA', 'BTN_DOUBT', '2'].includes(msg)) {
    return '__HANDOFF__'; // Forward to human agent
  }

  if (['QUERO RETORNO', 'BTN_RETURN', '3'].includes(msg)) {
    return `Vamos agendar seu retorno! Digite *menu* e escolha "Agendar consulta".`;
  }

  return null;
}
