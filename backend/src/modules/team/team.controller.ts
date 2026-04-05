import { Router, Request, Response, NextFunction } from 'express';
import { teamService } from './team.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';

export const teamRouter = Router();

teamRouter.use(authenticate);
teamRouter.use(requireTenant);

// --- /me routes MUST come before /:id routes ---

// Get own profile — any authenticated user
teamRouter.get('/me/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await teamService.getProfile(req.auth!.userId);
    return success(res, user);
  } catch (err) {
    next(err);
  }
});

// Update own profile — any authenticated user
teamRouter.put('/me/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await teamService.updateProfile(req.auth!.userId, req.body);
    return success(res, user);
  } catch (err) {
    next(err);
  }
});

// Change own password — any authenticated user
teamRouter.post('/me/change-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await teamService.changePassword(req.auth!.userId, currentPassword, newPassword);
    return success(res, { message: 'Senha alterada com sucesso' });
  } catch (err) {
    next(err);
  }
});

// --- Team management routes ---

// List team members — OWNER and MANAGER only
teamRouter.get('/', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await teamService.list(req.auth!.tenantId!);
    return success(res, users);
  } catch (err) {
    next(err);
  }
});

// Create team member — OWNER only
teamRouter.post('/', requireRole('OWNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[EQUIPE] body:', { ...req.body, password: '***' }, 'tenantId:', req.auth!.tenantId);
    const user = await teamService.create(req.auth!.tenantId!, req.body);
    return created(res, user);
  } catch (err) {
    next(err);
  }
});

// Update team member — OWNER only
teamRouter.put('/:id', requireRole('OWNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await teamService.update(req.auth!.tenantId!, req.params.id as string, req.body);
    return success(res, user);
  } catch (err) {
    next(err);
  }
});

// Toggle active — OWNER only
teamRouter.patch('/:id/toggle', requireRole('OWNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await teamService.toggleActive(req.auth!.tenantId!, req.params.id as string);
    return success(res, user);
  } catch (err) {
    next(err);
  }
});

// Remove member — OWNER and MANAGER
teamRouter.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await teamService.remove(req.auth!.tenantId!, req.params.id as string, req.auth!.userId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});
