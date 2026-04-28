import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const RETRY_DELAYS = [1500, 3000, 6000];

function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('connection') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('can\'t reach database') ||
    msg.includes('prepared statement') ||
    msg.includes('server closed the connection')
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_DELAYS.length && isConnectionError(error)) {
        console.warn(`[DB] Connection error, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${RETRY_DELAYS.length})...`);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function warmupDatabase(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database warmup OK (Neon acordado)');
  } catch (err) {
    console.warn('⚠️ Database warmup falhou, retentando...', (err as Error).message);
    await sleep(2000);
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database warmup OK (segunda tentativa)');
    } catch (err2) {
      console.error('❌ Database warmup falhou após retry:', (err2 as Error).message);
    }
  }
}

setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.warn('[DB] Keepalive ping falhou:', (err as Error).message);
  }
}, 4 * 60 * 1000);

export default prisma;
