import { PrismaClient } from '@prisma/client';
import { tenantStore } from '../shared/middleware/tenantContext';
import { ENCRYPTED_MODELS, encryptModelFields, decryptDeep } from '../shared/utils/encryption';
import { isConnectionError } from '../shared/utils/dbErrors';

// Only models that have a direct tenant_id column
const TENANT_SCOPED_MODELS = new Set([
  'Customer', 'CustomerTag',
  'Product', 'ProductCategory', 'InventoryMovement',
  'MessageTemplate', 'MessageSent',
  'AuditLog', 'ChatbotConfig', 'ChatbotFaq', 'ChatMessage',
  'ScriptCategory', 'Script',
  'Supplier', 'SupplierProduct', 'PurchaseOrder',
  'FinancialTransaction', 'FinancialCategory',
  'DoctorSignature', 'MedicalCertificate', 'Prescription',
  'Anamnesis', 'PatientEvolution', 'ClinicalNote', 'ScheduledCall', 'PhoneReviewItem',
  'Convenio', 'Autorizacao', 'TussProcedure', 'DoctorRepasse',
  'ProcedureTemplate', 'RepasseType', 'PrivateProcedure',
  'TenantSettings', 'TenantModule', 'PatientDocument',
  'MedicalRecord',
]);

const READ_ACTIONS = new Set(['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy']);
const WRITE_MUTATIONS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

function enforceIsolation(model: string, action: string, args: any): any {
  const store = tenantStore.getStore();
  if (!store?.tenantId) return args;

  const tenantId = store.tenantId;

  if (READ_ACTIONS.has(action)) {
    if (!args) args = {};
    if (!args.where) args.where = {};

    if (args.where.tenantId && args.where.tenantId !== tenantId) {
      console.error(`[SECURITY] Tenant violation BLOCKED: ${model}.${action} — user=${tenantId}, query=${args.where.tenantId}`);
      throw new Error('Acesso negado: violacao de isolamento de dados');
    }

    // Handle compound unique keys (e.g. tenantId_customerId)
    if (action === 'findUnique' && !args.where.tenantId) {
      const keys = Object.keys(args.where);
      for (const k of keys) {
        if (typeof args.where[k] === 'object' && args.where[k]?.tenantId) {
          if (args.where[k].tenantId !== tenantId) {
            console.error(`[SECURITY] Tenant violation BLOCKED: ${model}.findUnique compound key`);
            throw new Error('Acesso negado: violacao de isolamento de dados');
          }
          return args;
        }
      }
    }

    if (!args.where.tenantId) {
      args.where.tenantId = tenantId;
    }
  }

  if (action === 'create') {
    if (args?.data?.tenantId && args.data.tenantId !== tenantId) {
      console.error(`[SECURITY] Tenant violation BLOCKED: ${model}.create — target=${args.data.tenantId}`);
      throw new Error('Acesso negado: violacao de isolamento de dados');
    }
  }

  if (WRITE_MUTATIONS.has(action)) {
    if (!args) args = {};
    if (!args.where) args.where = {};
    if (args.where.tenantId && args.where.tenantId !== tenantId) {
      console.error(`[SECURITY] Tenant violation BLOCKED: ${model}.${action}`);
      throw new Error('Acesso negado: violacao de isolamento de dados');
    }
    if (!args.where.tenantId && action !== 'upsert') {
      args.where.tenantId = tenantId;
    }
  }

  return args;
}

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const WRITE_OPS = new Set(['create', 'update', 'upsert', 'createMany']);

const prisma = basePrisma.$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      if (model && TENANT_SCOPED_MODELS.has(model)) {
        args = enforceIsolation(model, operation, args);
      }

      if (model && ENCRYPTED_MODELS[model] && WRITE_OPS.has(operation)) {
        if (operation === 'upsert') {
          if (args.create) encryptModelFields(model, args.create);
          if (args.update) encryptModelFields(model, args.update);
        } else if (operation === 'createMany' && Array.isArray(args.data)) {
          for (const item of args.data) encryptModelFields(model, item);
        } else if (args.data) {
          encryptModelFields(model, args.data);
        }
      }

      // Retry transparente em erros de conexão (cold-start/queda do Neon).
      // Corrige a intermitência: 1ª tentativa pode falhar com conexão fria,
      // a seguinte (após backoff) já pega a conexão quente.
      let result: any;
      for (let attempt = 0; ; attempt++) {
        try {
          result = await query(args);
          break;
        } catch (err) {
          if (attempt < RETRY_DELAYS.length && isConnectionError(err)) {
            console.warn(`[DB] Erro de conexão em ${model ?? '?'}.${operation} — retry ${attempt + 1}/${RETRY_DELAYS.length} em ${RETRY_DELAYS[attempt]}ms: ${(err as Error).message?.slice(0, 120)}`);
            await sleep(RETRY_DELAYS[attempt]);
            continue;
          }
          throw err;
        }
      }

      if (result) {
        decryptDeep(result);
      }

      return result;
    },
  },
}) as unknown as PrismaClient;

// --- Connection retry ---

const RETRY_DELAYS = [1500, 3000, 6000];

// isConnectionError vive em shared/utils/dbErrors (puro/testável) e é reexportado
// aqui por conveniência dos imports existentes.
export { isConnectionError };

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

// Keepalive para evitar autosuspend do Neon (reduz cold-starts).
// .unref() para não impedir o encerramento de processos curtos (testes/scripts).
const keepaliveTimer = setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.warn('[DB] Keepalive ping falhou:', (err as Error).message);
  }
}, 4 * 60 * 1000);
keepaliveTimer.unref();

export default prisma;
