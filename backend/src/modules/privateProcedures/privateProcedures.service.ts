import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface CreateInput {
  name: string;
  description?: string | null;
  value?: number | null;
  duration?: number | null;
}

interface UpdateInput {
  name?: string;
  description?: string | null;
  value?: number | null;
  duration?: number | null;
  isActive?: boolean;
}

function sanitizeDuration(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new AppError(400, 'INVALID_DURATION', 'Duracao deve ser um numero positivo');
  }
  return Math.floor(num);
}

function sanitizeValue(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new AppError(400, 'INVALID_VALUE', 'Valor deve ser um numero positivo');
  }
  return num;
}

export const privateProceduresService = {
  async list(tenantId: string) {
    return prisma.privateProcedure.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  },

  async create(tenantId: string, data: CreateInput) {
    const name = (data.name || '').trim();
    if (!name) {
      throw new AppError(400, 'NAME_REQUIRED', 'Nome do procedimento e obrigatorio');
    }

    const existing = await prisma.privateProcedure.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
    if (existing) {
      throw new AppError(409, 'DUPLICATE_NAME', 'Ja existe um procedimento com este nome');
    }

    const value = sanitizeValue(data.value);
    const duration = sanitizeDuration(data.duration);

    return prisma.privateProcedure.create({
      data: {
        tenantId,
        name,
        description: data.description?.toString().trim() || null,
        value: value ?? null,
        duration: duration === undefined ? 30 : duration ?? 30,
        isActive: true,
      },
    });
  },

  async update(tenantId: string, id: string, data: UpdateInput) {
    const existing = await prisma.privateProcedure.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'PROCEDURE_NOT_FOUND', 'Procedimento nao encontrado');
    }
    if (existing.tenantId !== tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Procedimento nao pertence ao tenant');
    }

    const updateData: any = {};

    if (data.name !== undefined) {
      const newName = (data.name || '').trim();
      if (!newName) {
        throw new AppError(400, 'NAME_REQUIRED', 'Nome do procedimento e obrigatorio');
      }
      if (newName !== existing.name) {
        const dup = await prisma.privateProcedure.findUnique({
          where: { tenantId_name: { tenantId, name: newName } },
        });
        if (dup) {
          throw new AppError(409, 'DUPLICATE_NAME', 'Ja existe um procedimento com este nome');
        }
      }
      updateData.name = newName;
    }

    if (data.description !== undefined) {
      updateData.description = data.description?.toString().trim() || null;
    }

    if (data.value !== undefined) {
      const v = sanitizeValue(data.value);
      updateData.value = v ?? null;
    }

    if (data.duration !== undefined) {
      const d = sanitizeDuration(data.duration);
      updateData.duration = d ?? null;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = Boolean(data.isActive);
    }

    return prisma.privateProcedure.update({
      where: { id },
      data: updateData,
    });
  },

  async remove(tenantId: string, id: string) {
    const existing = await prisma.privateProcedure.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'PROCEDURE_NOT_FOUND', 'Procedimento nao encontrado');
    }
    if (existing.tenantId !== tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Procedimento nao pertence ao tenant');
    }
    await prisma.privateProcedure.delete({ where: { id } });
  },

  async attachToCall(tenantId: string, scheduledCallId: string, privateProcedureId: string, notes?: string | null) {
    const call = await prisma.scheduledCall.findUnique({ where: { id: scheduledCallId } });
    if (!call) {
      throw new AppError(404, 'CALL_NOT_FOUND', 'Agendamento nao encontrado');
    }
    if (call.tenantId !== tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Agendamento nao pertence ao tenant');
    }

    const procedure = await prisma.privateProcedure.findUnique({ where: { id: privateProcedureId } });
    if (!procedure) {
      throw new AppError(404, 'PROCEDURE_NOT_FOUND', 'Procedimento nao encontrado');
    }
    if (procedure.tenantId !== tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Procedimento nao pertence ao tenant');
    }

    return prisma.privateProcedureCall.create({
      data: {
        scheduledCallId,
        privateProcedureId,
        notes: notes?.toString().trim() || null,
      },
    });
  },
};
