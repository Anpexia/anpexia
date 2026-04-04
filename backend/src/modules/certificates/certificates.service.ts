import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface CreateCertificateData {
  patientId: string;
  doctorId: string;
  type: 'ATESTADO' | 'DECLARACAO';
  reason: string;
  daysOff?: number;
  startDate: string;
  endDate: string;
  observations?: string;
}

export const certificatesService = {
  async list(tenantId: string, patientId: string) {
    const certificates = await prisma.medicalCertificate.findMany({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
    });

    return certificates;
  },

  async create(tenantId: string, data: CreateCertificateData) {
    const certificate = await prisma.medicalCertificate.create({
      data: {
        tenantId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        type: data.type,
        reason: data.reason,
        daysOff: data.daysOff,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        observations: data.observations,
      },
    });

    return certificate;
  },

  async getById(tenantId: string, id: string) {
    const certificate = await prisma.medicalCertificate.findFirst({
      where: { id, tenantId },
    });

    if (!certificate) {
      throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Atestado nao encontrado');
    }

    return certificate;
  },
};
