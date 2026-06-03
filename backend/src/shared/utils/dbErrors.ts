/**
 * Classificação de erros de banco (puro, sem dependências de Prisma/env) para
 * ser reutilizado pelo retry (database.ts) e pelo errorHandler, e testável.
 */

// Códigos Prisma associados a problemas de conexão/disponibilidade.
const CONNECTION_PRISMA_CODES = new Set(['P2024', 'P1001', 'P1002', 'P1008', 'P1017']);
const CONNECTION_ERROR_NAMES = new Set(['PrismaClientInitializationError', 'PrismaClientRustPanicError']);

export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as any).code;
  if (typeof code === 'string' && CONNECTION_PRISMA_CODES.has(code)) return true;
  if (CONNECTION_ERROR_NAMES.has(error.name)) return true;
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('connection') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes("can't reach database") ||
    msg.includes('prepared statement') ||
    msg.includes('server closed the connection') ||
    msg.includes('connection terminated') ||
    msg.includes('timed out fetching') ||
    msg.includes('connection pool') ||
    msg.includes('too many connections')
  );
}
