import { Router, Request, Response, NextFunction } from 'express';
import { repasseTypesService } from './repasseTypes.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';

export const repasseTypesRouter = Router();

repasseTypesRouter.use(authenticate);
repasseTypesRouter.use(requireTenant);

// GET /repasse-types — list for tenant
repasseTypesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await repasseTypesService.list(req.auth!.tenantId!);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

// POST /repasse-types — create custom type (OWNER or SUPER_ADMIN)
repasseTypesRouter.post(
  '/',
  requireRole('OWNER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = req.body?.name as string;
      const item = await repasseTypesService.create(req.auth!.tenantId!, name);
      return created(res, item);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /repasse-types/:id — delete (OWNER or SUPER_ADMIN)
repasseTypesRouter.delete(
  '/:id',
  requireRole('OWNER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await repasseTypesService.remove(req.auth!.tenantId!, req.params.id as string);
      return noContent(res);
    } catch (err) {
      next(err);
    }
  },
);
