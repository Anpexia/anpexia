import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import crypto from 'crypto';
import { isConnectionError } from '../utils/dbErrors';
import { log, describeError } from '../utils/logger';

export class AppError extends Error {
  public details?: Record<string, unknown>;
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.details = details;
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Zod validation errors (schema validation)
  if (err instanceof ZodError) {
    const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: `Dados invalidos: ${messages}` },
    });
  }

  // Prisma known errors (constraint violations, not found, etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error('[PRISMA] Known error:', err.code, err.message);
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Registro duplicado. Verifique os dados e tente novamente.' },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Registro nao encontrado' },
      });
    }
  }

  // Prisma validation errors (wrong field type, invalid enum, etc.)
  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[PRISMA] Validation error:', err.message.slice(0, 300));
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Dados invalidos. Verifique os campos enviados.' },
    });
  }

  // Express body parser errors (payload too large, malformed JSON)
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Dados enviados excedem o limite permitido.' },
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'JSON invalido no corpo da requisicao.' },
    });
  }

  // Correlaciona log <-> resposta para diagnóstico.
  const errorId = crypto.randomUUID();
  const detail = describeError(err);
  const ctx = {
    errorId,
    method: req.method,
    path: req.originalUrl,
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    userEmail: (req.body && typeof req.body === 'object' ? (req.body as any).email : undefined) || undefined,
    ...detail,
  };

  // Erro de CONEXÃO/disponibilidade do banco → 503 (retryável), não 500 genérico.
  if (isConnectionError(err)) {
    log.error('db_connection_error', { ...ctx, httpStatus: 503 });
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Servidor temporariamente indisponível. Tente novamente em instantes.',
        errorId,
      },
    });
  }

  // Demais erros inesperados → 500, mas com LOG completo (mensagem + stack) no backend.
  log.error('unhandled_error', { ...ctx, httpStatus: 500 });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
      errorId,
    },
  });
}
