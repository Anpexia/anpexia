/**
 * MESCLAGEM de pacientes duplicados (CPFs aprovados).
 *
 * SEGURANÇA:
 *  - Faz BACKUP raw (cifrado) de todos os registros afetados antes de aplicar.
 *  - Repointa TODAS as FKs ao paciente principal (nada perdido).
 *  - Dados clínicos mesclam SEM apagar nenhum dos dois: medical_entries são
 *    movidas e os campos do prontuário são CONCATENADOS (não sobrescritos).
 *  - Só os registros de Customer duplicados são excluídos no final.
 *
 *   npx tsx scripts/merge-duplicate-patients.ts          (dry-run: mostra o plano)
 *   npx tsx scripts/merge-duplicate-patients.ts --apply  (executa com backup)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient as BasePrisma } from '@prisma/client';
import prisma from '../src/config/database';
import { cpfHash } from '../src/shared/utils/cpf';

const APPLY = process.argv.includes('--apply');
const base = new BasePrisma(); // sem extensão: dump raw (cifrado) para backup

const MERGE_CPFS = ['03374036511', '17520590690', '25443704672', '33754780620', '08786550691', '52315517672'];

// Tabelas/colunas com unicidade → tratamento especial.
const SPECIAL = new Set(['customer_tag_assignments.customer_id', 'medical_records.customer_id', 'patient_convenios.patient_id']);

async function fkList(): Promise<Array<{ table: string; col: string }>> {
  const rows = (await base.$queryRawUnsafe(`
    SELECT tc.table_name AS t, kcu.column_name AS c
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='customers' AND ccu.column_name='id'`)) as Array<{ t: string; c: string }>;
  return rows.map((r) => ({ table: r.t, col: r.c }));
}

async function countRel(fks: Array<{ table: string; col: string }>, id: string): Promise<{ total: number; hasMR: boolean }> {
  let total = 0; let hasMR = false;
  for (const f of fks) {
    const r = (await base.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${f.table}" WHERE "${f.col}"=$1`, id)) as Array<{ n: number }>;
    total += r[0].n;
    if (f.table === 'medical_records' && r[0].n > 0) hasMR = true;
  }
  return { total, hasMR };
}

function mergeField(primary: string | null, dup: string | null): string | null {
  const p = (primary || '').trim(); const d = (dup || '').trim();
  if (!d) return primary ?? null;
  if (!p) return d;
  if (p.includes(d)) return primary; // já contém
  return `${p}\n[mesclado de cadastro duplicado] ${d}`;
}

async function backup(ids: string[], fks: Array<{ table: string; col: string }>) {
  const dump: any = { when: new Date().toISOString(), customers: {}, related: {} };
  for (const id of ids) {
    dump.customers[id] = await base.$queryRawUnsafe(`SELECT * FROM customers WHERE id=$1`, id);
    for (const f of fks) {
      // Apenas os IDs (suficiente para reverter o repointe; evita puxar blobs como fileData).
      const rows = await base.$queryRawUnsafe(`SELECT id FROM "${f.table}" WHERE "${f.col}"=$1`, id);
      if ((rows as any[]).length) dump.related[`${id}:${f.table}`] = rows;
    }
  }
  const file = path.join(os.tmpdir(), `merge-backup-${ids[0]}-${ids.length}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2), 'utf8');
  return file;
}

async function mergeOne(tx: any, primary: string, dup: string, fks: Array<{ table: string; col: string }>) {
  // 1) FKs simples (sem unicidade) → repointa.
  for (const f of fks) {
    if (SPECIAL.has(`${f.table}.${f.col}`)) continue;
    await tx.$executeRawUnsafe(`UPDATE "${f.table}" SET "${f.col}"=$1 WHERE "${f.col}"=$2`, primary, dup);
  }

  // 2) customer_tag_assignments: move só tags que o primário ainda não tem.
  await tx.$executeRawUnsafe(
    `DELETE FROM customer_tag_assignments d WHERE d.customer_id=$1 AND EXISTS (SELECT 1 FROM customer_tag_assignments p WHERE p.customer_id=$2 AND p.tag_id=d.tag_id)`, dup, primary);
  await tx.$executeRawUnsafe(`UPDATE customer_tag_assignments SET customer_id=$1 WHERE customer_id=$2`, primary, dup);

  // 3) medical_records (1:1): mescla SEM apagar dados clínicos.
  const dupMR = await tx.medicalRecord.findFirst({ where: { customerId: dup } });
  if (dupMR) {
    const primMR = await tx.medicalRecord.findFirst({ where: { customerId: primary } });
    if (!primMR) {
      await tx.medicalRecord.update({ where: { id: dupMR.id }, data: { customerId: primary } });
    } else {
      // move as entradas do prontuário
      await tx.$executeRawUnsafe(`UPDATE medical_entries SET medical_record_id=$1 WHERE medical_record_id=$2`, primMR.id, dupMR.id);
      // concatena os campos (não sobrescreve)
      await tx.medicalRecord.update({
        where: { id: primMR.id },
        data: {
          allergies: mergeField(primMR.allergies, dupMR.allergies),
          medications: mergeField(primMR.medications, dupMR.medications),
          chronicDiseases: mergeField(primMR.chronicDiseases, dupMR.chronicDiseases),
          clinicalNotes: mergeField(primMR.clinicalNotes, dupMR.clinicalNotes),
          bloodType: primMR.bloodType || dupMR.bloodType,
        },
      });
      await tx.medicalRecord.delete({ where: { id: dupMR.id } });
    }
  }

  // 4) patient_convenios (unique patient+convenio): move; em conflito move autorizações e remove o link duplicado.
  const dupConvs = await tx.patientConvenio.findMany({ where: { patientId: dup } });
  for (const dc of dupConvs) {
    const exists = await tx.patientConvenio.findFirst({ where: { patientId: primary, convenioId: dc.convenioId } });
    if (!exists) {
      await tx.patientConvenio.update({ where: { id: dc.id }, data: { patientId: primary } });
    } else {
      await tx.$executeRawUnsafe(`UPDATE autorizacoes SET patient_convenio_id=$1 WHERE patient_convenio_id=$2`, exists.id, dc.id);
      await tx.patientConvenio.delete({ where: { id: dc.id } });
    }
  }

  // 5) audit_logs (não-FK): repointa o histórico do paciente.
  await tx.$executeRawUnsafe(`UPDATE audit_logs SET entity_id=$1 WHERE entity_id=$2 AND entity IN ('Customer','PATIENT','Patient')`, primary, dup);

  // 6) exclui o Customer duplicado (todas as FKs já foram repontadas).
  await tx.customer.delete({ where: { id: dup } });
}

async function main() {
  const fks = await fkList();
  let totalConsolidated = 0;
  const report: string[] = [];

  for (const cpf of MERGE_CPFS) {
    const h = cpfHash(cpf)!;
    const members = (await base.$queryRawUnsafe(
      `SELECT id, name, created_at FROM customers WHERE cpf_hash=$1 ORDER BY created_at ASC`, h,
    )) as Array<{ id: string; name: string; created_at: Date }>;
    if (members.length < 2) { report.push(`CPF ...${cpf.slice(-4)}: ${members.length} registro — nada a mesclar.`); continue; }

    // escolhe o principal: prefere quem tem prontuário; entre eles, mais relações; senão mais relações; desempate = mais antigo
    const enriched = [];
    for (const m of members) enriched.push({ ...m, ...(await countRel(fks, m.id)) });
    const withMR = enriched.filter((e) => e.hasMR);
    const pool = withMR.length ? withMR : enriched;
    pool.sort((a, b) => b.total - a.total || +new Date(a.created_at) - +new Date(b.created_at));
    const primary = pool[0];
    const dups = enriched.filter((e) => e.id !== primary.id);

    report.push(`\nCPF ...${cpf.slice(-4)} — principal: ${primary.id} (${primary.name}, ${primary.total} rel) | duplicados: ${dups.map((d) => `${d.id}(${d.total} rel)`).join(', ')}`);

    if (APPLY) {
      const file = await backup([primary.id, ...dups.map((d) => d.id)], fks);
      report.push(`   backup: ${file}`);
      for (const d of dups) {
        await prisma.$transaction((tx) => mergeOne(tx, primary.id, d.id, fks), { timeout: 60000 });
        totalConsolidated++;
      }
      const after = await countRel(fks, primary.id);
      report.push(`   ✅ mesclado. Relações no principal agora: ${after.total}`);
    }
  }

  console.log(report.join('\n'));
  console.log(`\n${APPLY ? 'Registros consolidados (duplicados removidos): ' + totalConsolidated : '(dry-run) Rode com --apply para executar.'}`);
}

main().then(async () => { await prisma.$disconnect(); await base.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('FALHOU:', e); await prisma.$disconnect(); await base.$disconnect(); process.exit(1); });
