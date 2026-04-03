import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../shared/middleware/error-handler';
import { AuthPayload } from '../../shared/middleware/auth';

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  tenantId?: string;
  role?: 'OWNER' | 'MANAGER' | 'EMPLOYEE';
}

export const authService = {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { id: true, name: true, slug: true, plan: true } } },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
    }

    // Atualizar último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: AuthPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as any,
    });

    const refreshToken = crypto.randomBytes(64).toString('hex');

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant: user.tenant,
      },
    };
  },

  async register(data: RegisterData) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'Este e-mail já está cadastrado');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        phone: data.phone,
        tenantId: data.tenantId,
        role: data.role || 'EMPLOYEE',
      },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    return user;
  },

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new AppError(401, 'NO_REFRESH_TOKEN', 'Refresh token não fornecido');
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token inválido ou expirado');
    }

    const user = await prisma.user.findUnique({
      where: { id: stored.userId },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, 'USER_INACTIVE', 'Usuário inativo');
    }

    // Rotação: apaga o antigo e cria um novo
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const payload: AuthPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };

    const newAccessToken = jwt.sign(payload, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as any,
    });

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

  async logout(refreshToken: string) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  },

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenant: { select: { id: true, name: true, slug: true, plan: true } },
      },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');
    }

    return user;
  },
};
