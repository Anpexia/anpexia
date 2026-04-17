import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../shared/middleware/error-handler';
import { AuthPayload } from '../../shared/middleware/auth';
import { isPasswordValid } from '../../shared/utils/password';
import { sendEmail } from '../../services/email.service';
import {
  generateEmailCode,
  generateTOTPQRCode,
  generateTOTPSecret,
  sendEmailCode,
  storeEmailCode,
  verifyEmailCode as verifyEmailCodeSvc,
  verifyTOTPCode,
} from '../../services/twofa.service';
import { logAction } from '../../services/auditLog.service';

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  tenantId?: string;
  role?: 'OWNER' | 'MANAGER' | 'EMPLOYEE';
}

function signAccessToken(user: { id: string; tenantId: string | null; role: string; email: string }): string {
  const payload: AuthPayload = {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
}

async function cleanupExpiredBlacklist(): Promise<void> {
  try {
    // remove blacklist entries older than 48h (JWT was 24h, buffer of safety)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await prisma.tokenBlacklist.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } catch (err) {
    console.error('[AUTH] cleanupExpiredBlacklist error:', err);
  }
}

export const authService = {
  async login(email: string, password: string, deviceId: string | undefined, ipAddress: string, context: 'admin' | 'app' = 'app') {
    // Fire-and-forget cleanup
    cleanupExpiredBlacklist();
    email = email.trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        email,
        tenantId: context === 'admin' ? null : { not: null },
      },
      include: { tenant: { select: { id: true, name: true, slug: true, plan: true, segment: true } } },
    });

    if (!user || !user.isActive) {
      await logAction({
        userEmail: email,
        action: 'LOGIN',
        entity: 'USER',
        ipAddress,
        metadata: { reason: 'credenciais inválidas', detail: 'user_not_found_or_inactive' },
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
    }

    if (!user.passwordDefined) {
      throw new AppError(403, 'PASSWORD_NOT_DEFINED', 'Defina sua senha antes de fazer login. Verifique seu email.');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await logAction({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        tenantId: user.tenantId,
        action: 'LOGIN',
        entity: 'USER',
        entityId: user.id,
        ipAddress,
        metadata: { reason: 'credenciais inválidas', detail: 'wrong_password' },
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
    }

    // Trusted-device check (2FA layer)
    let trusted = false;
    if (deviceId) {
      const td = await prisma.trustedDevice.findUnique({
        where: { userId_deviceId: { userId: user.id, deviceId } },
      });
      trusted = !!td;
    }

    if (!trusted) {
      // Send email code, require 2FA challenge
      const code = generateEmailCode();
      storeEmailCode(user.id, code);
      try {
        await sendEmailCode(user.email, user.name, code);
      } catch (err) {
        console.error('[AUTH] Falha ao enviar código por email:', err);
      }
      await logAction({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        tenantId: user.tenantId,
        action: 'LOGIN_2FA_REQUIRED',
        entity: 'User',
        entityId: user.id,
        ipAddress,
      });
      throw new AppError(403, 'DEVICE_NOT_TRUSTED', 'Dispositivo não confiável. Verifique seu email para o código de acesso.', {
        userId: user.id,
        email: user.email,
        twoFactorEnabled: user.twoFactorEnabled,
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = signAccessToken({ id: user.id, tenantId: user.tenantId, role: user.role, email: user.email });

    const refreshToken = crypto.randomBytes(64).toString('hex');

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await logAction({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      tenantId: user.tenantId,
      action: 'LOGIN',
      entity: 'USER',
      entityId: user.id,
      ipAddress,
      metadata: { result: 'success' },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        tenant: user.tenant,
      },
    };
  },

  async verify2FA(userId: string, code: string, method: 'email' | 'totp', deviceId: string | undefined, deviceName: string | undefined, rememberDevice: boolean, ipAddress: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: { select: { id: true, name: true, slug: true, plan: true, segment: true } } },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');

    let ok = false;
    if (method === 'totp') {
      if (!user.twoFactorSecret) throw new AppError(400, 'TOTP_NOT_CONFIGURED', '2FA por app não configurado');
      ok = verifyTOTPCode(user.twoFactorSecret, code);
    } else {
      ok = verifyEmailCodeSvc(user.id, code);
    }

    if (!ok) {
      await logAction({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        tenantId: user.tenantId,
        action: 'LOGIN_2FA_FAIL',
        entity: 'User',
        entityId: user.id,
        ipAddress,
        metadata: { method },
      });
      throw new AppError(401, 'INVALID_2FA_CODE', 'Código inválido ou expirado');
    }

    if (rememberDevice && deviceId) {
      await prisma.trustedDevice.upsert({
        where: { userId_deviceId: { userId: user.id, deviceId } },
        update: { deviceName: deviceName || undefined },
        create: { userId: user.id, deviceId, deviceName: deviceName || null },
      });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = signAccessToken({ id: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
    const refreshToken = crypto.randomBytes(64).toString('hex');
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    await logAction({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      tenantId: user.tenantId,
      action: 'LOGIN_2FA_SUCCESS',
      entity: 'User',
      entityId: user.id,
      ipAddress,
      metadata: { method, rememberDevice },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        tenant: user.tenant,
      },
    };
  },

  async resend2FACode(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');
    const code = generateEmailCode();
    storeEmailCode(user.id, code);
    await sendEmailCode(user.email, user.name, code);
  },

  async register(data: RegisterData) {
    data.email = data.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email: data.email, tenantId: data.tenantId } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'Este e-mail já está cadastrado');
    }

    const check = isPasswordValid(data.password);
    if (!check.valid) throw new AppError(400, 'WEAK_PASSWORD', check.message);

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        phone: data.phone,
        tenantId: data.tenantId,
        role: data.role || 'EMPLOYEE',
        passwordDefined: true,
      },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    return user;
  },

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new AppError(401, 'NO_REFRESH_TOKEN', 'Refresh token não fornecido');
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token inválido ou expirado');
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });

    if (!user || !user.isActive) {
      throw new AppError(401, 'USER_INACTIVE', 'Usuário inativo');
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const newAccessToken = signAccessToken({ id: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
    const newRefreshToken = crypto.randomBytes(64).toString('hex');

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  },

  async logout(refreshToken: string, accessToken: string | undefined, auth: AuthPayload | undefined, ipAddress: string) {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    if (accessToken) {
      try {
        await prisma.tokenBlacklist.create({ data: { token: accessToken } });
      } catch {
        // token already blacklisted — ignore
      }
    }
    if (auth) {
      await logAction({
        userId: auth.userId,
        userEmail: auth.email,
        userRole: auth.role,
        tenantId: auth.tenantId,
        action: 'LOGOUT',
        entity: 'USER',
        entityId: auth.userId,
        ipAddress,
      });
    }
  },

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        twoFactorEnabled: true,
        tenant: { select: { id: true, name: true, slug: true, plan: true, segment: true } },
      },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');
    }

    return user;
  },

  // ===== 2FA (TOTP) =====

  async setup2FA(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');

    const { base32, otpauthUrl } = generateTOTPSecret(user.email);
    // Persist as pending secret — only enabled after /enable call
    await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: base32 } });
    const qrCodeDataUrl = await generateTOTPQRCode(otpauthUrl);
    return { secret: base32, otpauthUrl, qrCodeDataUrl };
  },

  async enable2FA(userId: string, code: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new AppError(400, 'TOTP_NOT_CONFIGURED', 'Configure o 2FA antes de ativá-lo');
    }
    if (!verifyTOTPCode(user.twoFactorSecret, code)) {
      throw new AppError(400, 'INVALID_CODE', 'Código inválido');
    }
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
  },

  async disable2FA(userId: string, password: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new AppError(400, 'INVALID_PASSWORD', 'Senha incorreta');
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  },

  // ===== Trusted devices =====

  async listDevices(userId: string) {
    return prisma.trustedDevice.findMany({
      where: { userId },
      select: { id: true, deviceId: true, deviceName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  async removeDevice(userId: string, deviceId: string) {
    await prisma.trustedDevice.deleteMany({ where: { id: deviceId, userId } });
  },

  async removeAllDevices(userId: string) {
    await prisma.trustedDevice.deleteMany({ where: { userId } });
  },

  // ===== Convite / Definir senha =====

  async createInvite(params: {
    tenantId: string | null;
    name: string;
    email: string;
    role: string;
    phone?: string;
    especialidade?: string;
    rqe?: string;
    inviteLinkBase?: string;
  }) {
    const normalizedEmail = params.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email: normalizedEmail, tenantId: params.tenantId } });
    if (existing) throw new AppError(409, 'EMAIL_EXISTS', 'Este e-mail já está cadastrado');

    const inviteToken = crypto.randomUUID();
    const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        email: normalizedEmail,
        phone: params.phone,
        role: params.role as any,
        especialidade: params.especialidade,
        rqe: params.rqe,
        passwordHash: crypto.randomBytes(32).toString('hex'), // placeholder; never usable
        passwordDefined: false,
        inviteToken,
        inviteTokenExpiresAt,
      },
      select: { id: true, name: true, email: true, role: true, especialidade: true, rqe: true },
    });

    const base = (params.inviteLinkBase || env.frontendUrl).replace(/\/$/, '');
    const link = `${base}/criar-senha?token=${inviteToken}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#111">Você foi convidado para acessar o sistema</h2>
        <p>Olá ${params.name},</p>
        <p>Uma conta foi criada para você no sistema Anpexia. Clique no botão abaixo para definir sua senha de acesso.</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">Definir minha senha</a>
        </p>
        <p style="color:#666;font-size:13px">Este link é válido por 48 horas.</p>
        <p style="color:#666;font-size:13px">Se o botão não funcionar, copie e cole este endereço no navegador:<br/>${link}</p>
      </div>
    `;
    try {
      await sendEmail({
        to: params.email,
        subject: 'Você foi convidado para acessar o sistema',
        html,
        text: `Olá ${params.name}, defina sua senha em: ${link}`,
      });
    } catch (err) {
      console.error('[AUTH] Falha ao enviar convite:', err);
    }

    return user;
  },

  async validateInvite(token: string) {
    const user = await prisma.user.findUnique({
      where: { inviteToken: token },
      select: { id: true, name: true, email: true, inviteTokenExpiresAt: true, passwordDefined: true },
    });
    if (!user || user.passwordDefined || !user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
      throw new AppError(404, 'INVITE_INVALID', 'Convite inválido ou expirado');
    }
    return { name: user.name, email: user.email };
  },

  async definePassword(token: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) {
      throw new AppError(400, 'PASSWORD_MISMATCH', 'As senhas não coincidem');
    }
    const check = isPasswordValid(password);
    if (!check.valid) throw new AppError(400, 'WEAK_PASSWORD', check.message);

    const user = await prisma.user.findUnique({ where: { inviteToken: token } });
    if (!user || !user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
      throw new AppError(404, 'INVITE_INVALID', 'Convite inválido ou expirado');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordDefined: true,
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });
  },
};
