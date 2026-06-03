/**
 * Análise SOMENTE LEITURA dos grupos a mesclar: descobre todas as FKs que
 * referenciam customers(id) e conta quantos registros cada paciente duplicado
 * possui em cada tabela filha. Informa o desenho seguro da mesclagem.
 */
import { PrismaClient } from '@prisma/client';
import { cpfHash } from '../src/shared/utils/cpf';

const db = new PrismaClient();

// Grupos APROVADOS para mesclar (dígitos do CPF).
const MERGE_CPFS = ['03374036511', '17520590690', '25443704672', '33754780620', '08786550691', '52315517672'];

async function main() {
  // 1) Descobrir FKs que referenciam customers(id).
  const fks = (await db.$queryRawUnsafe(`
    SELECT tc.table_name AS child_table, kcu.column_name AS child_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'customers' AND ccu.column_name = 'id'
    ORDER BY tc.table_name`)) as Array<{ child_table: string; child_column: string }>;

  console.log('=== FKs que referenciam customers(id) ===');
  fks.forEach((f) => console.log(`  ${f.child_table}.${f.child_column}`));

  // FKs-filhas de tabelas com unicidade (prontuário e convênio).
  for (const t of ['medical_records', 'patient_convenios']) {
    const ch = (await db.$queryRawUnsafe(`
      SELECT tc.table_name AS child, kcu.column_name AS col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name=$1 AND ccu.column_name='id'`, t)) as any[];
    console.log(`  filhas de ${t}: ${ch.map((c) => c.child + '.' + c.col).join(', ') || '(nenhuma)'}`);
  }
  console.log('');

  // 2) Para cada grupo, listar registros e contagens por tabela filha.
  for (const cpf of MERGE_CPFS) {
    const h = cpfHash(cpf)!;
    const members = (await db.$queryRawUnsafe(
      `SELECT id, name, tenant_id, created_at FROM customers WHERE cpf_hash = $1 ORDER BY created_at ASC`, h,
    )) as Array<{ id: string; name: string; tenant_id: string; created_at: Date }>;

    console.log(`\n===== CPF ...${cpf.slice(-4)} (${members.length} registros) =====`);
    for (const m of members) {
      const counts: string[] = [];
      let total = 0;
      for (const f of fks) {
        const r = (await db.$queryRawUnsafe(
          `SELECT count(*)::int AS n FROM "${f.child_table}" WHERE "${f.child_column}" = $1`, m.id,
        )) as Array<{ n: number }>;
        if (r[0].n > 0) { counts.push(`${f.child_table}=${r[0].n}`); total += r[0].n; }
      }
      // chat_messages e audit_logs (não-FK)
      console.log(`  ${m.id} | ${m.name} | criado ${new Date(m.created_at).toISOString().slice(0, 10)} | relacionados: ${total} ${counts.length ? '(' + counts.join(', ') + ')' : '(vazio)'}`);
    }
  }
}

main().then(async () => { await db.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('FALHOU:', e); await db.$disconnect(); process.exit(1); });
