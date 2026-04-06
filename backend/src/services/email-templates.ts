import { sendEmail } from './email.service';
import prisma from '../config/database';

async function isEmailEnabled(tenantId: string, template: string): Promise<boolean> {
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (!settings?.emailEnabled) return false;

  const map: Record<string, boolean | undefined> = {
    welcome: settings.emailWelcome ?? undefined,
    confirmacao: settings.emailConfirmacao ?? undefined,
    lembrete: settings.emailLembrete ?? undefined,
    cancelamento: settings.emailCancelamento ?? undefined,
  };

  return map[template] !== false;
}

function baseLayout(tenantName: string, content: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden">
      <div style="background:#1E3A5F;padding:20px 24px">
        <h1 style="color:#fff;margin:0;font-size:20px">${tenantName}</h1>
      </div>
      <div style="padding:24px">
        ${content}
      </div>
      <div style="background:#f8f9fa;padding:16px 24px;border-top:1px solid #eee">
        <p style="color:#888;font-size:12px;margin:0">Enviado por ${tenantName} via Anpexia</p>
        <p style="color:#aaa;font-size:11px;margin:4px 0 0">&copy; 2026 Anpexia &mdash; anpexia.com.br</p>
      </div>
    </div>
  `;
}

export async function sendWelcomeEmail(tenantId: string, patient: { name: string; email: string }) {
  if (!await isEmailEnabled(tenantId, 'welcome')) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const tenantName = tenant?.name || 'Nossa Clinica';

  const html = baseLayout(tenantName, `
    <h2 style="color:#1E3A5F;margin-top:0">Bem-vindo(a), ${patient.name}!</h2>
    <p>E um prazer te-lo(a) como paciente da <strong>${tenantName}</strong>.</p>
    <p>A partir de agora voce podera contar com nossos servicos para cuidar da sua saude.</p>
    <p>Se precisar de algo, entre em contato conosco${tenant?.phone ? ` pelo telefone <strong>${tenant.phone}</strong>` : ''}.</p>
    <p style="margin-top:24px">Atenciosamente,<br/><strong>Equipe ${tenantName}</strong></p>
  `);

  return sendEmail({ to: patient.email, subject: `Bem-vindo(a) a ${tenantName}!`, html });
}

export async function sendAppointmentConfirmationEmail(
  tenantId: string,
  data: { name: string; email: string; date: Date; time?: string },
) {
  if (!await isEmailEnabled(tenantId, 'confirmacao')) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const tenantName = tenant?.name || 'Nossa Clinica';

  const dateStr = new Date(data.date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = data.time || new Date(data.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const html = baseLayout(tenantName, `
    <h2 style="color:#1E3A5F;margin-top:0">Consulta Confirmada</h2>
    <p>Ola, <strong>${data.name}</strong>!</p>
    <p>Sua consulta foi agendada com sucesso:</p>
    <div style="background:#f0f7ff;border-left:4px solid #1E3A5F;padding:16px;margin:16px 0;border-radius:4px">
      <p style="margin:0"><strong>Data:</strong> ${dateStr}</p>
      <p style="margin:4px 0 0"><strong>Horario:</strong> ${timeStr}</p>
    </div>
    <p>Em caso de imprevisto, entre em contato para reagendar${tenant?.phone ? `: <strong>${tenant.phone}</strong>` : '.'}.</p>
    <p style="margin-top:24px">Atenciosamente,<br/><strong>Equipe ${tenantName}</strong></p>
  `);

  return sendEmail({ to: data.email, subject: `Consulta confirmada - ${tenantName}`, html });
}

export async function sendAppointmentReminderEmail(
  tenantId: string,
  data: { name: string; email: string; date: Date },
) {
  if (!await isEmailEnabled(tenantId, 'lembrete')) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const tenantName = tenant?.name || 'Nossa Clinica';

  const dateStr = new Date(data.date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const timeStr = new Date(data.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const html = baseLayout(tenantName, `
    <h2 style="color:#1E3A5F;margin-top:0">Lembrete de Consulta</h2>
    <p>Ola, <strong>${data.name}</strong>!</p>
    <p>Estamos passando para lembrar da sua consulta:</p>
    <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:16px;margin:16px 0;border-radius:4px">
      <p style="margin:0"><strong>Data:</strong> ${dateStr}</p>
      <p style="margin:4px 0 0"><strong>Horario:</strong> ${timeStr}</p>
    </div>
    <p>Contamos com sua presenca!</p>
    <p style="margin-top:24px">Atenciosamente,<br/><strong>Equipe ${tenantName}</strong></p>
  `);

  return sendEmail({ to: data.email, subject: `Lembrete: sua consulta amanha - ${tenantName}`, html });
}

export async function sendCancellationEmail(
  tenantId: string,
  data: { name: string; email: string; date: Date },
) {
  if (!await isEmailEnabled(tenantId, 'cancelamento')) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const tenantName = tenant?.name || 'Nossa Clinica';

  const dateStr = new Date(data.date).toLocaleDateString('pt-BR');

  const html = baseLayout(tenantName, `
    <h2 style="color:#1E3A5F;margin-top:0">Consulta Cancelada</h2>
    <p>Ola, <strong>${data.name}</strong>.</p>
    <p>Sua consulta agendada para <strong>${dateStr}</strong> foi cancelada.</p>
    <p>Se desejar remarcar, entre em contato conosco${tenant?.phone ? ` pelo telefone <strong>${tenant.phone}</strong>` : ''}.</p>
    <p style="margin-top:24px">Atenciosamente,<br/><strong>Equipe ${tenantName}</strong></p>
  `);

  return sendEmail({ to: data.email, subject: `Consulta cancelada - ${tenantName}`, html });
}
