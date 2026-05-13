import { Router, Request, Response, NextFunction } from 'express';
import { privateProceduresService } from './privateProcedures.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';
import { createAuditLog } from '../../shared/middleware/audit';
import { AppError } from '../../shared/middleware/error-handler';

export const privateProceduresRouter = Router();

privateProceduresRouter.use(authenticate);
privateProceduresRouter.use(requireTenant);

privateProceduresRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await privateProceduresService.list(req.auth!.tenantId!);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

privateProceduresRouter.post('/', requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const procedure = await privateProceduresService.create(req.auth!.tenantId!, req.body);
    await createAuditLog({
      req,
      action: 'privateProcedure.create',
      entity: 'PrivateProcedure',
      entityId: procedure.id,
    });
    return created(res, procedure);
  } catch (err) {
    next(err);
  }
});

privateProceduresRouter.put('/:id', requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const procedure = await privateProceduresService.update(
      req.auth!.tenantId!,
      req.params.id as string,
      req.body,
    );
    await createAuditLog({
      req,
      action: 'privateProcedure.update',
      entity: 'PrivateProcedure',
      entityId: procedure.id,
    });
    return success(res, procedure);
  } catch (err) {
    next(err);
  }
});

privateProceduresRouter.delete('/:id', requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await privateProceduresService.remove(req.auth!.tenantId!, req.params.id as string);
    await createAuditLog({
      req,
      action: 'privateProcedure.delete',
      entity: 'PrivateProcedure',
      entityId: req.params.id as string,
    });
    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// Router to be mounted under /api/v1/scheduling for attach-to-call endpoint.
export const privateProcedureCallsRouter = Router();

privateProcedureCallsRouter.use(authenticate);
privateProcedureCallsRouter.use(requireTenant);

privateProcedureCallsRouter.post(
  '/calls/:id/private-procedure',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callId = req.params.id as string;
      const { privateProcedureId, notes, doctorId } = req.body || {};
      if (!privateProcedureId || typeof privateProcedureId !== 'string') {
        throw new AppError(400, 'PROCEDURE_ID_REQUIRED', 'privateProcedureId e obrigatorio');
      }
      const link = await privateProceduresService.attachToCall(
        req.auth!.tenantId!,
        callId,
        privateProcedureId,
        notes,
        doctorId,
      );
      await createAuditLog({
        req,
        action: 'privateProcedure.attach',
        entity: 'PrivateProcedureCall',
        entityId: link.id,
      });
      return created(res, link);
    } catch (err) {
      next(err);
    }
  },
);

privateProcedureCallsRouter.put(
  '/calls/:id/private-procedures',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callId = req.params.id as string;
      const procedures = Array.isArray(req.body?.procedures) ? req.body.procedures : [];
      const result = await privateProceduresService.replaceForCall(
        req.auth!.tenantId!,
        callId,
        procedures,
      );
      await createAuditLog({
        req,
        action: 'privateProcedure.replace',
        entity: 'PrivateProcedureCall',
        entityId: callId,
      });
      return success(res, result);
    } catch (err) {
      next(err);
    }
  },
);
