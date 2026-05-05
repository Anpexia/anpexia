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

// GET /available-dates?tenantId=...
router.get('/available-dates', async (req: Request, res: Response, next) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) throw new AppError(400, 'MISSING_TENANT', 'tenantId e obrigatorio');
    const dates = await schedulingService.getAvailableDates(tenantId);
    return success(res, dates);
  } catch (err) { next(err); }
});

// GET /available-slots/:date?doctorId=...&tenantId=...
router.get('/available-slots/:date', async (req: Request, res: Response, next) => {
  try {
    const date = req.params.date as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'INVALID_DATE', 'Data deve estar no formato YYYY-MM-DD');
    }
    const doctorId = (req.query.doctorId as string) || null;
    const tenantId = req.query.tenantId as string;
    if (!tenantId) throw new AppError(400, 'MISSING_TENANT', 'tenantId e obrigatorio');
    const slots = await schedulingService.getAvailableSlots(date, doctorId, tenantId);
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
    const tenantId = req.auth!.tenantId!;
    const call = await prisma.scheduledCall.findFirst({ where: { id, tenantId } });
    if (!call) throw new AppError(404, 'NOT_FOUND', 'Agendamento não encontrado');

    const revertMap: Record<string, string> = { confirmed: 'scheduled', awaiting_payment: 'confirmed', present: 'confirmed', attended: 'in_attendance', completed: 'attended' };
    const newStatus = revertMap[call.status];
    if (!newStatus) throw new AppError(400, 'INVALID_REVERT', 'Status não pode ser revertido');

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: any = { status: newStatus };
      if (call.status === 'present') {
        updateData.checkinAt = null;
      }
      if (newStatus === 'confirmed' || newStatus === 'scheduled') {
        updateData.calledAt = null;
      }
      // When reverting back to a queue-visible status, update checkinAt to now
      // so the patient appears in today's queue regardless of original check-in date
      if (['present', 'in_attendance', 'attended'].includes(newStatus) && call.checkinAt) {
        updateData.checkinAt = new Date();
      }
      const u = await tx.scheduledCall.update({ where: { id }, data: updateData });

      if (call.status === 'completed') {
        // Clean up procedure records and financial transactions
        await tx.scheduledCallProcedure.deleteMany({ where: { scheduledCallId: id } });
        await tx.privateProcedureCall.deleteMany({ where: { scheduledCallId: id } });
        await tx.financialTransaction.deleteMany({
          where: { tenantId, notes: { contains: `[AGENDAMENTO:${id}]` } },
        });
      }

      return u;
    });

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

// DELETE /calls/:id/permanent — hard delete (OWNER, MANAGER, SUPER_ADMIN)
router.delete('/calls/:id/permanent', authenticate, requireTenant, requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const result = await schedulingService.hardDeleteCall(req.params.id as string, req.auth!.tenantId!);
    await logAction({ ...auditCtx(req), action: 'DELETE', entity: 'APPOINTMENT', entityId: req.params.id as string, metadata: { permanent: true } });
    return success(res, result);
  } catch (err) { next(err); }
});

// GET /calls/:id/payment-summary — payment status for a call's procedures
router.get('/calls/:id/payment-summary', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const callId = req.params.id as string;

    const call = await prisma.scheduledCall.findFirst({
      where: { id: callId, tenantId },
      select: { paymentType: true },
    });
    if (!call) return res.status(404).json({ error: { message: 'Agendamento nao encontrado' } });

    const procedures = await prisma.privateProcedureCall.findMany({
      where: { scheduledCallId: callId },
      include: { privateProcedure: { select: { id: true, name: true, value: true, type: true } } },
    });

    const items = procedures.map(p => ({
      id: p.id,
      procedureId: p.privateProcedureId,
      name: p.privateProcedure.name,
      type: p.privateProcedure.type,
      value: p.privateProcedure.value ?? 0,
      paymentStatus: p.paymentStatus || 'pending',
      paymentMethod: p.paymentMethod,
      paidAt: p.paidAt,
    }));

    const total = items.reduce((s, i) => s + i.value, 0);
    const paid = items.filter(i => i.paymentStatus === 'paid').reduce((s, i) => s + i.value, 0);

    return success(res, { items, total, paid, pending: total - paid });
  } catch (err) { next(err); }
});

// POST /calls/:id/pay — register payment for procedures
router.post('/calls/:id/pay', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const callId = req.params.id as string;
    const { procedureCallIds, paymentMethod } = req.body as { procedureCallIds: string[]; paymentMethod: string };

    if (!procedureCallIds?.length || !paymentMethod) {
      return res.status(400).json({ error: { message: 'procedureCallIds e paymentMethod sao obrigatorios' } });
    }

    const call = await prisma.scheduledCall.findFirst({ where: { id: callId, tenantId } });
    if (!call) return res.status(404).json({ error: { message: 'Agendamento nao encontrado' } });

    await prisma.privateProcedureCall.updateMany({
      where: { id: { in: procedureCallIds }, scheduledCallId: callId },
      data: { paymentStatus: 'paid', paymentMethod, paidAt: new Date() },
    });

    // If all procedures are now paid and status is awaiting_payment, transition to present
    if (call.status === 'awaiting_payment') {
      const unpaid = await prisma.privateProcedureCall.count({
        where: { scheduledCallId: callId, paymentStatus: { not: 'paid' } },
      });
      if (unpaid === 0) {
        await prisma.scheduledCall.update({
          where: { id: callId },
          data: { status: 'present' },
        });
      }
    }

    return success(res, { updated: procedureCallIds.length });
  } catch (err) { next(err); }
});

// POST /calls/:id/add-procedure — add a procedure to an existing call
router.post('/calls/:id/add-procedure', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const callId = req.params.id as string;
    const { privateProcedureId, doctorId } = req.body as { privateProcedureId: string; doctorId?: string };

    if (!privateProcedureId) {
      return res.status(400).json({ error: { message: 'privateProcedureId e obrigatorio' } });
    }

    const call = await prisma.scheduledCall.findFirst({ where: { id: callId, tenantId } });
    if (!call) return res.status(404).json({ error: { message: 'Agendamento nao encontrado' } });

    const entry = await prisma.privateProcedureCall.create({
      data: {
        scheduledCallId: callId,
        privateProcedureId,
        doctorId: doctorId || call.doctorId || undefined,
        paymentStatus: 'pending',
      },
      include: { privateProcedure: { select: { id: true, name: true, value: true, type: true } } },
    });

    return success(res, entry);
  } catch (err) { next(err); }
});

// GET /queue — today's queue (patients checked in today, regardless of appointment date)
router.get('/queue', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const doctorId = (req.query.doctorId as string) || null;

    const todaySP = new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dayStart = new Date(`${todaySP}T00:00:00-03:00`);
    const dayEnd = new Date(`${todaySP}T23:59:59.999-03:00`);

    const where: any = {
      tenantId,
      checkinAt: { gte: dayStart, lte: dayEnd },
      status: { in: ['present', 'in_attendance', 'attended'] },
    };
    if (doctorId) where.doctorId = doctorId;

    const queue = await prisma.scheduledCall.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true } },
      },
      orderBy: { checkinAt: 'asc' },
    });

    return success(res, queue);
  } catch (err) { next(err); }
});

// PATCH /queue/:id/call — doctor marks patient as "called" (in attendance)
router.patch('/queue/:id/call', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const tenantId = req.auth!.tenantId!;

    const call = await prisma.scheduledCall.findFirst({ where: { id, tenantId, status: 'present' } });
    if (!call) throw new AppError(404, 'NOT_FOUND', 'Paciente não encontrado na fila');

    const updated = await prisma.scheduledCall.update({
      where: { id },
      data: { calledAt: new Date() },
    });

    return success(res, updated);
  } catch (err) { next(err); }
});

// PATCH /queue/:id/uncall — undo "call" (put back in waiting)
router.patch('/queue/:id/uncall', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const tenantId = req.auth!.tenantId!;

    const call = await prisma.scheduledCall.findFirst({ where: { id, tenantId, status: 'present' } });
    if (!call) throw new AppError(404, 'NOT_FOUND', 'Paciente não encontrado na fila');

    const updated = await prisma.scheduledCall.update({
      where: { id },
      data: { calledAt: null },
    });

    return success(res, updated);
  } catch (err) { next(err); }
});

// PATCH /queue/:id/start — start attendance (status → in_attendance)
router.patch('/queue/:id/start', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const tenantId = req.auth!.tenantId!;

    const call = await prisma.scheduledCall.findFirst({ where: { id, tenantId } });
    if (!call) throw new AppError(404, 'NOT_FOUND', 'Agendamento nao encontrado');
    if (!call.calledAt) throw new AppError(400, 'NOT_CALLED', 'Paciente ainda nao foi chamado');

    const updated = await prisma.scheduledCall.update({
      where: { id },
      data: { status: 'in_attendance' },
    });

    return success(res, updated);
  } catch (err) { next(err); }
});

// GET /queue/history — completed appointments by date range
router.get('/queue/history', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const doctorId = (req.query.doctorId as string) || null;
    const from = req.query.from as string;
    const to = req.query.to as string;

    const todaySP = new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dayFrom = from || todaySP;
    const dayTo = to || todaySP;

    const where: any = {
      tenantId,
      status: { in: ['completed', 'attended'] },
      checkinAt: {
        gte: new Date(`${dayFrom}T00:00:00-03:00`),
        lte: new Date(`${dayTo}T23:59:59.999-03:00`),
      },
    };
    if (doctorId) where.doctorId = doctorId;

    const history = await prisma.scheduledCall.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true } },
      },
      orderBy: { checkinAt: 'desc' },
      take: 200,
    });

    return success(res, history);
  } catch (err) { next(err); }
});

// PATCH /queue/:id/finish — doctor finishes attendance (status → attended, NOT completed)
router.patch('/queue/:id/finish', authenticate, requireTenant, async (req: Request, res: Response, next) => {
  try {
    const id = req.params.id as string;
    const tenantId = req.auth!.tenantId!;

    const call = await prisma.scheduledCall.findFirst({ where: { id, tenantId, status: 'in_attendance' } });
    if (!call) throw new AppError(404, 'NOT_FOUND', 'Atendimento nao encontrado');

    const updated = await prisma.scheduledCall.update({
      where: { id },
      data: { status: 'attended' },
    });

    return success(res, updated);
  } catch (err) { next(err); }
});

export default router;
