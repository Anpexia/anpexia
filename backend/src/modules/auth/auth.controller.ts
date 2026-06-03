import { Router, Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { loginSchema, registerSchema } from './auth.validators';
import { success } from '../../shared/utils/response';
import { authenticate } from '../../shared/middleware/auth';
import { env } from '../../config/env';
import { publicRateLimit } from '../../shared/middleware/rate-limit';
import { getClientIp } from '../../services/auditLog.service';
import { AppError } from '../../shared/middleware/error-handler';
import { isConnectionError } from '../../shared/utils/dbErrors';
import { log, describeError } from '../../shared/utils/logger';

// Loga o resultado de uma tentativa de login (ts/email/ip/status/tempo).
function statusOf(err: unknown): number {
  if (err instanceof AppError) return err.statusCode;
  if (isConnectionError(err)) return 503;
  return 500;
}

export const authRouter = Router();

const isProduction = env.nodeEnv === 'production';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' as const : 'strict' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  };
}

authRouter.post('/login', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  const ip = getClientIp(req);
  const email = String(req.body?.email || '').trim().toLowerCase();
  try {
    const data = loginSchema.parse(req.body);
    const deviceId = (req.body?.deviceId as string | undefined) || (req.headers['x-device-id'] as string | undefined);
    const result = await authService.login(data.email, data.password, deviceId, ip, 'app', data.tenantId);

    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions());
    log.info('login_success', { email, ip, httpStatus: 200, durationMs: Date.now() - startedAt, context: 'app' });

    return success(res, {
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    const d = describeError(err);
    log.warn('login_failed', {
      email, ip, context: 'app',
      httpStatus: statusOf(err),
      durationMs: Date.now() - startedAt,
      errorName: d.name,
      errorCode: (err as any)?.code || (err instanceof AppError ? err.code : undefined),
      errorMessage: d.message,
    });
    next(err);
  }
});

authRouter.post('/admin/login', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  const ip = getClientIp(req);
  const email = String(req.body?.email || '').trim().toLowerCase();
  try {
    const data = loginSchema.parse(req.body);
    const deviceId = (req.body?.deviceId as string | undefined) || (req.headers['x-device-id'] as string | undefined);
    const result = await authService.login(data.email, data.password, deviceId, ip, 'admin');

    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions());
    log.info('login_success', { email, ip, httpStatus: 200, durationMs: Date.now() - startedAt, context: 'admin' });

    return success(res, {
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    const d = describeError(err);
    log.warn('login_failed', {
      email, ip, context: 'admin',
      httpStatus: statusOf(err),
      durationMs: Date.now() - startedAt,
      errorName: d.name,
      errorCode: (err as any)?.code || (err instanceof AppError ? err.code : undefined),
      errorMessage: d.message,
    });
    next(err);
  }
});

authRouter.post('/register', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const result = await authService.refresh(refreshToken);

    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions());

    return success(res, { accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    await authService.logout(refreshToken, req.auth?.token, req.auth, getClientIp(req));
    res.clearCookie('refreshToken');
    return success(res, { message: 'Logout realizado com sucesso' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getMe(req.auth!.userId);
    return success(res, user);
  } catch (err) {
    next(err);
  }
});

// ========== 2FA ==========

authRouter.post('/2fa/verify', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, code, method, deviceId, deviceName, rememberDevice } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'userId e code são obrigatórios' } });
    }
    const result = await authService.verify2FA(
      userId,
      String(code),
      (method === 'totp' ? 'totp' : 'email'),
      deviceId,
      deviceName,
      !!rememberDevice,
      getClientIp(req),
    );
    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions());
    return success(res, { accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/2fa/resend', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: { code: 'MISSING_USER_ID', message: 'userId obrigatório' } });
    await authService.resend2FACode(userId);
    return success(res, { message: 'Código reenviado' });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/2fa/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.setup2FA(req.auth!.userId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/2fa/enable', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    await authService.enable2FA(req.auth!.userId, String(code || ''));
    return success(res, { message: '2FA ativado com sucesso' });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/2fa/disable', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body;
    await authService.disable2FA(req.auth!.userId, String(password || ''));
    return success(res, { message: '2FA desativado' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/2fa/devices', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await authService.listDevices(req.auth!.userId);
    return success(res, devices);
  } catch (err) {
    next(err);
  }
});

authRouter.delete('/2fa/devices/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.removeDevice(req.auth!.userId, req.params.id as string);
    return success(res, { message: 'Dispositivo removido' });
  } catch (err) {
    next(err);
  }
});

authRouter.delete('/2fa/devices', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.removeAllDevices(req.auth!.userId);
    return success(res, { message: 'Todos os dispositivos removidos' });
  } catch (err) {
    next(err);
  }
});

// ========== Invite / Define password ==========

authRouter.post('/validate-invite', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.body.token || '');
    const result = await authService.validateInvite(token);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/define-password', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password, confirmPassword } = req.body;
    await authService.definePassword(String(token || ''), String(password || ''), String(confirmPassword || ''));
    return success(res, { message: 'Senha definida com sucesso' });
  } catch (err) {
    next(err);
  }
});

// ========== Forgot / Reset Password ==========

authRouter.post('/forgot-password', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body.email || '').trim();
    await authService.requestPasswordReset(email);
    return success(res, { message: 'Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha.' });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/validate-reset', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.body.token || '');
    const result = await authService.validateResetToken(token);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reset-password', publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password, confirmPassword } = req.body;
    await authService.resetPassword(String(token || ''), String(password || ''), String(confirmPassword || ''));
    return success(res, { message: 'Senha redefinida com sucesso' });
  } catch (err) {
    next(err);
  }
});
