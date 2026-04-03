import { Router, Request, Response, NextFunction } from 'express';
import { messagingService } from './messaging.service';
import { createTemplateSchema, updateTemplateSchema, sendMessageSchema } from './messaging.validators';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';

export const messagingRouter = Router();

messagingRouter.use(authenticate);
messagingRouter.use(requireTenant);

// Templates
messagingRouter.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await messagingService.listTemplates(req.auth!.tenantId!);
    return success(res, templates);
  } catch (err) {
    next(err);
  }
});

messagingRouter.post('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createTemplateSchema.parse(req.body);
    const template = await messagingService.createTemplate(req.auth!.tenantId!, data);
    return created(res, template);
  } catch (err) {
    next(err);
  }
});

messagingRouter.put('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateTemplateSchema.parse(req.body);
    const template = await messagingService.updateTemplate(req.auth!.tenantId!, req.params.id as string, data);
    return success(res, template);
  } catch (err) {
    next(err);
  }
});

// Envio manual de mensagem
messagingRouter.post('/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = sendMessageSchema.parse(req.body);
    const result = await messagingService.sendMessage(req.auth!.tenantId!, data);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

// Histórico de mensagens enviadas
messagingRouter.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const status = req.query.status as string | undefined;

    const { messages, total } = await messagingService.listSentMessages(
      req.auth!.tenantId!,
      { skip, take: limit, status },
    );

    return success(res, messages, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

// Estatísticas de mensagens
messagingRouter.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await messagingService.getStats(req.auth!.tenantId!);
    return success(res, stats);
  } catch (err) {
    next(err);
  }
});
