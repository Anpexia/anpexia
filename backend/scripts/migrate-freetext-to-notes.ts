/**
 * Migra o texto livre legado da Anamnese (campo `_freeText` dentro do JSON `data`)
 * para a nova tabela ClinicalNote (context = ANAMNESE), preservando o conteúdo.
 *
 * É um MOVE idempotente: ao migrar, cria a ClinicalNote e remove `_freeText` do
 * JSON da anamnese. Reexecutar não duplica (não há mais `_freeText` para migrar).
 *
 * Uso:
 *   npx tsx scripts/migrate-freetext-to-notes.ts          (dry-run, só conta)
 *   npx tsx scripts/migrate-freetext-to-notes.ts --apply  (aplica)
 */
import { PrismaClient } from '@prisma/client';
import prisma from '../src/config/database';
import { decryptJson } from '../src/shared/utils/encryption';

// Client base (sem extensão) para ler o JSON CRU e descriptografar 1 a 1,
// evitando que um registro com problema de chave derrube a leitura em lote.
const rawDb = new PrismaClient();

const APPLY = process.argv.includes('--apply');

async function main() {
  const all = await rawDb.anamnesis.findMany({
    select: { id: true, data: true, doctorId: true, tenantId: true, patientId: true, createdAt: true },
  });

  let undecryptable = 0;
  const pending: Array<{ id: string; doctorId: string; tenantId: string; patientId: string; content: string }> = [];

  for (const a of all) {
    let data: any;
    try {
      data = decryptJson(a.data);
    } catch {
      undecryptable++;
      continue; // registro com problema de chave — não tocar
    }
    const ft = data && typeof data === 'object' ? data._freeText : null;
    if (typeof ft === 'string' && ft.trim().length > 0) {
      pending.push({ id: a.id, doctorId: a.doctorId, tenantId: a.tenantId, patientId: a.patientId, content: ft.trim() });
    }
  }

  console.log(`Total de anamneses: ${all.length} | com _freeText a migrar: ${pending.length} | nao-descriptografaveis (puladas): ${undecryptable}`);
  if (!APPLY) {
    console.log('\n(dry-run) Rode novamente com --apply para migrar.');
    return;
  }

  let migrated = 0;
  for (const a of pending) {
    const user = await rawDb.user.findUnique({ where: { id: a.doctorId }, select: { name: true } }).catch(() => null);

    // Cria a nota pelo client ESTENDIDO (criptografa o content automaticamente).
    await prisma.clinicalNote.create({
      data: {
        tenantId: a.tenantId,
        patientId: a.patientId,
        authorId: a.doctorId,
        authorName: user?.name ?? null,
        context: 'ANAMNESE',
        content: a.content,
      },
    });

    // Remove _freeText do JSON da anamnese, preservando os demais campos.
    // Lê de novo (raw), descriptografa, tira a chave e regrava pelo client estendido.
    const fresh = await rawDb.anamnesis.findUnique({ where: { id: a.id }, select: { data: true } });
    const data = decryptJson(fresh?.data) as any;
    const { _freeText, ...rest } = data || {};
    await prisma.anamnesis.update({ where: { id: a.id }, data: { data: rest } });

    migrated++;
    console.log(`  ✓ migrado anamnese ${a.id} (${a.content.length} chars)`);
  }

  console.log(`\nMigração concluída: ${migrated} registro(s) movido(s) para clinical_notes. ✅`);
}

main()
  .then(async () => { await prisma.$disconnect(); await rawDb.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('Migração FALHOU ❌\n', e); await prisma.$disconnect(); await rawDb.$disconnect(); process.exit(1); });
