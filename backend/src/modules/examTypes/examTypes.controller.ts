import { Router, Request, Response, NextFunction } from 'express';
import { examTypesService } from './examTypes.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';

export const examTypesRouter = Router();

examTypesRouter.use(authenticate);
examTypesRouter.use(requireTenant);

examTypesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const segment = req.query.segment as string | undefined;
    const items = await examTypesService.list(req.auth!.tenantId!, segment);
    return success(res, items);
  } catch (err) {
    next(err);
  }
});

examTypesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await examTypesService.create(req.auth!.tenantId!, req.body);
    return created(res, item);
  } catch (err) {
    next(err);
  }
});

examTypesRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await examTypesService.update(req.auth!.tenantId!, req.params.id as string, req.body);
    return success(res, item);
  } catch (err) {
    next(err);
  }
});

examTypesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await examTypesService.remove(req.auth!.tenantId!, req.params.id as string);
    return success(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

examTypesRouter.post('/seed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await examTypesService.seed(req.auth!.tenantId!, req.body.segment);
    return success(res, { seeded: true });
  } catch (err) {
    next(err);
  }
});
