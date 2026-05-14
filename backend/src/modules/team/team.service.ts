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
  role: 'OWNER' | 'MANAGER' | 'DOCTOR' | 'HEALTH_PROFESSIONAL' | 'NURSE' | 'RECEPTIONIST' | 'FINANCIAL' | 'STOCK' | 'EMPLOYEE';
  isProvider?: boolean;
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
        isProvider: true,
        especialidade: true,
        rqe: true,
        horarios: true,
        salas: true,
        duracaoConsulta: true,
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
      where: { tenantId, isProvider: true, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isProvider: true,
        especialidade: true,
        rqe: true,
        tipoRegistro: true,
        numeroRegistro: true,
        duracaoConsulta: true,
        horarios: true,
        salas: true,
      },
      orderBy: { name: 'asc' },
    });
  },

  async create(tenantId: string, data: CreateMemberData, requesterRole?: string) {
    const role = data.role as string;
    if (role === 'SUPER_ADMIN') {
      throw new AppError(400, 'INVALID_ROLE', 'Nao e possivel criar Super Admin');
    }
    if (role === 'OWNER' && requesterRole !== 'OWNER' && requesterRole !== 'SUPER_ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Apenas um Admin pode criar outro Admin');
    }

    const isProviderRole = role === 'DOCTOR' || role === 'HEALTH_PROFESSIONAL';
    const isProvider = isProviderRole || !!data.isProvider;

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
        isProvider,
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
        isProvider,
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
        isProvider: true,
        especialidade: true,
        rqe: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  },

  async update(tenantId: string, userId: string, data: { name?: string; phone?: string; role?: string; isProvider?: boolean; especialidade?: string; rqe?: string; horarios?: any; salas?: any; duracaoConsulta?: number }) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuario nao encontrado');

    const updateData: any = { ...data };
    if (data.role) {
      const isProviderRole = data.role === 'DOCTOR' || data.role === 'HEALTH_PROFESSIONAL';
      if (isProviderRole) updateData.isProvider = true;
    }

    return prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isProvider: true,
        especialidade: true,
        rqe: true,
        horarios: true,
        salas: true,
        duracaoConsulta: true,
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
        duracaoConsulta: true, horarios: true, bio: true,
      },
    });
  },

  async updateProfile(userId: string, data: {
    name?: string; phone?: string; bio?: string;
  }) {
    const { name, phone, bio } = data;
    return prisma.user.update({
      where: { id: userId },
      data: { name, phone, bio },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        especialidade: true, rqe: true, tipoRegistro: true, numeroRegistro: true,
        duracaoConsulta: true, horarios: true, bio: true,
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
