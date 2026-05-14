import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

export const roomsService = {
  async list(tenantId: string) {
    return prisma.room.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  },

  async create(tenantId: string, data: { name: string }) {
    const existing = await prisma.room.findUnique({
      where: { tenantId_name: { tenantId, name: data.name } },
    });
    if (existing) {
      throw new AppError(409, 'ROOM_EXISTS', 'Ja existe uma sala com este nome');
    }

    return prisma.room.create({
      data: { tenantId, name: data.name },
    });
  },

  async update(tenantId: string, id: string, data: { name?: string; isActive?: boolean }) {
    const room = await prisma.room.findFirst({ where: { id, tenantId } });
    if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala nao encontrada');

    if (data.name && data.name !== room.name) {
      const dup = await prisma.room.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
      });
      if (dup) throw new AppError(409, 'ROOM_EXISTS', 'Ja existe uma sala com este nome');
    }

    return prisma.room.update({ where: { id }, data });
  },

  async remove(tenantId: string, id: string) {
    const room = await prisma.room.findFirst({ where: { id, tenantId } });
    if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala nao encontrada');

    await prisma.room.delete({ where: { id } });
  },
};
