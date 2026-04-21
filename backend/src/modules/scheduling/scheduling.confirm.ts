import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { evolutionApi } from '../messaging/evolution.client';
import { env } from '../../config/env';

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

/**
 * Handle patient response to appointment confirmation
 * Actions: confirm | cancel | cancel_confirm | keep
 */
export async function handleConfirmResponse(
  appointmentId: string,
  action: 'confirm' | 'cancel' | 'cancel_confirm' | 'keep',
) {
  const call = await prisma.scheduledCall.findUnique({
    where: { id: appointmentId },
    include: { tenant: { select: { name: true, phone: true } } },
  });

  if (!call) {
    throw new AppError(404, 'NOT_FOUND', 'Agendamento nao encontrado');
  }

  const instance = await resolveInstance(call.tenantId);
  const dateStr = formatDate(call.date);
  const timeStr = formatTime(call.date);

  switch (action) {
    case 'confirm': {
      await prisma.scheduledCall.update({
        where: { id: appointmentId },
        data: { status: 'confirmed', cancelConfirmPending: false },
      });

      const msg = `Presenca confirmada! ✅ Te esperamos no dia ${dateStr} as ${timeStr}.`;

      if (isWhatsAppConfigured()) {
        try {
          await evolutionApi.sendText(instance!, call.phone, msg);
        } catch (err) {
          console.error('[CONFIRM] Failed to send confirmation:', err);
        }
      }

      return { status: 'confirmed', message: msg };
    }

    case 'cancel': {
      await prisma.scheduledCall.update({
        where: { id: appointmentId },
        data: { cancelConfirmPending: true },
      });

      const msg = 'Tem certeza que deseja cancelar? Escolha:';

      if (isWhatsAppConfigured()) {
        try {
          await evolutionApi.sendButtons(instance!, call.phone, msg, [
            { id: 'btn_cancel_yes', text: 'Sim, cancelar consulta' },
            { id: 'btn_cancel_no', text: 'Nao, manter consulta' },
          ], 'Confirmar cancelamento');
        } catch (err) {
          console.error('[CONFIRM] Failed to send cancel confirmation:', err);
        }
      }

      return { status: 'pending_cancel', message: msg };
    }

    case 'cancel_confirm': {
      await prisma.scheduledCall.update({
        where: { id: appointmentId },
        data: { status: 'cancelled', cancelConfirmPending: false },
      });

      const patientMsg = `Consulta cancelada. Quando quiser reagendar, estamos aqui! 📞`;

      if (isWhatsAppConfigured()) {
        try {
          await evolutionApi.sendText(instance!, call.phone, patientMsg);
        } catch (err) {
          console.error('[CONFIRM] Failed to send cancel notice to patient:', err);
        }

        // Notify clinic
        const clinicPhone = (call.tenant as any)?.phone;
        if (clinicPhone) {
          const clinicMsg = `⚠️ O paciente ${call.name} cancelou a consulta do dia ${dateStr} as ${timeStr}.`;
          try {
            await evolutionApi.sendText(instance!, clinicPhone, clinicMsg);
          } catch (err) {
            console.error('[CONFIRM] Failed to notify clinic:', err);
          }
        }
      }

      return { status: 'cancelled', message: patientMsg };
    }

    case 'keep': {
      await prisma.scheduledCall.update({
        where: { id: appointmentId },
        data: { cancelConfirmPending: false },
      });

      const msg = `Otimo! Sua consulta do dia ${dateStr} as ${timeStr} continua confirmada. ✅`;

      if (isWhatsAppConfigured()) {
        try {
          await evolutionApi.sendText(instance!, call.phone, msg);
        } catch (err) {
          console.error('[CONFIRM] Failed to send keep notice:', err);
        }
      }

      return { status: 'kept', message: msg };
    }

    default:
      throw new AppError(400, 'INVALID_ACTION', 'Acao invalida. Use: confirm, cancel, cancel_confirm, keep');
  }
}
