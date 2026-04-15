import rateLimit from 'express-rate-limit';

/**
 * 5 req/IP/min limit for public (unauthenticated) endpoints.
 * Used on /login, /define-password, /validate-invite, /2fa/verify, etc.
 */
export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Muitas tentativas. Aguarde 1 minuto e tente novamente.',
    },
  },
});
