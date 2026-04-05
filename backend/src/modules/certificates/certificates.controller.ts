import { Router, Request, Response, NextFunction } from 'express';
import { certificatesService } from './certificates.service';
import { generateCertificatePdf } from '../../services/pdf.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';

export const certificatesRouter = Router();

certificatesRouter.use(authenticate);
certificatesRouter.use(requireTenant);

certificatesRouter.get('/medical-certificates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientId = req.query.patientId as string;

    if (!patientId) {
      return res.status(400).json({ error: 'patientId is required' });
    }

    const certificates = await certificatesService.list(
      req.auth!.tenantId!,
      patientId,
    );
    return success(res, certificates);
  } catch (err) {
    next(err);
  }
});

certificatesRouter.post('/medical-certificates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[ATESTADO] body:', JSON.stringify(req.body, null, 2));
    console.log('[ATESTADO] userId:', req.auth!.userId, 'tenantId:', req.auth!.tenantId);

    // Inject doctorId from authenticated user if not provided
    const body = { ...req.body };
    if (!body.doctorId) {
      body.doctorId = req.auth!.userId;
    }

    const certificate = await certificatesService.create(
      req.auth!.tenantId!,
      body,
    );
    return created(res, certificate);
  } catch (err: any) {
    console.error('[ATESTADO] erro:', err.message, err.stack);
    next(err);
  }
});

certificatesRouter.get('/medical-certificates/:id/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const certificateId = req.params.id as string;
    const pdfBuffer = await generateCertificatePdf(tenantId, certificateId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="atestado-${certificateId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});
