import { Router, Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service';
import { success } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);
dashboardRouter.use(requireTenant);

dashboardRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await dashboardService.getDashboard(req.auth!.tenantId!);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});
