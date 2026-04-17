import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import { schedulingService } from './scheduling.service';
import {
  bookCallSchema,
  updateConfigSchema,
  updateCallStatusSchema,
  linkProceduresSchema,
  updateCallDoctorSchema,
  updateCallAuthorizationSchema,
  replaceProceduresSchema,
} from './scheduling.validators';
import { AppError } from '../../shared/middleware/error-handler';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireRole, requireTenant, optionalAuth } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { handleConfirmResponse } from './scheduling.confirm';
import { logAction, getClientIp } from '../../services/auditLog.service';

const router = Router();

function auditCtx(req: Request) {
  return {
    userId: req.auth?.userId,
    userEmail: req.auth?.email,
    userRole: req.auth?.role,
    tenantId: req.auth?.tenantId,
    ipAddress: getClientIp(req),
  };
}

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

    await logAction({ ...auditCtx(req), tenantId: tenantId || null, action: 'CREATE', entity: 'APPOINTMENT', entityId: (call as any)?.id, metadata: { name: data.name, date: (call as any)?.date } });

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
  await logAction({ ...auditCtx(req), action: 'UPDATE', entity: 'APPOINTMENT', entityId: id, metadata: { status: data.status } });
  return success(res, call);
});

// POST /calls/:id/procedures — link TUSS procedures to a realized call (append)
router.post('/calls/:id/procedures', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const data = linkProceduresSchema.parse(req.body);
    const call = await schedulingService.linkProcedures(id, req.auth!.tenantId!, data);
    return success(res, call);
  } catch (err) { next(err); }
});

// PUT /calls/:id/procedures — replace all linked procedures and re-sync financials
router.put('/calls/:id/procedures', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const data = replaceProceduresSchema.parse(req.body);
    const call = await schedulingService.replaceProcedures(id, req.auth!.tenantId!, data);
    return success(res, call);
  } catch (err) { next(err); }
});

// PATCH /calls/:id/doctor — assign or change the doctor, re-sync financials if completed
router.patch('/calls/:id/doctor', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const data = updateCallDoctorSchema.parse(req.body);
    const call = await schedulingService.updateCallDoctor(id, req.auth!.tenantId!, data.doctorId);
    return success(res, call);
  } catch (err) { next(err); }
});

// POST /calls/:id/inventory — withdraw materials from stock for a completed appointment
router.post('/calls/:id/inventory', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const materials = Array.isArray(req.body?.materials) ? req.body.materials : [];
    const result = await schedulingService.withdrawInventoryForCall(
      id,
      req.auth!.tenantId!,
      materials,
      req.auth?.userId,
    );
    if (!result.alreadyProcessed) {
      await logAction({
        ...auditCtx(req),
        action: 'INVENTORY_WITHDRAWAL',
        entity: 'APPOINTMENT',
        entityId: id,
        metadata: { callId: id, materials, movementCount: result.movements.length },
      });
    }
    return success(res, result);
  } catch (err) { next(err); }
});

// PATCH /calls/:id/authorization — update convenio authorization number
router.patch('/calls/:id/authorization', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const data = updateCallAuthorizationSchema.parse(req.body);
    const call = await schedulingService.updateCallAuthorization(id, req.auth!.tenantId!, data.authorizationNumber);
    return success(res, call);
  } catch (err) { next(err); }
});

// PATCH /calls/:id/revert-status — revert confirmed→scheduled or completed→confirmed
router.patch('/calls/:id/revert-status', authenticate, requireTenant, requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const call = await prisma.scheduledCall.findFirst({ where: { id, tenantId: req.auth!.tenantId! } });
    if (!call) throw new AppError(404, 'NOT_FOUND', 'Agendamento não encontrado');

    const revertMap: Record<string, string> = { confirmed: 'scheduled', completed: 'confirmed' };
    const newStatus = revertMap[call.status];
    if (!newStatus) throw new AppError(400, 'INVALID_REVERT', 'Status não pode ser revertido');

    const updated = await prisma.scheduledCall.update({ where: { id }, data: { status: newStatus } });
    await logAction({ ...auditCtx(req), action: 'revert_status', entity: 'scheduled_call', entityId: id, metadata: { statusAnterior: call.status, statusNovo: newStatus } });

    return success(res, updated);
  } catch (err) { next(err); }
});

// DELETE /calls/:id
router.delete('/calls/:id', authenticate, requireTenant, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const call = await schedulingService.cancelCall(id, req.auth!.tenantId!);

  await logAction({ ...auditCtx(req), action: 'DELETE', entity: 'APPOINTMENT', entityId: id });

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
