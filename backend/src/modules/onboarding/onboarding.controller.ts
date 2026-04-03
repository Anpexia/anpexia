import { Router, Request, Response, NextFunction } from 'express';
import { onboardingService } from './onboarding.service';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireRole } from '../../shared/middleware/auth';

const router = Router();

router.use(authenticate, requireRole('SUPER_ADMIN'));

router.post('/convert/:leadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leadId = req.params.leadId as string;
    const { ownerName, ownerEmail, ownerPassword } = req.body;
    const result = await onboardingService.convertLeadToClient(leadId, { ownerName, ownerEmail, ownerPassword });
    return created(res, result);
  } catch (err) {
    next(err);
  }
});

router.get('/status/:leadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leadId = req.params.leadId as string;
    const result = await onboardingService.getOnboardingStatus(leadId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

export default router;
