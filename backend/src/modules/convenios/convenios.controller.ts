import { Router, Request, Response, NextFunction } from 'express';
import { conveniosService } from './convenios.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';

export const conveniosRouter = Router();

conveniosRouter.use(authenticate);
conveniosRouter.use(requireTenant);

// ---- Convenios (tenant-level CRUD) ----

conveniosRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await conveniosService.list(req.auth!.tenantId!);
    console.log('[CONVENIOS] tenantId:', req.auth!.tenantId, 'resultado:', data.length);
    return success(res, data);
  } catch (err) { next(err); }
});

conveniosRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conv = await conveniosService.create(req.auth!.tenantId!, req.body);
    return created(res, conv);
  } catch (err) { next(err); }
});

conveniosRouter.post('/seed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await conveniosService.seed(req.auth!.tenantId!);
    return success(res, { message: 'Convenios padrao criados' });
  } catch (err) { next(err); }
});

conveniosRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conv = await conveniosService.update(req.auth!.tenantId!, req.params.id as string, req.body);
    return success(res, conv);
  } catch (err) { next(err); }
});

conveniosRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await conveniosService.remove(req.auth!.tenantId!, req.params.id as string);
    return noContent(res);
  } catch (err) { next(err); }
});

// ---- Patient Convenio ----

conveniosRouter.get('/patients/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await conveniosService.getPatientConvenio(req.params.patientId as string);
    return success(res, data);
  } catch (err) { next(err); }
});

conveniosRouter.post('/patients/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await conveniosService.upsertPatientConvenio(req.params.patientId as string, req.body);
    return success(res, data);
  } catch (err) { next(err); }
});

// ---- Autorizacoes ----

conveniosRouter.get('/patients/:patientId/autorizacoes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await conveniosService.listAutorizacoes(req.params.patientId as string);
    return success(res, data);
  } catch (err) { next(err); }
});

conveniosRouter.post('/patients/:patientId/autorizacoes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await conveniosService.createAutorizacao(req.auth!.tenantId!, req.params.patientId as string, {
      ...req.body,
      criadoPor: req.auth!.userId,
    });
    return created(res, data);
  } catch (err) { next(err); }
});

conveniosRouter.put('/autorizacoes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await conveniosService.updateAutorizacao(req.auth!.tenantId!, req.params.id as string, req.body);
    return success(res, data);
  } catch (err) { next(err); }
});

// ---- Dashboard ----

conveniosRouter.get('/dashboard/pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await conveniosService.getPendingAutorizacoes(req.auth!.tenantId!);
    return success(res, data);
  } catch (err) { next(err); }
});
