import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

const COLUMN_FIELDS = new Set([
  'doctorId', 'appointmentId', 'subjective', 'objective', 'assessment',
  'plan', 'exams', 'returnDate', 'iop_od', 'iop_oe', 'acuity_od', 'acuity_oe', 'notes',
]);

export const evolutionsService = {
  async list(tenantId: string, patientId: string) {
    const evolutions = await prisma.patientEvolution.findMany({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
    });

    return evolutions.map((ev) => {
      const extra = (ev.data as Record<string, any>) || {};
      const { data: _data, ...rest } = ev;
      return { ...rest, ...extra };
    });
  },

  async create(tenantId: string, patientId: string, body: Record<string, any>) {
    const columnData: Record<string, any> = {};
    const extraData: Record<string, any> = {};

    for (const [key, value] of Object.entries(body)) {
      if (COLUMN_FIELDS.has(key)) {
        columnData[key] = value;
      } else if (key !== 'patientId' && key !== 'tenantId') {
        extraData[key] = value;
      }
    }

    const evolution = await prisma.patientEvolution.create({
      data: {
        tenantId,
        patientId,
        doctorId: columnData.doctorId,
        appointmentId: columnData.appointmentId,
        subjective: columnData.subjective || '',
        objective: columnData.objective || '',
        assessment: columnData.assessment,
        plan: columnData.plan,
        exams: columnData.exams,
        returnDate: columnData.returnDate,
        iop_od: columnData.iop_od != null ? Number(columnData.iop_od) : undefined,
        iop_oe: columnData.iop_oe != null ? Number(columnData.iop_oe) : undefined,
        acuity_od: columnData.acuity_od,
        acuity_oe: columnData.acuity_oe,
        notes: columnData.notes,
        data: Object.keys(extraData).length > 0 ? extraData : undefined,
      },
    });

    const extra = (evolution.data as Record<string, any>) || {};
    const { data: _data, ...rest } = evolution;
    return { ...rest, ...extra };
  },
};
