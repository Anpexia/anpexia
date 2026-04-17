import prisma from '../../config/database';
import bcrypt from 'bcryptjs';
import { AppError } from '../../shared/middleware/error-handler';
import { authService } from '../auth/auth.service';
import { isPasswordValid } from '../../shared/utils/password';

interface CreateMemberData {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: 'MANAGER' | 'DOCTOR' | 'RECEPTIONIST' | 'FINANCIAL' | 'STOCK' | 'EMPLOYEE';
  especialidade?: string;
  rqe?: string;
  sendInvite?: boolean;
}

export const teamService = {
  async list(tenantId: string) {
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        especialidade: true,
        rqe: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return users;
  },

  async listDoctors(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId, role: 'DOCTOR', isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        especialidade: true,
        rqe: true,
        tipoRegistro: true,
        numeroRegistro: true,
        duracaoConsulta: true,
      },
      orderBy: { name: 'asc' },
    });
  },

  async create(tenantId: string, data: CreateMemberData) {
    // Block creating OWNER or SUPER_ADMIN via team API (req.body can send anything at runtime)
    const role = data.role as string;
    if (role === 'OWNER' || role === 'SUPER_ADMIN') {
      throw new AppError(400, 'INVALID_ROLE', 'Nao e possivel criar membros com cargo Proprietario ou Super Admin');
    }

    // Invite flow: no password provided -> send invite email to define password
    if (!data.password || data.sendInvite) {
      const user = await authService.createInvite({
        tenantId,
        name: data.name,
        email: data.email,
        role: data.role,
        phone: data.phone,
        especialidade: data.especialidade,
        rqe: data.rqe,
      });
      return { ...user, isActive: true, createdAt: new Date(), invited: true };
    }

    const existing = await prisma.user.findFirst({ where: { email: data.email, tenantId } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'Este e-mail ja esta cadastrado');
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
        role: data.role,
        especialidade: data.especialidade,
        rqe: data.rqe,
        tenantId,
        passwordDefined: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        especialidade: true,
        rqe: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  },

  async update(tenantId: string, userId: string, data: { name?: string; phone?: string; role?: 'MANAGER' | 'DOCTOR' | 'RECEPTIONIST' | 'FINANCIAL' | 'STOCK' | 'EMPLOYEE'; especialidade?: string; rqe?: string }) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuario nao encontrado');

    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        especialidade: true,
        rqe: true,
        isActive: true,
        createdAt: true,
      },
    });
  },

  async toggleActive(tenantId: string, userId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuario nao encontrado');
    if (user.role === 'OWNER') throw new AppError(400, 'CANNOT_DEACTIVATE_OWNER', 'Nao e possivel desativar o proprietario');

    return prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
      select: { id: true, name: true, isActive: true },
    });
  },

  async remove(tenantId: string, userId: string, requesterId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuario nao encontrado');
    if (user.role === 'OWNER') throw new AppError(400, 'CANNOT_REMOVE_OWNER', 'Nao e possivel remover o proprietario');
    if (userId === requesterId) throw new AppError(400, 'CANNOT_REMOVE_SELF', 'Voce nao pode remover a si mesmo');

    await prisma.user.delete({ where: { id: userId } });
    return { id: userId, removed: true };
  },

  async getProfile(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        especialidade: true, rqe: true, tipoRegistro: true, numeroRegistro: true,
        duracaoConsulta: true, bio: true,
      },
    });
  },

  async updateProfile(userId: string, data: {
    name?: string; phone?: string; especialidade?: string; rqe?: string;
    tipoRegistro?: string; numeroRegistro?: string;
    duracaoConsulta?: number; bio?: string;
  }) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        especialidade: true, rqe: true, tipoRegistro: true, numeroRegistro: true,
        duracaoConsulta: true, bio: true,
      },
    });
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuario nao encontrado');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new AppError(400, 'INVALID_PASSWORD', 'Senha atual incorreta');

    const check = isPasswordValid(newPassword);
    if (!check.valid) throw new AppError(400, 'WEAK_PASSWORD', check.message);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },
};
