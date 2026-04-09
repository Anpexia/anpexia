import { Router, Request, Response, NextFunction } from 'express';
import { tussService } from './tuss.service';
import { success } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';

export const doctorsRouter = Router();

doctorsRouter.use(authenticate);
doctorsRouter.use(requireTenant);

// GET /doctors/:id/repasse — any role can read
doctorsRouter.get('/:id/repasse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tussService.getDoctorRepasse(req.auth!.tenantId!, req.params.id as string);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

// PUT /doctors/:id/repasse — OWNER or MANAGER can edit
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
        : // Accept shape { CONSULTA: 30, EXAME: 20, ... }
          Object.keys(body || {}).map((k) => ({ procedureType: k, percentage: Number(body[k]) }));

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

// GET /doctors/:id/repasse/report — report of procedures and repasse amounts
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
