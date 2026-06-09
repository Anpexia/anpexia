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
    const body = { ...req.body };
    if (!body.doctorId) body.doctorId = req.auth!.userId;
    const evolution = await evolutionsService.create(
      req.auth!.tenantId!,
      req.params.patientId as string,
      body,
    );
    return created(res, evolution);
  } catch (err) {
    next(err);
  }
});

// Edita uma evolucao estruturada. Permitido SOMENTE ao autor (doctorId), senao 403.
evolutionsRouter.put('/patient-evolution/:patientId/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const evolution = await evolutionsService.update(
      req.auth!.tenantId!,
      req.params.id as string,
      req.auth!.userId,
      { ...req.body },
    );
    return success(res, evolution);
  } catch (err) {
    next(err);
  }
});
