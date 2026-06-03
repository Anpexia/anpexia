// Cria a tabela phone_review_items (aditiva/idempotente).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS phone_review_items (
      id             TEXT NOT NULL PRIMARY KEY,
      tenant_id      TEXT NOT NULL,
      customer_id    TEXT NOT NULL,
      customer_name  TEXT NOT NULL,
      original_phone TEXT,
      reason         TEXT NOT NULL,
      resolved       BOOLEAN NOT NULL DEFAULT false,
      created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS phone_review_items_tenant_id_idx ON phone_review_items(tenant_id);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS phone_review_items_resolved_idx ON phone_review_items(resolved);`);
  console.log('[migrate] phone_review_items OK ✅');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('[migrate] ERRO:', e); await prisma.$disconnect(); process.exit(1); });
