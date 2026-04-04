import prisma from '../../config/database';
import bcrypt from 'bcryptjs';
import { AppError } from '../../shared/middleware/error-handler';

interface CreateMemberData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: 'MANAGER' | 'EMPLOYEE';
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
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return users;
  },

  async create(tenantId: string, data: CreateMemberData) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'Este e-mail ja esta cadastrado');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        phone: data.phone,
        role: data.role,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  },

  async update(tenantId: string, userId: string, data: { name?: string; phone?: string; role?: 'MANAGER' | 'EMPLOYEE' }) {
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

  async updateProfile(userId: string, data: { name?: string; phone?: string }) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuario nao encontrado');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new AppError(400, 'INVALID_PASSWORD', 'Senha atual incorreta');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },
};
