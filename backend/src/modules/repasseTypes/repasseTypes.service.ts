import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

export const repasseTypesService = {
  async list(tenantId: string) {
    return prisma.repasseType.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  },

  async create(tenantId: string, name: string) {
    const clean = (name || '').trim().toUpperCase();
    if (!clean) {
      throw new AppError(400, 'INVALID_NAME', 'Nome obrigatório');
    }

    const existing = await prisma.repasseType.findUnique({
      where: { tenantId_name: { tenantId, name: clean } },
    });
    if (existing) {
      throw new AppError(400, 'DUPLICATE_TYPE', 'Tipo já existe');
    }

    return prisma.repasseType.create({
      data: { tenantId, name: clean, isDefault: false },
    });
  },

  async remove(tenantId: string, id: string) {
    const item = await prisma.repasseType.findFirst({ where: { id, tenantId } });
    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'Tipo não encontrado');
    }
    if (item.isDefault) {
      throw new AppError(400, 'DEFAULT_TYPE', 'Não é possível deletar tipos padrão');
    }
    await prisma.repasseType.delete({ where: { id } });
  },
};
