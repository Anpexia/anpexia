// Migração aditiva e idempotente para o recurso de Texto Livre Clínico.
// Regra do projeto: NUNCA usar `prisma db push` no banco compartilhado.
// Usar SQL CREATE TABLE / ALTER ... IF NOT EXISTS.
//
// Uso: node scripts/migrate-clinical-notes.js
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[migrate] Criando tabela clinical_notes (se não existir)...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS clinical_notes (
      id           TEXT NOT NULL PRIMARY KEY,
      tenant_id    TEXT NOT NULL,
      patient_id   TEXT NOT NULL,
      author_id    TEXT NOT NULL,
      author_name  TEXT,
      context      TEXT NOT NULL,
      content      TEXT NOT NULL,
      created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT clinical_notes_tenant_id_fkey FOREIGN KEY (tenant_id)
        REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT clinical_notes_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES customers(id) ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  console.log('[migrate] Criando índices (se não existirem)...');
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS clinical_notes_tenant_id_idx ON clinical_notes(tenant_id);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS clinical_notes_patient_id_idx ON clinical_notes(patient_id);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS clinical_notes_patient_id_context_idx ON clinical_notes(patient_id, context);`);

  console.log('[migrate] Adicionando coluna version em anamneses (se não existir)...');
  await prisma.$executeRawUnsafe(`ALTER TABLE anamneses ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;`);

  // Sanidade
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'clinical_notes' ORDER BY column_name;
  `);
  console.log('[migrate] Colunas clinical_notes:', cols.map((c) => c.column_name).join(', '));
  const ver = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'anamneses' AND column_name = 'version';
  `);
  console.log('[migrate] anamneses.version presente:', ver.length === 1);

  console.log('[migrate] OK ✅');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('[migrate] ERRO:', e); await prisma.$disconnect(); process.exit(1); });
