import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from './error-handler';
import prisma from '../../config/database';

export interface AuthPayload {
  userId: string;
  tenantId: string | null;
  role: string;
  email?: string;
  // Raw token retained on the request for logout/blacklist use.
  token?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token não fornecido'));
  }

  const token = header.slice(7);

  try {
    const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { token } });
    if (blacklisted) {
      return next(new AppError(401, 'TOKEN_REVOKED', 'Sessão encerrada. Faça login novamente.'));
    }

    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.auth = { ...payload, token };
    next();
  } catch {
    return next(new AppError(401, 'INVALID_TOKEN', 'Token inválido ou expirado'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Não autenticado');
    }

    if (!roles.includes(req.auth.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Sem permissão para esta ação');
    }

    next();
  };
}

/** Like authenticate but doesn't throw — silently skips if no valid token */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as AuthPayload;
    req.auth = { ...payload, token: header.slice(7) };
  } catch {
    // Invalid token — just skip, don't block
  }
  next();
}

export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth?.tenantId) {
    throw new AppError(403, 'NO_TENANT', 'Acesso requer vínculo com uma empresa');
  }

  next();
}
