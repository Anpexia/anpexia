import { Router, Request, Response, NextFunction } from 'express';
import { roomsService } from './rooms.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';

export const roomsRouter = Router();

roomsRouter.use(authenticate);
roomsRouter.use(requireTenant);

roomsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await roomsService.list(req.auth!.tenantId!);
    return success(res, data);
  } catch (err) { next(err); }
});

roomsRouter.post('/', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const room = await roomsService.create(req.auth!.tenantId!, req.body);
    return created(res, room);
  } catch (err) { next(err); }
});

roomsRouter.put('/:id', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const room = await roomsService.update(req.auth!.tenantId!, req.params.id as string, req.body);
    return success(res, room);
  } catch (err) { next(err); }
});

roomsRouter.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await roomsService.remove(req.auth!.tenantId!, req.params.id as string);
    return noContent(res);
  } catch (err) { next(err); }
});
