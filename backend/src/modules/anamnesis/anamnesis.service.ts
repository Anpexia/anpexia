import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

export const anamnesisService = {
  async get(tenantId: string, patientId: string) {
    const anamnesis = await prisma.anamnesis.findFirst({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
    });

    if (!anamnesis) {
      throw new AppError(404, 'ANAMNESIS_NOT_FOUND', 'Anamnese nao encontrada');
    }

    return anamnesis;
  },

  async create(tenantId: string, patientId: string, doctorId: string, data: any) {
    const anamnesis = await prisma.anamnesis.create({
      data: {
        tenantId,
        patientId,
        doctorId,
        data,
      },
    });

    return anamnesis;
  },

  async update(tenantId: string, id: string, data: any) {
    const existing = await prisma.anamnesis.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new AppError(404, 'ANAMNESIS_NOT_FOUND', 'Anamnese nao encontrada');
    }

    const anamnesis = await prisma.anamnesis.update({
      where: { id },
      data: { data },
    });

    return anamnesis;
  },
};
