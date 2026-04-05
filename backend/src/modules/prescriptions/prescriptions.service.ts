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
      include: {
        patient: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map data JSON into items/oculosData for frontend consumption
    return prescriptions.map((p) => {
      const data = p.data as Record<string, any> || {};
      let items: any[] | undefined;
      let oculosData: any | undefined;

      if (p.type === 'MEDICAMENTO') {
        items = data.medications || [];
      } else if (p.type === 'EXAME_EXTERNO' || p.type === 'EXAME_INTERNO') {
        items = data.exams || [];
      } else if (p.type === 'OCULOS') {
        oculosData = { tipoLente: data.lensType, ...data };
      }

      return {
        id: p.id,
        type: p.type,
        items,
        oculosData,
        createdAt: p.createdAt,
        doctorId: p.doctorId,
      };
    });
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
