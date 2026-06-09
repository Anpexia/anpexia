import { Router, Request, Response, NextFunction } from 'express';
import { clinicalNotesService } from './clinicalNotes.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { getClientIp } from '../../services/auditLog.service';

export const clinicalNotesRouter = Router();

clinicalNotesRouter.use(authenticate);
clinicalNotesRouter.use(requireTenant);

// Lista o texto livre de um paciente filtrando por contexto (?context=ANAMNESE|EVOLUCAO)
clinicalNotesRouter.get('/clinical-notes/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = (req.query.context as string) || '';
    const notes = await clinicalNotesService.list(
      req.auth!.tenantId!,
      req.params.patientId as string,
      context,
    );
    return success(res, notes);
  } catch (err) {
    next(err);
  }
});

// Cria um novo registro de texto livre (append-only). Autor = usuário autenticado.
clinicalNotesRouter.post('/clinical-notes/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { context, content } = req.body;
    const note = await clinicalNotesService.create(
      req.auth!.tenantId!,
      req.params.patientId as string,
      { id: req.auth!.userId, email: req.auth!.email, role: req.auth!.role },
      context,
      content,
      { ip: getClientIp(req) },
    );
    return created(res, note);
  } catch (err) {
    next(err);
  }
});

// Edita um registro de texto livre. Permitido SOMENTE ao autor original (senão 403).
clinicalNotesRouter.put('/clinical-notes/:patientId/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content } = req.body;
    const note = await clinicalNotesService.update(
      req.auth!.tenantId!,
      req.params.id as string,
      { id: req.auth!.userId, email: req.auth!.email, role: req.auth!.role },
      content,
      { ip: getClientIp(req) },
    );
    return success(res, note);
  } catch (err) {
    next(err);
  }
});
