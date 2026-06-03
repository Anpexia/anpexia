import { Router, Request, Response, NextFunction } from 'express';
import { anamnesisService } from './anamnesis.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';

export const anamnesisRouter = Router();

anamnesisRouter.use(authenticate);
anamnesisRouter.use(requireTenant);

anamnesisRouter.get('/anamnesis/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const anamnesis = await anamnesisService.get(
      req.auth!.tenantId!,
      req.params.patientId as string,
    );
    return success(res, anamnesis);
  } catch (err) {
    next(err);
  }
});

anamnesisRouter.post('/anamnesis/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = req.body;
    const doctorId = req.body.doctorId || req.auth!.userId;

    const anamnesis = await anamnesisService.create(
      req.auth!.tenantId!,
      req.params.patientId as string,
      doctorId,
      data,
    );
    return created(res, anamnesis);
  } catch (err) {
    next(err);
  }
});

anamnesisRouter.put('/anamnesis/:patientId/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, version } = req.body;

    const anamnesis = await anamnesisService.update(
      req.auth!.tenantId!,
      req.params.id as string,
      data,
      typeof version === 'number' ? version : undefined,
    );
    return success(res, anamnesis);
  } catch (err) {
    next(err);
  }
});
