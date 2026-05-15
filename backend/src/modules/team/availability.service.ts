import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

export const availabilityService = {
  async listPeriods(tenantId: string, doctorId: string) {
    return prisma.doctorAvailabilityPeriod.findMany({
      where: { tenantId, doctorId },
      orderBy: { startDate: 'asc' },
    });
  },

  async createPeriod(tenantId: string, doctorId: string, data: { startDate: string; endDate: string }) {
    const doctor = await prisma.user.findFirst({ where: { id: doctorId, tenantId } });
    if (!doctor) throw new AppError(404, 'USER_NOT_FOUND', 'Medico nao encontrado');

    const start = new Date(data.startDate + 'T00:00:00Z');
    const end = new Date(data.endDate + 'T00:00:00Z');

    if (end < start) {
      throw new AppError(400, 'INVALID_DATES', 'Data final deve ser igual ou posterior a data inicial');
    }

    return prisma.doctorAvailabilityPeriod.create({
      data: { tenantId, doctorId, startDate: start, endDate: end },
    });
  },

  async deletePeriod(tenantId: string, id: string) {
    const period = await prisma.doctorAvailabilityPeriod.findFirst({ where: { id, tenantId } });
    if (!period) throw new AppError(404, 'PERIOD_NOT_FOUND', 'Periodo nao encontrado');

    await prisma.doctorAvailabilityPeriod.delete({ where: { id } });
  },

  async updateScheduleMode(tenantId: string, doctorId: string, mode: 'fixed' | 'period') {
    const doctor = await prisma.user.findFirst({ where: { id: doctorId, tenantId } });
    if (!doctor) throw new AppError(404, 'USER_NOT_FOUND', 'Medico nao encontrado');

    return prisma.user.update({
      where: { id: doctorId },
      data: { scheduleMode: mode },
      select: { id: true, scheduleMode: true },
    });
  },

  async isDoctorAvailableOnDate(doctorId: string, dateStr: string): Promise<boolean> {
    const date = new Date(dateStr + 'T00:00:00Z');
    const period = await prisma.doctorAvailabilityPeriod.findFirst({
      where: {
        doctorId,
        startDate: { lte: date },
        endDate: { gte: date },
      },
      select: { id: true },
    });
    return !!period;
  },
};
