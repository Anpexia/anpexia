// Migração aditiva e idempotente para "Modelos de Conduta".
// Regra do projeto: NUNCA usar `prisma db push` no banco compartilhado.
// Usar SQL CREATE TABLE / ... IF NOT EXISTS.
//
// Uso: node scripts/migrate-conducta-templates.js
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[migrate] Criando tabela conducta_templates (se não existir)...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS conducta_templates (
      id          TEXT NOT NULL PRIMARY KEY,
      tenant_id   TEXT NOT NULL,
      owner_id    TEXT NOT NULL,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      context     TEXT,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT conducta_templates_tenant_id_fkey FOREIGN KEY (tenant_id)
        REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT conducta_templates_owner_id_fkey FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  console.log('[migrate] Criando índice (se não existir)...');
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS conducta_templates_tenant_owner_idx ON conducta_templates(tenant_id, owner_id);`,
  );

  // Sanidade
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'conducta_templates' ORDER BY column_name;
  `);
  console.log('[migrate] Colunas conducta_templates:', cols.map((c) => c.column_name).join(', '));

  console.log('[migrate] OK ✅');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('[migrate] ERRO:', e); await prisma.$disconnect(); process.exit(1); });
