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
    const patient = await prisma.customer.findFirst({ where: { id: patientId, tenantId } });
    if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Paciente nao encontrado');

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

  /**
   * Edita uma evolução estruturada. SOMENTE o autor (doctorId) pode editar.
   * Preserva doctorId e createdAt; grava updatedBy/updatedAt. Campos ausentes
   * no body são mantidos (Prisma ignora `undefined`).
   */
  async update(tenantId: string, id: string, userId: string, body: Record<string, any>) {
    const existing = await prisma.patientEvolution.findFirst({ where: { id, tenantId } });
    if (!existing) throw new AppError(404, 'EVOLUTION_NOT_FOUND', 'Evolucao nao encontrada');
    if (existing.doctorId !== userId) {
      throw new AppError(403, 'NOT_AUTHOR', 'Somente o autor da evolucao pode edita-la');
    }

    const columnData: Record<string, any> = {};
    const extraData: Record<string, any> = {};
    const SKIP = new Set(['id', 'tenantId', 'patientId', 'doctorId', 'createdAt', 'updatedAt', 'updatedById']);
    for (const [key, value] of Object.entries(body)) {
      if (SKIP.has(key)) continue;
      if (COLUMN_FIELDS.has(key)) columnData[key] = value;
      else extraData[key] = value;
    }

    const mergedExtra = { ...((existing.data as Record<string, any>) || {}), ...extraData };

    const updateData: Record<string, any> = {
      updatedById: userId,
      updatedAt: new Date(),
      data: Object.keys(mergedExtra).length > 0 ? mergedExtra : undefined,
    };
    if ('subjective' in columnData) updateData.subjective = columnData.subjective || '';
    if ('objective' in columnData) updateData.objective = columnData.objective || '';
    if ('assessment' in columnData) updateData.assessment = columnData.assessment;
    if ('plan' in columnData) updateData.plan = columnData.plan;
    if ('exams' in columnData) updateData.exams = columnData.exams;
    if ('returnDate' in columnData) updateData.returnDate = columnData.returnDate;
    if ('acuity_od' in columnData) updateData.acuity_od = columnData.acuity_od;
    if ('acuity_oe' in columnData) updateData.acuity_oe = columnData.acuity_oe;
    if ('notes' in columnData) updateData.notes = columnData.notes;
    if ('appointmentId' in columnData) updateData.appointmentId = columnData.appointmentId;
    if ('iop_od' in columnData) updateData.iop_od = columnData.iop_od != null && columnData.iop_od !== '' ? Number(columnData.iop_od) : null;
    if ('iop_oe' in columnData) updateData.iop_oe = columnData.iop_oe != null && columnData.iop_oe !== '' ? Number(columnData.iop_oe) : null;

    const updated = await prisma.patientEvolution.update({ where: { id }, data: updateData });
    const extra = (updated.data as Record<string, any>) || {};
    const { data: _data, ...rest } = updated;
    return { ...rest, ...extra };
  },
};
