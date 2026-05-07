import { Router, Request, Response, NextFunction } from 'express';
import { tussService } from './tuss.service';
import { success } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';
import prisma from '../../config/database';

export const doctorsRouter = Router();

doctorsRouter.use(authenticate);
doctorsRouter.use(requireTenant);

// GET /doctors/:id/repasse — legacy (kept for backward compat)
doctorsRouter.get('/:id/repasse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tussService.getDoctorRepasse(req.auth!.tenantId!, req.params.id as string);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

// PUT /doctors/:id/repasse — legacy
doctorsRouter.put(
  '/:id/repasse',
  requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const arr: Array<{ procedureType: string; percentage: number }> = Array.isArray(body)
        ? body
        : Array.isArray(body?.repasses)
        ? body.repasses
        : Object.keys(body || {}).map((k) => ({ procedureType: k, percentage: Number(body[k]) }));

      const data = await tussService.updateDoctorRepasse(
        req.auth!.tenantId!,
        req.params.id as string,
        arr,
      );
      return success(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// GET /doctors/:id/repasse/tuss — repasse per TUSS procedure
doctorsRouter.get('/:id/repasse/tuss', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const doctorId = req.params.id as string;

    const procedures = await prisma.tussProcedure.findMany({
      where: { tenantId },
      select: { id: true, code: true, description: true, type: true, value: true },
      orderBy: { description: 'asc' },
    });

    const repasses = await prisma.doctorRepasse.findMany({
      where: { tenantId, doctorId, tussProcedureId: { not: null } },
    });
    const map = new Map(repasses.map(r => [r.tussProcedureId, r.percentage]));

    const data = procedures.map(p => ({
      procedureId: p.id,
      code: p.code,
      name: p.description,
      type: p.type,
      value: p.value,
      percentage: map.get(p.id) ?? 0,
    }));

    return success(res, data);
  } catch (err) { next(err); }
});

// PUT /doctors/:id/repasse/tuss — save repasse per TUSS procedure
doctorsRouter.put(
  '/:id/repasse/tuss',
  requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const doctorId = req.params.id as string;
      const items: Array<{ procedureId: string; percentage: number }> = req.body.repasses || [];

      const doctor = await prisma.user.findFirst({ where: { id: doctorId, tenantId } });
      if (!doctor) return res.status(404).json({ success: false, error: { message: 'Médico não encontrado' } });

      const validProcIds = new Set(
        (await prisma.tussProcedure.findMany({ where: { tenantId }, select: { id: true } })).map(p => p.id),
      );

      let updated = 0;
      let deleted = 0;

      for (const item of items) {
        const pct = Number(item.percentage);
        if (isNaN(pct) || pct < 0 || pct > 100) continue;
        if (!validProcIds.has(item.procedureId)) continue;

        const existing = await prisma.doctorRepasse.findFirst({
          where: { tenantId, doctorId, tussProcedureId: item.procedureId },
        });

        if (pct === 0) {
          if (existing) {
            await prisma.doctorRepasse.delete({ where: { id: existing.id } });
            deleted++;
          }
        } else if (existing) {
          await prisma.doctorRepasse.update({ where: { id: existing.id }, data: { percentage: pct } });
          updated++;
        } else {
          await prisma.doctorRepasse.create({
            data: { tenantId, doctorId, tussProcedureId: item.procedureId, percentage: pct },
          });
          updated++;
        }
      }

      return success(res, { updated, deleted });
    } catch (err) { next(err); }
  },
);

// GET /doctors/:id/repasse/private — repasse per private procedure
doctorsRouter.get('/:id/repasse/private', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const doctorId = req.params.id as string;

    const procedures = await prisma.privateProcedure.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, type: true, value: true },
      orderBy: { name: 'asc' },
    });

    const repasses = await prisma.doctorRepasse.findMany({
      where: { tenantId, doctorId, privateProcedureId: { not: null } },
    });
    const map = new Map(repasses.map(r => [r.privateProcedureId, r.percentage]));

    const data = procedures.map(p => ({
      procedureId: p.id,
      name: p.name,
      type: p.type,
      value: p.value,
      percentage: map.get(p.id) ?? 0,
    }));

    return success(res, data);
  } catch (err) { next(err); }
});

// PUT /doctors/:id/repasse/private — save repasse per private procedure
doctorsRouter.put(
  '/:id/repasse/private',
  requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const doctorId = req.params.id as string;
      const items: Array<{ procedureId: string; percentage: number }> = req.body.repasses || [];

      const doctor = await prisma.user.findFirst({ where: { id: doctorId, tenantId } });
      if (!doctor) return res.status(404).json({ success: false, error: { message: 'Médico não encontrado' } });

      const validProcIds = new Set(
        (await prisma.privateProcedure.findMany({ where: { tenantId, isActive: true }, select: { id: true } })).map(p => p.id),
      );

      let updated = 0;
      let deleted = 0;

      for (const item of items) {
        const pct = Number(item.percentage);
        if (isNaN(pct) || pct < 0 || pct > 100) continue;
        if (!validProcIds.has(item.procedureId)) continue;

        const existing = await prisma.doctorRepasse.findFirst({
          where: { tenantId, doctorId, privateProcedureId: item.procedureId },
        });

        if (pct === 0) {
          if (existing) {
            await prisma.doctorRepasse.delete({ where: { id: existing.id } });
            deleted++;
          }
        } else if (existing) {
          await prisma.doctorRepasse.update({ where: { id: existing.id }, data: { percentage: pct } });
          updated++;
        } else {
          await prisma.doctorRepasse.create({
            data: { tenantId, doctorId, privateProcedureId: item.procedureId, percentage: pct },
          });
          updated++;
        }
      }

      return success(res, { updated, deleted });
    } catch (err) { next(err); }
  },
);

// GET /doctors/:id/repasse/report
doctorsRouter.get('/:id/repasse/report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const data = await tussService.getRepasseReport(req.auth!.tenantId!, req.params.id as string, {
      startDate,
      endDate,
    });
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

