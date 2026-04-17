import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import { env } from '../src/config/env';

const prisma = new PrismaClient();
const resend = new Resend(env.resendApiKey);

async function main() {
  const email = 'pedro.henriques.moreira13@gmail.com';
  const name = 'Pedro Henrique';

  console.log('1. Verificando se já existe registro admin para Pedro...');
  const existing = await prisma.user.findFirst({ where: { email, tenantId: null } });
  if (existing) {
    console.log('   já existe:', existing.id);
    return;
  }

  console.log('2. Criando registro ADMIN com tenantId=null...');
  const inviteToken = crypto.randomUUID();
  const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: 'ADMIN',
      tenantId: null,
      passwordHash: crypto.randomBytes(32).toString('hex'),
      passwordDefined: false,
      isActive: true,
      inviteToken,
      inviteTokenExpiresAt,
    },
  });
  console.log('   criado:', user.id);

  console.log('3. Enviando email de convite...');
  const link = `https://admin.anpexia.com.br/criar-senha?token=${inviteToken}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
      <h2 style="color:#1E3A5F;margin-bottom:16px;">Bem-vindo ao Painel Admin — Anpexia</h2>
      <p>Olá <strong>${name}</strong>! Você foi adicionado como administrador do sistema Anpexia.</p>
      <p>Clique no botão abaixo para definir sua senha e acessar o painel.</p>
      <p style="text-align:center;margin:32px 0;">
        <a href="${link}" style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Definir minha senha</a>
      </p>
      <p style="font-size:13px;color:#6b7280;">Link: <a href="${link}" style="color:#2563EB;">${link}</a></p>
      <p style="font-size:12px;color:#9ca3af;margin-top:32px;">Este link expira em 48 horas.</p>
    </div>
  `;
  const { data, error } = await resend.emails.send({
    from: 'Anpexia <noreply@anpexia.com.br>',
    to: [email],
    subject: 'Você foi convidado para o Painel Admin — Anpexia',
    html,
    text: `Olá ${name}! Acesse o painel admin: ${link}`,
  });
  if (error) {
    console.error('Resend error:', error);
    throw new Error(`Falha: ${error.message}`);
  }
  console.log(`   email enviado, id=${data?.id}`);
  console.log('Concluído! Pedro pode definir a senha e acessar admin.anpexia.com.br');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
