import { Router, Request, Response, NextFunction } from 'express';
import { tussService } from './tuss.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';

export const tussRouter = Router();

tussRouter.use(authenticate);
tussRouter.use(requireTenant);

// GET /tuss/procedures — list with filters
tussRouter.get('/procedures', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.query.type as string | undefined;
    const convenioId = req.query.convenioId as string | undefined;
    const data = await tussService.list(req.auth!.tenantId!, { type, convenioId });
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

// POST /tuss/procedures — create
tussRouter.post(
  '/procedures',
  requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proc = await tussService.create(req.auth!.tenantId!, req.body);
      return created(res, proc);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /tuss/procedures/:id — update
tussRouter.put(
  '/procedures/:id',
  requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proc = await tussService.update(req.auth!.tenantId!, req.params.id as string, req.body);
      return success(res, proc);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /tuss/procedures/:id — delete
tussRouter.delete(
  '/procedures/:id',
  requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tussService.remove(req.auth!.tenantId!, req.params.id as string);
      return noContent(res);
    } catch (err) {
      next(err);
    }
  },
);

// POST /tuss/generate-xml — generates TISS 4.01.00 XML and returns as downloadable file
tussRouter.post(
  '/generate-xml',
  requireRole('OWNER', 'MANAGER', 'SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { convenioId, dataInicio, dataFim } = req.body;
      if (!convenioId || !dataInicio || !dataFim) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FIELDS', message: 'convenioId, dataInicio e dataFim são obrigatórios' },
        });
      }

      const result = await tussService.generateTissXml(req.auth!.tenantId!, {
        convenioId,
        dataInicio,
        dataFim,
      });

      const filename = `tiss_${result.loteId}_${dataInicio}_${dataFim}.xml`;
      res.setHeader('Content-Type', 'application/xml; charset=iso-8859-1');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Tiss-Lote', result.loteId);
      res.setHeader('X-Tiss-Total-Guias', String(result.totalGuias));
      res.setHeader('X-Tiss-Total-Valor', result.totalValor.toFixed(2));
      return res.send(result.xml);
    } catch (err) {
      next(err);
    }
  },
);
