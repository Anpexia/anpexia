import { Router, Request, Response, NextFunction } from 'express';
import { prescriptionsService } from './prescriptions.service';
import { generatePrescriptionPdf } from '../../services/pdf.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';

export const prescriptionsRouter = Router();

prescriptionsRouter.use(authenticate);
prescriptionsRouter.use(requireTenant);

prescriptionsRouter.get('/prescriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientId = req.query.patientId as string;

    if (!patientId) {
      return res.status(400).json({ error: 'patientId is required' });
    }

    const type = req.query.type as string | undefined;

    const prescriptions = await prescriptionsService.list(
      req.auth!.tenantId!,
      patientId,
      type,
    );
    return success(res, prescriptions);
  } catch (err) {
    next(err);
  }
});

prescriptionsRouter.post('/prescriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prescription = await prescriptionsService.create(
      req.auth!.tenantId!,
      req.body,
    );
    return created(res, prescription);
  } catch (err) {
    next(err);
  }
});

prescriptionsRouter.get('/prescriptions/:id/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const prescriptionId = req.params.id as string;
    const pdfBuffer = await generatePrescriptionPdf(tenantId, prescriptionId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="prescricao-${prescriptionId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});
