import { Router, Request, Response, NextFunction } from 'express';
import { procedureTemplatesService } from './procedureTemplates.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { createAuditLog } from '../../shared/middleware/audit';

export const procedureTemplatesRouter = Router();

procedureTemplatesRouter.use(authenticate);
procedureTemplatesRouter.use(requireTenant);

procedureTemplatesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await procedureTemplatesService.list(req.auth!.tenantId!);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

procedureTemplatesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await procedureTemplatesService.create(req.auth!.tenantId!, req.body);
    await createAuditLog({
      req,
      action: 'procedureTemplate.create',
      entity: 'ProcedureTemplate',
      entityId: template.id,
    });
    return created(res, template);
  } catch (err) {
    next(err);
  }
});

procedureTemplatesRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await procedureTemplatesService.update(
      req.auth!.tenantId!,
      req.params.id as string,
      req.body,
    );
    await createAuditLog({
      req,
      action: 'procedureTemplate.update',
      entity: 'ProcedureTemplate',
      entityId: template.id,
    });
    return success(res, template);
  } catch (err) {
    next(err);
  }
});

procedureTemplatesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await procedureTemplatesService.remove(req.auth!.tenantId!, req.params.id as string);
    await createAuditLog({
      req,
      action: 'procedureTemplate.delete',
      entity: 'ProcedureTemplate',
      entityId: req.params.id as string,
    });
    return noContent(res);
  } catch (err) {
    next(err);
  }
});
