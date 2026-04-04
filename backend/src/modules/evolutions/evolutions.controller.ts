import { Router, Request, Response, NextFunction } from 'express';
import { evolutionsService } from './evolutions.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';

export const evolutionsRouter = Router();

evolutionsRouter.use(authenticate);
evolutionsRouter.use(requireTenant);

evolutionsRouter.get('/patient-evolution/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const evolutions = await evolutionsService.list(
      req.auth!.tenantId!,
      req.params.patientId as string,
    );
    return success(res, evolutions);
  } catch (err) {
    next(err);
  }
});

evolutionsRouter.post('/patient-evolution/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const evolution = await evolutionsService.create(
      req.auth!.tenantId!,
      req.params.patientId as string,
      req.body,
    );
    return created(res, evolution);
  } catch (err) {
    next(err);
  }
});
