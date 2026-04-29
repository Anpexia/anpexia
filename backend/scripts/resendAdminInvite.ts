import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { sendEmail } from '../src/services/email.service';

const prisma = new PrismaClient();

async function main() {
  const email = 'angelolarocca10@gmail.com';
  const user = await prisma.user.findFirst({
    where: { email, tenantId: null },
    select: { id: true, email: true, name: true, role: true, passwordDefined: true }
  });

  if (!user) { console.log('Usuário admin não encontrado'); return; }
  if (user.passwordDefined) { console.log('Usuário já definiu senha, não precisa de convite'); return; }

  const newToken = crypto.randomUUID();
  const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { inviteToken: newToken, inviteTokenExpiresAt: newExpiry }
  });

  const adminBase = 'https://admin-nine-pied.vercel.app';
  const link = `${adminBase}/criar-senha?token=${newToken}`;

  console.log('Usuário:', user.name, '/', user.email, '/ role:', user.role);
  console.log('Novo token:', newToken);
  console.log('Expira em:', newExpiry.toISOString());
  console.log('Link:', link);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#111">Você foi convidado para acessar o painel Admin</h2>
      <p>Olá ${user.name},</p>
      <p>Uma conta foi criada para você no painel administrativo Anpexia. Clique no botão abaixo para definir sua senha de acesso.</p>
      <p style="text-align:center;margin:32px 0">
        <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">Definir minha senha</a>
      </p>
      <p style="color:#666;font-size:13px">Este link é válido por 48 horas.</p>
      <p style="color:#666;font-size:13px">Se o botão não funcionar, copie e cole este endereço no navegador:<br/>${link}</p>
    </div>
  `;
  try {
    await sendEmail({
      to: user.email,
      subject: 'Convite para o Painel Admin - Anpexia',
      html,
      text: `Olá ${user.name}, defina sua senha em: ${link}`,
    });
    console.log('Email enviado com sucesso!');
  } catch (err) {
    console.error('Erro ao enviar email:', err);
    console.log('Use o link acima para definir a senha manualmente.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
