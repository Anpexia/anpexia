import { Router, Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service';
import { success } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';

export const settingsRouter = Router();

// Any authenticated user can read role permissions for their tenant
settingsRouter.get('/role-permissions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.auth?.tenantId) return success(res, null);
    const perms = await settingsService.getRolePermissions(req.auth.tenantId);
    return success(res, perms);
  } catch (err) { next(err); }
});

settingsRouter.use(authenticate);
settingsRouter.use(requireTenant);
settingsRouter.use(requireRole('OWNER', 'MANAGER'));

// GET /settings — full settings
settingsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.getSettings(req.auth!.tenantId!);
    return success(res, data);
  } catch (err) { next(err); }
});

// PUT /settings/clinica — update clinic info
settingsRouter.put('/clinica', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.updateClinica(req.auth!.tenantId!, req.body);
    return success(res, data);
  } catch (err) { next(err); }
});

// PUT /settings/horarios — update business hours
settingsRouter.put('/horarios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.updateHorarios(req.auth!.tenantId!, req.body);
    return success(res, data);
  } catch (err) { next(err); }
});

// PUT /settings/email — update email config
settingsRouter.put('/email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.updateEmail(req.auth!.tenantId!, req.body);
    return success(res, data);
  } catch (err) { next(err); }
});

// POST /settings/email/test — send test email
settingsRouter.post('/email/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const to = req.body.to;
    const result = await settingsService.testEmail(req.auth!.tenantId!, to);
    return success(res, result);
  } catch (err) { next(err); }
});

// PUT /settings/role-permissions — update custom role menu access
settingsRouter.put('/role-permissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.updateRolePermissions(req.auth!.tenantId!, req.body.rolePermissions);
    return success(res, data);
  } catch (err) { next(err); }
});
