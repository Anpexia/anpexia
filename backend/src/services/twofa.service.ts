import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { sendEmail } from './email.service';

/**
 * In-memory email-code store (userId -> { code, expiresAt }).
 * Good enough for single-instance. Replace with Redis / DB if we scale horizontally.
 */
const emailCodeStore = new Map<string, { code: string; expiresAt: number }>();
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

export function storeEmailCode(userId: string, code: string): void {
  emailCodeStore.set(userId, { code, expiresAt: Date.now() + EMAIL_CODE_TTL_MS });
}

export function verifyEmailCode(userId: string, code: string): boolean {
  const entry = emailCodeStore.get(userId);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    emailCodeStore.delete(userId);
    return false;
  }
  if (entry.code !== code) return false;
  emailCodeStore.delete(userId);
  return true;
}

export async function sendEmailCode(email: string, name: string, code: string): Promise<void> {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#111;margin-bottom:16px">Código de verificação</h2>
      <p>Olá ${name},</p>
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
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of emailCodeStore.entries()) {
    if (v.expiresAt < now) emailCodeStore.delete(k);
  }
}, 5 * 60 * 1000).unref?.();
