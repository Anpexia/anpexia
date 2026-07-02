import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface ListParams {
  search?: string;
  context?: string;
}

interface CreateData {
  title: string;
  content: string;
  context?: string | null;
}

// Regra central: TODA query filtra por { tenantId, ownerId } — a biblioteca é
// privada do médico dono. Um médico nunca vê nem edita modelos de outro.
export const conductaTemplatesService = {
  async list(tenantId: string, ownerId: string, params: ListParams) {
    const where: any = { tenantId, ownerId, isActive: true };
    if (params.context) where.context = params.context;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { content: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return prisma.conductaTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } });
  },

  async getById(tenantId: string, ownerId: string, id: string) {
    const tpl = await prisma.conductaTemplate.findFirst({ where: { id, tenantId, ownerId, isActive: true } });
    if (!tpl) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Modelo nao encontrado');
    return tpl;
  },

  async create(tenantId: string, ownerId: string, data: CreateData) {
    return prisma.conductaTemplate.create({
      data: {
        tenantId,
        ownerId,
        title: data.title,
        content: data.content,
        context: data.context ?? null,
      },
    });
  },

  async update(tenantId: string, ownerId: string, id: string, data: Partial<CreateData>) {
    // Ownership: o findFirst por ownerId impede editar modelo de outro médico (→ 404).
    const existing = await prisma.conductaTemplate.findFirst({ where: { id, tenantId, ownerId } });
    if (!existing) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Modelo nao encontrado');
    return prisma.conductaTemplate.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.context !== undefined && { context: data.context ?? null }),
      },
    });
  },

  async remove(tenantId: string, ownerId: string, id: string) {
    const existing = await prisma.conductaTemplate.findFirst({ where: { id, tenantId, ownerId } });
    if (!existing) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Modelo nao encontrado');
    await prisma.conductaTemplate.update({ where: { id }, data: { isActive: false } });
  },
};
