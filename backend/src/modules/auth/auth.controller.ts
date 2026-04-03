import { Router, Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { loginSchema, registerSchema } from './auth.validators';
import { success } from '../../shared/utils/response';
import { authenticate } from '../../shared/middleware/auth';
import { env } from '../../config/env';

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

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data.email, data.password);

    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions());

    return success(res, {
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
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
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
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
