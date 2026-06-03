// Migração aditiva/idempotente: cpf_hash, document_type, document_number em customers.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf_hash TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS document_type TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS document_number TEXT;`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS customers_tenant_id_cpf_hash_idx ON customers(tenant_id, cpf_hash);`);

  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='customers' AND column_name IN ('cpf_hash','document_type','document_number') ORDER BY column_name;
  `);
  console.log('[migrate] Colunas:', cols.map((c) => c.column_name).join(', '));
  console.log('[migrate] OK ✅');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('[migrate] ERRO:', e); await prisma.$disconnect(); process.exit(1); });
