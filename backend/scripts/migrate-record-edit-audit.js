// Migração aditiva e idempotente: campos de auditoria de edição pelo autor.
// Regra do projeto: NUNCA usar `prisma db push` no banco compartilhado.
// Usar SQL ALTER ... ADD COLUMN IF NOT EXISTS (aditivo, nullable, zero risco).
//
// Adiciona updated_by (TEXT) e updated_at (TIMESTAMP) em:
//   - clinical_notes      (Texto Livre de Anamnese/Evolução)
//   - patient_evolutions  (Evolução Estruturada)
//
// Uso: node scripts/migrate-record-edit-audit.js
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[migrate] clinical_notes: adicionando updated_by / updated_at (se não existirem)...');
  await prisma.$executeRawUnsafe(`ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS updated_by TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3);`);

  console.log('[migrate] patient_evolutions: adicionando updated_by / updated_at (se não existirem)...');
  await prisma.$executeRawUnsafe(`ALTER TABLE patient_evolutions ADD COLUMN IF NOT EXISTS updated_by TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE patient_evolutions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3);`);

  // Sanidade
  for (const table of ['clinical_notes', 'patient_evolutions']) {
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = '${table}' AND column_name IN ('updated_by', 'updated_at')
      ORDER BY column_name;
    `);
    console.log(`[migrate] ${table}: colunas presentes ->`, cols.map((c) => c.column_name).join(', ') || '(nenhuma!)');
  }

  console.log('[migrate] OK ✅');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('[migrate] ERRO:', e); await prisma.$disconnect(); process.exit(1); });
