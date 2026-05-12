import { sendEmail } from './email.service';
import prisma from '../config/database';
import { escapeHtml } from '../shared/utils/html';

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
  const tn = escapeHtml(tenantName);
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden">
      <div style="background:#1E3A5F;padding:20px 24px">
        <h1 style="color:#fff;margin:0;font-size:20px">${tn}</h1>
      </div>
      <div style="padding:24px">
        ${content}
      </div>
      <div style="background:#f8f9fa;padding:16px 24px;border-top:1px solid #eee">
        <p style="color:#888;font-size:12px;margin:0">Enviado por ${tn} via Anpexia</p>
        <p style="color:#aaa;font-size:11px;margin:4px 0 0">&copy; 2026 Anpexia &mdash; anpexia.com.br</p>
      </div>
    </div>
  `;
}

export async function sendWelcomeEmail(tenantId: string, patient: { name: string; email: string }) {
  if (!await isEmailEnabled(tenantId, 'welcome')) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const tenantName = tenant?.name || 'Nossa Clinica';

  const pn = escapeHtml(patient.name);
  const tn = escapeHtml(tenantName);
  const html = baseLayout(tenantName, `
    <h2 style="color:#1E3A5F;margin-top:0">Bem-vindo(a), ${pn}!</h2>
    <p>E um prazer te-lo(a) como paciente da <strong>${tn}</strong>.</p>
    <p>A partir de agora voce podera contar com nossos servicos para cuidar da sua saude.</p>
    <p>Se precisar de algo, entre em contato conosco${tenant?.phone ? ` pelo telefone <strong>${escapeHtml(tenant.phone)}</strong>` : ''}.</p>
    <p style="margin-top:24px">Atenciosamente,<br/><strong>Equipe ${tn}</strong></p>
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

  const dn = escapeHtml(data.name);
  const tn = escapeHtml(tenantName);
  const html = baseLayout(tenantName, `
    <h2 style="color:#1E3A5F;margin-top:0">Consulta Confirmada</h2>
    <p>Ola, <strong>${dn}</strong>!</p>
    <p>Sua consulta foi agendada com sucesso:</p>
    <div style="background:#f0f7ff;border-left:4px solid #1E3A5F;padding:16px;margin:16px 0;border-radius:4px">
      <p style="margin:0"><strong>Data:</strong> ${dateStr}</p>
      <p style="margin:4px 0 0"><strong>Horario:</strong> ${timeStr}</p>
    </div>
    <p>Em caso de imprevisto, entre em contato para reagendar${tenant?.phone ? `: <strong>${escapeHtml(tenant.phone)}</strong>` : '.'}.</p>
    <p style="margin-top:24px">Atenciosamente,<br/><strong>Equipe ${tn}</strong></p>
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

  const dn = escapeHtml(data.name);
  const tn = escapeHtml(tenantName);
  const html = baseLayout(tenantName, `
    <h2 style="color:#1E3A5F;margin-top:0">Lembrete de Consulta</h2>
    <p>Ola, <strong>${dn}</strong>!</p>
    <p>Estamos passando para lembrar da sua consulta:</p>
    <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:16px;margin:16px 0;border-radius:4px">
      <p style="margin:0"><strong>Data:</strong> ${dateStr}</p>
      <p style="margin:4px 0 0"><strong>Horario:</strong> ${timeStr}</p>
    </div>
    <p>Contamos com sua presenca!</p>
    <p style="margin-top:24px">Atenciosamente,<br/><strong>Equipe ${tn}</strong></p>
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

  const dn = escapeHtml(data.name);
  const tn = escapeHtml(tenantName);
  const html = baseLayout(tenantName, `
    <h2 style="color:#1E3A5F;margin-top:0">Consulta Cancelada</h2>
    <p>Ola, <strong>${dn}</strong>.</p>
    <p>Sua consulta agendada para <strong>${dateStr}</strong> foi cancelada.</p>
    <p>Se desejar remarcar, entre em contato conosco${tenant?.phone ? ` pelo telefone <strong>${escapeHtml(tenant.phone)}</strong>` : ''}.</p>
    <p style="margin-top:24px">Atenciosamente,<br/><strong>Equipe ${tn}</strong></p>
  `);

  return sendEmail({ to: data.email, subject: `Consulta cancelada - ${tenantName}`, html });
}

// Admin meeting reminder (not tenant-scoped)
export async function sendMeetingReminderEmail(
  recipients: string[],
  task: { leadName: string; companyName?: string | null; type: string; dueAt: Date; responsible?: string | null },
  windowLabel: string,
) {
  if (recipients.length === 0) return null;

  const typeLabel: Record<string, string> = {
    MEETING: 'Reuniao',
    FOLLOWUP: 'Follow-up',
    CALL: 'Ligacao',
    PROPOSAL: 'Proposta',
    OTHER: 'Outro',
  };

  const dateStr = new Date(task.dueAt).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = new Date(task.dueAt).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });

  const ln = escapeHtml(task.leadName);
  const cn = task.companyName ? escapeHtml(task.companyName) : '';
  const resp = task.responsible ? escapeHtml(task.responsible) : 'Nao definido';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden">
      <div style="background:#1E3A5F;padding:20px 24px">
        <h1 style="color:#fff;margin:0;font-size:20px">Anpexia Admin</h1>
      </div>
      <div style="padding:24px">
        <h2 style="color:#1E3A5F;margin-top:0">Lembrete: ${typeLabel[task.type] || task.type} ${windowLabel}</h2>
        <p>Voce tem um compromisso agendado:</p>
        <div style="background:#f0f7ff;border-left:4px solid #1E3A5F;padding:16px;margin:16px 0;border-radius:4px">
          <p style="margin:0"><strong>Lead:</strong> ${ln}${cn ? ` (${cn})` : ''}</p>
          <p style="margin:4px 0 0"><strong>Tipo:</strong> ${typeLabel[task.type] || task.type}</p>
          <p style="margin:4px 0 0"><strong>Data:</strong> ${dateStr}</p>
          <p style="margin:4px 0 0"><strong>Horario:</strong> ${timeStr}</p>
          <p style="margin:4px 0 0"><strong>Responsavel:</strong> ${resp}</p>
        </div>
        <p><a href="https://admin.anpexia.com.br/reunioes" style="color:#1E3A5F;font-weight:bold">Ver no painel</a></p>
      </div>
      <div style="background:#f8f9fa;padding:16px 24px;border-top:1px solid #eee">
        <p style="color:#aaa;font-size:11px;margin:0">&copy; 2026 Anpexia &mdash; anpexia.com.br</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: recipients,
    subject: `Lembrete ${windowLabel}: ${typeLabel[task.type] || task.type} com ${task.leadName}`,
    html,
  });
}
