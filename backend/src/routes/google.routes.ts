import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../shared/middleware/auth';
import * as gcal from '../services/googleCalendar.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

const router = Router();

// Callback must be PUBLIC — Google redirects here without JWT
router.get('/callback', asyncHandler(async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).json({ success: false, error: { message: 'Missing code parameter' } });
  }
  await gcal.saveTokens(code);
  return res.redirect('https://admin.anpexia.com.br/configuracoes?google=connected');
}));

// All remaining routes require SUPER_ADMIN auth
router.use(authenticate, requireRole('SUPER_ADMIN'));

// GET /api/google/auth — returns OAuth URL
router.get('/auth', asyncHandler(async (_req, res) => {
  const url = gcal.getAuthUrl();
  return res.json({ success: true, data: { url } });
}));

// GET /api/google/status — check if connected
router.get('/status', asyncHandler(async (_req, res) => {
  const connected = await gcal.isConnected();
  return res.json({ success: true, data: { connected } });
}));

// GET /api/google/events — list upcoming events
router.get('/events', asyncHandler(async (_req, res) => {
  const events = await gcal.listUpcomingEvents();
  return res.json({ success: true, data: events });
}));

// DELETE /api/google/disconnect — remove tokens
router.delete('/disconnect', asyncHandler(async (_req, res) => {
  await gcal.disconnect();
  return res.json({ success: true, data: { ok: true } });
}));

export { router as googleRouter };
