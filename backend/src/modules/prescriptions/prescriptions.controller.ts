import { Router, Request, Response, NextFunction } from 'express';
import { prescriptionsService } from './prescriptions.service';
import { generatePrescriptionPdf } from '../../services/pdf.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { logAction, getClientIp } from '../../services/auditLog.service';

function auditCtx(req: Request) {
  return {
    userId: req.auth?.userId,
    userEmail: req.auth?.email,
    userRole: req.auth?.role,
    tenantId: req.auth?.tenantId,
    ipAddress: getClientIp(req),
  };
}

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
    console.log('[PRESCRICAO] body:', JSON.stringify(req.body, null, 2));
    console.log('[PRESCRICAO] userId:', req.auth!.userId, 'tenantId:', req.auth!.tenantId);

    // Inject doctorId from authenticated user if not provided
    const body = { ...req.body };
    if (!body.doctorId) {
      body.doctorId = req.auth!.userId;
    }

    // Pack items/oculosData into the data JSON field if sent at top level
    if (!body.data) {
      if (body.type === 'OCULOS' && body.oculosData) {
        body.data = { od: body.oculosData.od || { esferico: body.oculosData.od_esferico, cilindrico: body.oculosData.od_cilindrico, eixo: body.oculosData.od_eixo, adicao: body.oculosData.od_adicao, dnp: body.oculosData.od_dnp }, oe: body.oculosData.oe || { esferico: body.oculosData.oe_esferico, cilindrico: body.oculosData.oe_cilindrico, eixo: body.oculosData.oe_eixo, adicao: body.oculosData.oe_adicao, dnp: body.oculosData.oe_dnp }, lensType: body.oculosData.tipoLente, validade: body.oculosData.validade, observacoes: body.oculosData.observacoes };
      } else if (body.items) {
        if (body.type === 'MEDICAMENTO') {
          body.data = { medications: body.items };
        } else {
          body.data = { exams: body.items };
        }
      } else {
        body.data = {};
      }
    }

    const prescription = await prescriptionsService.create(
      req.auth!.tenantId!,
      body,
    );
    await logAction({ ...auditCtx(req), action: 'CREATE', entity: 'PRESCRIPTION', entityId: (prescription as any)?.id, metadata: { patientId: (prescription as any)?.patientId, type: (prescription as any)?.type } });
    return created(res, prescription);
  } catch (err: any) {
    console.error('[PRESCRICAO] erro:', err.message, err.stack);
    next(err);
  }
});

prescriptionsRouter.get('/prescriptions/:id/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const prescriptionId = req.params.id as string;
    const pdfBuffer = await generatePrescriptionPdf(tenantId, prescriptionId);

    await logAction({ ...auditCtx(req), action: 'PRINT', entity: 'PRESCRIPTION', entityId: prescriptionId });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="prescricao-${prescriptionId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});
