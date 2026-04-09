import { Router, Request, Response } from 'express';
import { schedulingService } from './scheduling.service';
import { bookCallSchema, updateConfigSchema, updateCallStatusSchema, linkProceduresSchema } from './scheduling.validators';
import { AppError } from '../../shared/middleware/error-handler';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireRole, requireTenant, optionalAuth } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { handleConfirmResponse } from './scheduling.confirm';

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

// GET /available-slots/:date?doctorId=...
router.get('/available-slots/:date', async (req: Request, res: Response, next) => {
  try {
    const date = req.params.date as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'INVALID_DATE', 'Data deve estar no formato YYYY-MM-DD');
    }
    const doctorId = (req.query.doctorId as string) || null;
    const slots = await schedulingService.getAvailableSlots(date, doctorId);
    return success(res, slots);
  } catch (err) { next(err); }
});

// POST /confirm-response (public — used by demo page and WhatsApp webhook)
router.post('/confirm-response', async (req: Request, res: Response, next) => {
  try {
    const { appointmentId, action } = req.body;
    if (!appointmentId || !action) {
      throw new AppError(400, 'MISSING_FIELDS', 'appointmentId e action sao obrigatorios');
    }
    const result = await handleConfirmResponse(appointmentId, action);
    return success(res, result);
  } catch (err) { next(err); }
});

// POST /book (public with optional auth — used by chatbot, landing page, and app)
router.post('/book', optionalAuth, async (req: Request, res: Response, next) => {
  try {
    const data = bookCallSchema.parse(req.body);
    // tenantId comes from auth if available, otherwise from body
    const tenantId = (req as any).auth?.tenantId || req.body.tenantId || null;
    const call = await schedulingService.bookCall(data, tenantId);

    // Send confirmation email (non-blocking)
    if (data.email && tenantId) {
      import('../../services/email-templates').then(({ sendAppointmentConfirmationEmail }) => {
        sendAppointmentConfirmationEmail(tenantId, {
          name: data.name,
          email: data.email!,
          date: call.date,
        }).catch(err => console.error('[EMAIL] Confirmation email failed:', err.message));
      });
    }

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

  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const { calls, total } = await schedulingService.listCalls(req.auth!.tenantId!, {
    ...pagination,
    status,
    date,
    from,
    to,
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

// POST /calls/:id/procedures — link TUSS procedures to a realized call
router.post('/calls/:id/procedures', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const data = linkProceduresSchema.parse(req.body);
    const call = await schedulingService.linkProcedures(id, req.auth!.tenantId!, data);
    return success(res, call);
  } catch (err) { next(err); }
});

// DELETE /calls/:id
router.delete('/calls/:id', authenticate, requireTenant, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const call = await schedulingService.cancelCall(id, req.auth!.tenantId!);

  // Send cancellation email (non-blocking)
  if (call.email && req.auth!.tenantId) {
    import('../../services/email-templates').then(({ sendCancellationEmail }) => {
      sendCancellationEmail(req.auth!.tenantId!, {
        name: call.name,
        email: call.email!,
        date: call.date,
      }).catch(err => console.error('[EMAIL] Cancellation email failed:', err.message));
    });
  }

  return success(res, call);
});

export default router;
