import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface CreateEvolutionData {
  doctorId: string;
  appointmentId?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  iop_od?: number;
  iop_oe?: number;
  acuity_od?: string;
  acuity_oe?: string;
  notes?: string;
}

export const evolutionsService = {
  async list(tenantId: string, patientId: string) {
    const evolutions = await prisma.patientEvolution.findMany({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
    });

    return evolutions;
  },

  async create(tenantId: string, patientId: string, data: CreateEvolutionData) {
    const evolution = await prisma.patientEvolution.create({
      data: {
        tenantId,
        patientId,
        doctorId: data.doctorId,
        appointmentId: data.appointmentId,
        subjective: data.subjective,
        objective: data.objective,
        assessment: data.assessment,
        plan: data.plan,
        iop_od: data.iop_od,
        iop_oe: data.iop_oe,
        acuity_od: data.acuity_od,
        acuity_oe: data.acuity_oe,
        notes: data.notes,
      },
    });

    return evolution;
  },
};
