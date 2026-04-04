import { Router, Request, Response, NextFunction } from 'express';
import { signaturesService } from './signatures.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';

export const signaturesRouter = Router();

signaturesRouter.use(authenticate);
signaturesRouter.use(requireTenant);

signaturesRouter.get('/doctors/:doctorId/signature', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = await signaturesService.getSignature(
      req.auth!.tenantId!,
      req.params.doctorId as string,
    );
    return success(res, signature);
  } catch (err) {
    next(err);
  }
});

signaturesRouter.post('/doctors/:doctorId/signature', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { signatureImage } = req.body;

    if (!signatureImage) {
      return res.status(400).json({ error: 'signatureImage is required' });
    }

    const signature = await signaturesService.upsertSignature(
      req.auth!.tenantId!,
      req.params.doctorId as string,
      signatureImage,
    );
    return created(res, signature);
  } catch (err) {
    next(err);
  }
});
