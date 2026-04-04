import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface CreatePrescriptionData {
  patientId: string;
  doctorId: string;
  type: 'MEDICAMENTO' | 'EXAME_EXTERNO' | 'OCULOS' | 'EXAME_INTERNO';
  data: any;
}

export const prescriptionsService = {
  async list(tenantId: string, patientId: string, type?: string) {
    const where: any = { tenantId, patientId };

    if (type) {
      where.type = type;
    }

    const prescriptions = await prisma.prescription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return prescriptions;
  },

  async create(tenantId: string, data: CreatePrescriptionData) {
    const prescription = await prisma.prescription.create({
      data: {
        tenantId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        type: data.type,
        data: data.data,
      },
    });

    return prescription;
  },

  async getById(tenantId: string, id: string) {
    const prescription = await prisma.prescription.findFirst({
      where: { id, tenantId },
    });

    if (!prescription) {
      throw new AppError(404, 'PRESCRIPTION_NOT_FOUND', 'Prescricao nao encontrada');
    }

    return prescription;
  },
};
