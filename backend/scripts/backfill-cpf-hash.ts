/**
 * Backfill do cpfHash dos pacientes existentes + RELATÓRIO de CPFs duplicados e
 * inválidos. NÃO corrige nada (apenas calcula o hash determinístico para
 * unicidade futura e reporta para análise manual).
 *
 *   npx tsx scripts/backfill-cpf-hash.ts          (dry-run: só relatório)
 *   npx tsx scripts/backfill-cpf-hash.ts --apply  (grava cpfHash + relatório)
 */
import prisma from '../src/config/database';
import { normalizeCpf, isValidCpf, cpfHash } from '../src/shared/utils/cpf';

const APPLY = process.argv.includes('--apply');

async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, tenantId: true, name: true, cpfCnpj: true },
  });

  const byHash = new Map<string, Array<{ id: string; name: string; cpf: string; valid: boolean }>>();
  const invalid: Array<{ id: string; name: string; cpf: string }> = [];
  const updates: Array<{ id: string; h: string }> = [];
  let withCpf = 0;

  for (const c of customers) {
    const digits = normalizeCpf(c.cpfCnpj);
    if (!digits) continue;
    withCpf++;
    const h = cpfHash(digits)!;
    const valid = isValidCpf(digits);
    updates.push({ id: c.id, h });

    const arr = byHash.get(h) || [];
    arr.push({ id: c.id, name: c.name, cpf: digits, valid });
    byHash.set(h, arr);
    if (!valid) invalid.push({ id: c.id, name: c.name, cpf: digits });
  }

  let backfilled = 0;
  if (APPLY) {
    // Atualiza em lotes paralelos (rápido) em vez de 288 updates sequenciais.
    const CHUNK = 25;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      await Promise.all(slice.map((u) => prisma.customer.update({ where: { id: u.id }, data: { cpfHash: u.h } })));
      backfilled += slice.length;
    }
  }

  const dups = [...byHash.values()].filter((v) => v.length > 1);

  console.log('========== RELATÓRIO CPF ==========');
  console.log('Total pacientes:', customers.length, '| com CPF/CNPJ:', withCpf);
  if (APPLY) console.log('cpfHash gravado em:', backfilled);
  console.log('');
  console.log(`>>> CPFs DUPLICADOS (${dups.length} grupos) — RESOLVER MANUALMENTE antes do UNIQUE no banco:`);
  dups.forEach((g, i) => {
    console.log(`  Grupo ${i + 1} (CPF final ...${g[0].cpf.slice(-4)}):`);
    g.forEach((p) => console.log(`     - ${p.id} | ${p.name} | ${p.valid ? 'CPF válido' : 'CPF INVÁLIDO'}`));
  });
  console.log('');
  console.log(`>>> CPFs INVÁLIDOS (${invalid.length}) — revisar dígitos:`);
  invalid.forEach((p) => console.log(`     - ${p.id} | ${p.name} | ...${p.cpf.slice(-4)}`));

  if (!APPLY) console.log('\n(dry-run) Rode com --apply para gravar o cpfHash.');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('FALHOU:', e); await prisma.$disconnect(); process.exit(1); });
