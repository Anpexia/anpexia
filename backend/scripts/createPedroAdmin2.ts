import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const email = 'pedro.henriques.moreira13@gmail.com';

  // Check if admin user already exists (tenantId IS NULL)
  const existing = await prisma.user.findFirst({ where: { email, tenantId: null } });
  if (existing) {
    console.log('Admin user already exists:', existing.id);
    return existing;
  }

  const inviteToken = crypto.randomUUID();
  const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email,
      name: 'Pedro Henriques',
      role: 'ADMIN',
      tenantId: null,
      passwordHash: crypto.randomBytes(32).toString('hex'),
      passwordDefined: false,
      isActive: true,
      inviteToken,
      inviteTokenExpiresAt,
    },
  });

  console.log('Created admin user:', user.id);

  // Send invite email via Resend
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');

  const link = `https://admin.anpexia.com.br/criar-senha?token=${inviteToken}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Anpexia <noreply@anpexia.com.br>',
      to: [email],
      subject: 'Convite para acessar o painel Anpexia',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="color:#111">Você foi convidado para acessar o painel administrativo</h2>
          <p>Olá Pedro,</p>
          <p>Clique no botão abaixo para definir sua senha e acessar o sistema:</p>
          <a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">Definir minha senha</a>
          <p style="color:#666;font-size:13px">Este link expira em 48 horas.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#999;font-size:12px">Anpexia — Automação Empresarial</p>
        </div>
      `,
    }),
  });

  const result = await res.json();
  console.log('Email sent:', JSON.stringify(result));

  return user;
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
