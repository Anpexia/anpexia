import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { sendEmail } from './email.service';
import prisma from '../config/database';
import { escapeHtml } from '../shared/utils/html';

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000; // 10 min

export function generateTOTPSecret(label: string): { base32: string; otpauthUrl: string } {
  const secret = speakeasy.generateSecret({
    name: `Anpexia (${label})`,
    length: 20,
  });
  return {
    base32: secret.base32,
    otpauthUrl: secret.otpauth_url || '',
  };
}

export async function generateTOTPQRCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

export function verifyTOTPCode(secret: string, code: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
}

export function generateEmailCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function storeEmailCode(userId: string, code: string): Promise<void> {
  await prisma.emailCode.upsert({
    where: { userId },
    update: { code, expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS) },
    create: { userId, code, expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS) },
  });
}

export async function verifyEmailCode(userId: string, code: string): Promise<boolean> {
  const entry = await prisma.emailCode.findUnique({ where: { userId } });
  if (!entry) return false;
  if (entry.expiresAt < new Date()) {
    await prisma.emailCode.delete({ where: { userId } }).catch(() => {});
    return false;
  }
  if (entry.code !== code) return false;
  await prisma.emailCode.delete({ where: { userId } }).catch(() => {});
  return true;
}

export async function sendEmailCode(email: string, name: string, code: string): Promise<void> {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#111;margin-bottom:16px">Código de verificação</h2>
      <p>Olá ${escapeHtml(name)},</p>
      <p>Use o código abaixo para concluir o acesso. Ele expira em 10 minutos.</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;padding:20px;background:#f5f5f5;border-radius:8px;margin:20px 0">
        ${code}
      </div>
      <p style="color:#666;font-size:13px">Se você não tentou fazer login, ignore este email.</p>
      <p style="color:#666;font-size:13px">— Equipe Anpexia</p>
    </div>
  `;
  await sendEmail({
    to: email,
    subject: 'Anpexia — Código de verificação',
    html,
    text: `Seu código de verificação Anpexia: ${code} (expira em 10 minutos).`,
  });
}

// Housekeeping: drop expired entries every 5 min
setInterval(async () => {
  try {
    await prisma.emailCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    // silent
  }
}, 5 * 60 * 1000).unref?.();
