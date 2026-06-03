// Migração aditiva e idempotente: adiciona cell_phone e landline_phone em customers.
// Regra do projeto: nunca `prisma db push` no banco compartilhado.
// Uso: node scripts/migrate-phone-columns.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[migrate] Adicionando colunas cell_phone e landline_phone (se não existirem)...');
  await prisma.$executeRawUnsafe(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS cell_phone TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS landline_phone TEXT;`);

  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name IN ('phone','cell_phone','landline_phone')
    ORDER BY column_name;
  `);
  console.log('[migrate] Colunas presentes:', cols.map((c) => c.column_name).join(', '));
  console.log('[migrate] OK ✅');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('[migrate] ERRO:', e); await prisma.$disconnect(); process.exit(1); });
