import { Router, Request, Response } from 'express';
import { demoService } from './demo.service';

const router = Router();

// Rate limiting: 30 requests per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= 30) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 10 * 60 * 1000);

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: 'Limite de mensagens atingido. Tente novamente mais tarde.',
      });
    }

    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string' || !sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        error: 'Campos obrigatórios: message (string), sessionId (string)',
      });
    }

    if (message.length > 500) {
      return res.status(400).json({
        error: 'Mensagem muito longa. Máximo 500 caracteres.',
      });
    }

    const result = await demoService.chat(sessionId, message);
    return res.json(result);
  } catch (err: any) {
    console.error('[DEMO] Error:', err.message);
    return res.status(500).json({
      error: 'Erro interno. Tente novamente.',
    });
  }
});

export const demoRouter = router;
