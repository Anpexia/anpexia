// Don't pre-load root .env here — its JWT_SECRET is empty and would shadow backend/.env.
// The imported env.ts walks up from cwd (backend/) and finds backend/.env correctly.
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import { env } from '../src/config/env';

const resend = new Resend(env.resendApiKey);

const prisma = new PrismaClient();

async function main() {
  const targetEmail = 'pedro.henriques.moreira13@gmail.com';

  console.log('1. Procurando tenants da clínica de teste...');
  const tenants = await prisma.tenant.findMany({
    where: {
      OR: [
        { name: { contains: 'Clinica', mode: 'insensitive' } },
        { name: { contains: 'Clínica', mode: 'insensitive' } },
        { name: { contains: 'Saude Total', mode: 'insensitive' } },
        { name: { contains: 'Saúde Total', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, slug: true, segment: true },
  });
  console.log('   tenants encontrados:', JSON.stringify(tenants, null, 2));

  if (tenants.length === 0) {
    throw new Error('Nenhum tenant de clínica encontrado');
  }

  const tenant = tenants.find((t) => t.name.toLowerCase().includes('saude total') || t.name.toLowerCase().includes('saúde total')) || tenants[0];
  console.log(`   usando tenant: ${tenant.name} (${tenant.id})`);

  console.log(`2. Verificando usuário ${targetEmail}...`);
  const existing = await prisma.user.findUnique({ where: { email: targetEmail } });

  const inviteToken = crypto.randomUUID();
  const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  let user;
  let isNew = false;
  if (existing) {
    console.log('   usuário existe — atualizando role para OWNER e renovando inviteToken...');
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'OWNER',
        tenantId: tenant.id,
        inviteToken,
        inviteTokenExpiresAt,
        passwordDefined: false,
      },
    });
  } else {
    console.log('   usuário não existe — criando novo...');
    isNew = true;
    user = await prisma.user.create({
      data: {
        name: 'Pedro Henrique',
        email: targetEmail,
        role: 'OWNER',
        tenantId: tenant.id,
        passwordHash: '',
        passwordDefined: false,
        inviteToken,
        inviteTokenExpiresAt,
      },
    });
  }
  console.log(`   ${isNew ? 'criado' : 'atualizado'}: id=${user.id}`);

  console.log('3. Enviando email via Resend...');
  const link = `https://app.anpexia.com.br/criar-senha?token=${inviteToken}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="color: #1E3A5F; margin-bottom: 16px;">Bem-vindo à Anpexia</h2>
      <p style="font-size: 15px; line-height: 1.5;">
        Olá <strong>Pedro</strong>! Você foi adicionado como administrador da clínica.
        Clique no botão abaixo para definir sua senha e acessar o sistema.
      </p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${link}"
           style="display: inline-block; background: #1E3A5F; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
          Definir minha senha
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        Se o botão não funcionar, copie o link:<br/>
        <a href="${link}" style="color: #2563EB;">${link}</a>
      </p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
        Este link expira em 48 horas.
      </p>
    </div>
  `;
  const { data, error } = await resend.emails.send({
    from: 'Anpexia <noreply@anpexia.com.br>',
    to: [targetEmail],
    subject: 'Você foi convidado para acessar o sistema Anpexia',
    html,
    text: `Olá Pedro! Você foi adicionado como administrador da clínica. Acesse: ${link}`,
  });
  if (error) {
    console.error('[EMAIL] Resend error:', error);
    throw new Error(`Falha ao enviar email: ${error.message}`);
  }
  console.log(`   email enviado, id=${data?.id}`);

  console.log('Acesso criado com sucesso para pedro.henriques.moreira13@gmail.com');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
