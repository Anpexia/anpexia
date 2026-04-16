import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../shared/middleware/auth';
import * as gcal from '../services/googleCalendar.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const router = Router();

// PUBLIC — Google redirects here without JWT
router.get('/callback', asyncHandler(async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).json({ success: false, error: { message: 'Missing code parameter' } });
  }
  await gcal.saveTokens(code);
  return res.redirect('https://admin.anpexia.com.br/configuracoes?google=connected');
}));

// PUBLIC — just generates a redirect URL, no sensitive data
router.get('/auth', asyncHandler(async (_req, res) => {
  const url = gcal.getAuthUrl();
  return res.json({ success: true, data: { url } });
}));

// Authenticated (any role) — just returns a boolean
router.get('/status', authenticate, asyncHandler(async (_req, res) => {
  const connected = await gcal.isConnected();
  return res.json({ success: true, data: { connected } });
}));

// Authenticated — list events
router.get('/events', authenticate, asyncHandler(async (_req, res) => {
  const events = await gcal.listUpcomingEvents();
  return res.json({ success: true, data: events });
}));

// SUPER_ADMIN only — destructive action
router.delete('/disconnect', authenticate, requireRole('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  await gcal.disconnect();
  return res.json({ success: true, data: { ok: true } });
}));

export { router as googleRouter };
