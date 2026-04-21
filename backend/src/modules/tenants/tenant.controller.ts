import { Router, Request, Response, NextFunction } from 'express';
import { tenantService } from './tenant.service';
import { createTenantSchema, updateTenantSchema } from './tenant.validators';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { authService } from '../auth/auth.service';

export const tenantRouter = Router();

// Todas as rotas requerem autenticação de super admin
tenantRouter.use(authenticate);
tenantRouter.use(requireRole('SUPER_ADMIN', 'ADMIN'));

tenantRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { tenants, total } = await tenantService.list(skip, limit);
    return success(res, tenants, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

tenantRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.getById(req.params.id as string);
    return success(res, tenant);
  } catch (err) {
    next(err);
  }
});

tenantRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createTenantSchema.parse(req.body);
    const tenant = await tenantService.create(data);
    return created(res, tenant);
  } catch (err) {
    next(err);
  }
});

tenantRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateTenantSchema.parse(req.body);
    const tenant = await tenantService.update(req.params.id as string, data);
    return success(res, tenant);
  } catch (err) {
    next(err);
  }
});

tenantRouter.patch('/:id/modules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await tenantService.updateModules(req.params.id as string, req.body.modules);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

tenantRouter.patch('/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.toggleActive(req.params.id as string);
    return success(res, tenant);
  } catch (err) {
    next(err);
  }
});

tenantRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await tenantService.remove(req.params.id as string);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

tenantRouter.post('/:id/invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, error: { message: 'Nome e email são obrigatórios' } });
    }
    const tenant = await tenantService.getById(req.params.id as string);
    const user = await authService.createInvite({
      tenantId: tenant.id,
      name,
      email,
      role: role || 'OWNER',
    });
    return created(res, { ...user, invited: true });
  } catch (err) {
    next(err);
  }
});
