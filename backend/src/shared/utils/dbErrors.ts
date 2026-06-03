/**
 * Classificação de erros de banco (puro, sem dependências de Prisma/env) para
 * ser reutilizado pelo retry (database.ts) e pelo errorHandler, e testável.
 */

// Códigos Prisma associados a problemas de conexão/disponibilidade.
const CONNECTION_PRISMA_CODES = new Set(['P2024', 'P1001', 'P1002', 'P1008', 'P1017']);
const CONNECTION_ERROR_NAMES = new Set(['PrismaClientInitializationError', 'PrismaClientRustPanicError']);

const DEFAULT_RETRY_DELAYS = [1500, 3000, 6000];
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Executa `fn` reexecutando em erros de conexão (cold-start/queda do Neon),
 * com backoff. Erros que não são de conexão sobem imediatamente.
 * Testável: aceita `delays` e `sleep` injetáveis.
 */
export async function withConnectionRetry<T>(
  fn: () => Promise<T>,
  opts?: { delays?: number[]; sleep?: (ms: number) => Promise<void>; onRetry?: (attempt: number, err: unknown) => void },
): Promise<T> {
  const delays = opts?.delays ?? DEFAULT_RETRY_DELAYS;
  const sleep = opts?.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < delays.length && isConnectionError(err)) {
        opts?.onRetry?.(attempt, err);
        await sleep(delays[attempt]);
        continue;
      }
      throw err;
    }
  }
}

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
