import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  // Prisma known errors (constraint violations, not found, etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error('[PRISMA] Known error:', err.code, err.message);
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'campo';
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: `Registro duplicado no campo: ${target}` },
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

  console.error('Unexpected error:', err);

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
    },
  });
}
