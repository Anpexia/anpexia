import { Router, Request, Response, NextFunction } from 'express';
import { teamService } from './team.service';
import { availabilityService } from './availability.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';
import { logAction, getClientIp } from '../../services/auditLog.service';

function auditCtx(req: Request) {
  return {
    userId: req.auth?.userId,
    userEmail: req.auth?.email,
    userRole: req.auth?.role,
    tenantId: req.auth?.tenantId,
    ipAddress: getClientIp(req),
  };
}

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

// List active doctors — any authenticated user of the tenant
teamRouter.get('/doctors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doctors = await teamService.listDoctors(req.auth!.tenantId!);
    return success(res, doctors);
  } catch (err) {
    next(err);
  }
});

// Create team member — OWNER and MANAGER
teamRouter.post('/', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[EQUIPE] body:', { ...req.body, password: '***' }, 'tenantId:', req.auth!.tenantId);
    const user = await teamService.create(req.auth!.tenantId!, req.body, req.auth!.role);
    await logAction({ ...auditCtx(req), action: 'CREATE', entity: 'USER', entityId: (user as any)?.id, metadata: { email: (user as any)?.email, role: (user as any)?.role } });
    return created(res, user);
  } catch (err) {
    next(err);
  }
});

// Update team member — OWNER only
teamRouter.put('/:id', requireRole('OWNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await teamService.update(req.auth!.tenantId!, req.params.id as string, req.body);
    await logAction({ ...auditCtx(req), action: 'UPDATE', entity: 'USER', entityId: req.params.id as string });
    return success(res, user);
  } catch (err) {
    next(err);
  }
});

// Update doctor schedule — OWNER and MANAGER
teamRouter.put('/:id/horarios', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updateData: any = { horarios: req.body.horarios };
    if (req.body.duracaoConsulta !== undefined) {
      updateData.duracaoConsulta = Number(req.body.duracaoConsulta) || null;
    }
    const user = await teamService.update(req.auth!.tenantId!, req.params.id as string, updateData);
    return success(res, user);
  } catch (err) {
    next(err);
  }
});

// Update doctor room assignments — OWNER and MANAGER
teamRouter.put('/:id/salas', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await teamService.update(req.auth!.tenantId!, req.params.id as string, { salas: req.body.salas });
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
    await logAction({ ...auditCtx(req), action: 'DELETE', entity: 'USER', entityId: req.params.id as string });
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

// --- Availability Periods ---

// Update schedule mode — OWNER and MANAGER
teamRouter.put('/:id/schedule-mode', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode } = req.body;
    if (!['fixed', 'period'].includes(mode)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_MODE', message: 'Modo invalido' } });
    }
    const result = await availabilityService.updateScheduleMode(req.auth!.tenantId!, req.params.id as string, mode);
    return success(res, result);
  } catch (err) { next(err); }
});

// List availability periods for a doctor
teamRouter.get('/:id/availability-periods', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const periods = await availabilityService.listPeriods(req.auth!.tenantId!, req.params.id as string);
    return success(res, periods);
  } catch (err) { next(err); }
});

// Create availability period
teamRouter.post('/:id/availability-periods', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const period = await availabilityService.createPeriod(req.auth!.tenantId!, req.params.id as string, req.body);
    return created(res, period);
  } catch (err) { next(err); }
});

// Delete availability period
teamRouter.delete('/:id/availability-periods/:periodId', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await availabilityService.deletePeriod(req.auth!.tenantId!, req.params.periodId as string);
    return noContent(res);
  } catch (err) { next(err); }
});
