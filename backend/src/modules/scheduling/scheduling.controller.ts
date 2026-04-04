import { Router, Request, Response } from 'express';
import { schedulingService } from './scheduling.service';
import { bookCallSchema, updateConfigSchema, updateCallStatusSchema } from './scheduling.validators';
import { AppError } from '../../shared/middleware/error-handler';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireRole, requireTenant } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';

const router = Router();

// ==========================================
// PUBLIC ROUTES (no auth)
// ==========================================

// GET /available-dates
router.get('/available-dates', async (_req: Request, res: Response, next) => {
  try {
    const dates = await schedulingService.getAvailableDates();
    return success(res, dates);
  } catch (err) { next(err); }
});

// GET /available-slots/:date
router.get('/available-slots/:date', async (req: Request, res: Response, next) => {
  try {
    const date = req.params.date as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'INVALID_DATE', 'Data deve estar no formato YYYY-MM-DD');
    }
    const slots = await schedulingService.getAvailableSlots(date);
    return success(res, slots);
  } catch (err) { next(err); }
});

// POST /book (public — used by chatbot and landing page)
router.post('/book', async (req: Request, res: Response, next) => {
  try {
    const data = bookCallSchema.parse(req.body);
    // tenantId comes from auth if available, otherwise from body
    const tenantId = (req as any).auth?.tenantId || req.body.tenantId || null;
    const call = await schedulingService.bookCall(data, tenantId);
    return created(res, call);
  } catch (err) { next(err); }
});

// ==========================================
// ADMIN ROUTES (SUPER_ADMIN only)
// ==========================================

// GET /config
router.get('/config', authenticate, requireRole('SUPER_ADMIN'), async (_req: Request, res: Response) => {
  const config = await schedulingService.getConfig();
  return success(res, config);
});

// PUT /config
router.put('/config', authenticate, requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
  const data = updateConfigSchema.parse(req.body);
  const config = await schedulingService.updateConfig(data);
  return success(res, config);
});

// GET /today — today's appointments for dashboard
router.get('/today', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const appointments = await schedulingService.getTodayAppointments(req.auth!.tenantId!);
    return success(res, appointments);
  } catch (err) { next(err); }
});

// GET /calls
router.get('/calls', authenticate, requireTenant, async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const status = req.query.status as string | undefined;
  const date = req.query.date as string | undefined;

  const { calls, total } = await schedulingService.listCalls(req.auth!.tenantId!, {
    ...pagination,
    status,
    date,
  });

  console.log('[AGENDAMENTOS] tenantId:', req.auth!.tenantId);
  console.log('[AGENDAMENTOS] filtro status:', status, 'data:', date);
  console.log('[AGENDAMENTOS] total encontrado:', total);

  return success(res, calls, paginationMeta(total, pagination.page, pagination.limit));
});

// PATCH /calls/:id
router.patch('/calls/:id', authenticate, requireTenant, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = updateCallStatusSchema.parse(req.body);
  const call = await schedulingService.updateCallStatus(id, data, req.auth!.tenantId!);
  return success(res, call);
});

// DELETE /calls/:id
router.delete('/calls/:id', authenticate, requireTenant, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const call = await schedulingService.cancelCall(id, req.auth!.tenantId!);
  return success(res, call);
});

export default router;
