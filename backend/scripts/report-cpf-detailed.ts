/**
 * Relatório DETALHADO (somente leitura) de CPFs duplicados e inválidos, para
 * análise manual. NÃO corrige nada.
 *   npx tsx scripts/report-cpf-detailed.ts
 */
import prisma from '../src/config/database';
import { normalizeCpf, isValidCpf, cpfHash } from '../src/shared/utils/cpf';

function maskCpf(d: string): string {
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}
function fmtDate(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : '—';
}
function fmtDateTime(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));

  const customers = await prisma.customer.findMany({
    select: { id: true, tenantId: true, name: true, cpfCnpj: true, cellPhone: true, phone: true, birthDate: true, createdAt: true },
  });

  const byHash = new Map<string, typeof customers>();
  const invalid: typeof customers = [];

  for (const c of customers) {
    const digits = normalizeCpf(c.cpfCnpj);
    if (!digits) continue;
    const h = cpfHash(digits)!;
    const arr = (byHash.get(h) || []) as typeof customers;
    arr.push(c); byHash.set(h, arr);
    if (!isValidCpf(digits)) invalid.push(c);
  }

  const dups = [...byHash.values()].filter((v) => v.length > 1);

  console.log('================================================================');
  console.log(' FASE 1 — RELATÓRIO DE CPFs DUPLICADOS (' + dups.length + ' grupos)');
  console.log('================================================================');
  dups.forEach((g, i) => {
    const cpf = maskCpf(normalizeCpf(g[0].cpfCnpj));
    console.log(`\nCPF ${cpf}  (${g.length} pacientes)`);
    g.forEach((p, j) => {
      console.log(`  Paciente ${String.fromCharCode(65 + j)}`);
      console.log(`    - Nome:       ${p.name}`);
      console.log(`    - Nascimento: ${fmtDate(p.birthDate)}`);
      console.log(`    - Celular:    ${p.cellPhone || p.phone || '—'}`);
      console.log(`    - Criado em:  ${fmtDateTime(p.createdAt)}`);
      console.log(`    - ID:         ${p.id}`);
      console.log(`    - Clínica:    ${tenantName.get(p.tenantId) || p.tenantId}`);
    });
  });

  console.log('\n\n================================================================');
  console.log(' FASE 2 — RELATÓRIO DE CPFs INVÁLIDOS (' + invalid.length + ')');
  console.log('================================================================');
  invalid.forEach((p, i) => {
    console.log(`\n${i + 1}. CPF informado: ${maskCpf(normalizeCpf(p.cpfCnpj))}`);
    console.log(`    - Nome:       ${p.name}`);
    console.log(`    - Nascimento: ${fmtDate(p.birthDate)}`);
    console.log(`    - Telefone:   ${p.cellPhone || p.phone || '—'}`);
    console.log(`    - ID:         ${p.id}`);
    console.log(`    - Clínica:    ${tenantName.get(p.tenantId) || p.tenantId}`);
  });

  console.log('\n\n>>> NENHUMA correção foi aplicada (somente leitura).');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('FALHOU:', e); await prisma.$disconnect(); process.exit(1); });
