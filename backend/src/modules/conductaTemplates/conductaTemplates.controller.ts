import { Router, Request, Response, NextFunction } from 'express';
import { conductaTemplatesService } from './conductaTemplates.service';
import { createTemplateSchema, updateTemplateSchema } from './conductaTemplates.validators';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';
import { createAuditLog } from '../../shared/middleware/audit';

export const conductaTemplatesRouter = Router();

conductaTemplatesRouter.use(authenticate);
conductaTemplatesRouter.use(requireTenant);
// Somente quem atende tem biblioteca de modelos: médicos e profissionais de saúde.
// (Gerente e dono NÃO têm acesso a esta funcionalidade.)
conductaTemplatesRouter.use(requireRole('DOCTOR', 'HEALTH_PROFESSIONAL'));

conductaTemplatesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const context = req.query.context as string | undefined;
    const items = await conductaTemplatesService.list(req.auth!.tenantId!, req.auth!.userId, { search, context });
    return success(res, items);
  } catch (err) {
    next(err);
  }
});

conductaTemplatesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await conductaTemplatesService.getById(req.auth!.tenantId!, req.auth!.userId, req.params.id as string);
    return success(res, item);
  } catch (err) {
    next(err);
  }
});

conductaTemplatesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createTemplateSchema.parse(req.body);
    const item = await conductaTemplatesService.create(req.auth!.tenantId!, req.auth!.userId, data);
    await createAuditLog({ req, action: 'conducta_template.create', entity: 'ConductaTemplate', entityId: item.id });
    return created(res, item);
  } catch (err) {
    next(err);
  }
});

conductaTemplatesRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateTemplateSchema.parse(req.body);
    const item = await conductaTemplatesService.update(req.auth!.tenantId!, req.auth!.userId, req.params.id as string, data);
    await createAuditLog({ req, action: 'conducta_template.update', entity: 'ConductaTemplate', entityId: item.id });
    return success(res, item);
  } catch (err) {
    next(err);
  }
});

conductaTemplatesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await conductaTemplatesService.remove(req.auth!.tenantId!, req.auth!.userId, req.params.id as string);
    await createAuditLog({ req, action: 'conducta_template.delete', entity: 'ConductaTemplate', entityId: req.params.id as string });
    return noContent(res);
  } catch (err) {
    next(err);
  }
});
