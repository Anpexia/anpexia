/**
 * Integração: dataQuality (CPF inválido/duplicado) + guard de faturamento.
 * Cria pacientes descartáveis e limpa.
 */
import prisma from '../src/config/database';
import { tenantStore } from '../src/shared/middleware/tenantContext';
import { computeCpfQuality, assertCpfReliableForBilling } from '../src/modules/customers/customer.service';
import { AppError } from '../src/shared/middleware/error-handler';
import { cpfHash } from '../src/shared/utils/cpf';

function ok(c: any, m: string) { if (!c) throw new Error('FALHOU: ' + m); console.log('  ✓ ' + m); }

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error('sem tenant');
  const t = tenant.id;
  const ids: string[] = [];

  await tenantStore.run({ tenantId: t } as any, async () => {
    // CPF válido
    const valid = await prisma.customer.create({ data: { tenantId: t, name: '[Q] Valido', cpfCnpj: '11144477735', cpfHash: cpfHash('11144477735'), isActive: true } });
    ids.push(valid.id);
    const qv = await computeCpfQuality(t, valid as any);
    ok(qv.cpfValid === true && !qv.cpfDuplicate, 'CPF válido: cpfValid=true, sem duplicado');
    await assertCpfReliableForBilling(t, valid.id);
    ok(true, 'guard de faturamento NÃO bloqueia CPF válido');

    // CPF inválido
    const inv = await prisma.customer.create({ data: { tenantId: t, name: '[Q] Invalido', cpfCnpj: '11111111111', cpfHash: cpfHash('11111111111'), isActive: true } });
    ids.push(inv.id);
    const qi = await computeCpfQuality(t, inv as any);
    ok(qi.cpfValid === false, 'CPF inválido detectado (cpfValid=false)');
    let blocked = false;
    try { await assertCpfReliableForBilling(t, inv.id); } catch (e: any) { blocked = e instanceof AppError && e.code === 'CPF_UNRELIABLE'; }
    ok(blocked, 'guard BLOQUEIA faturamento p/ CPF inválido (422 CPF_UNRELIABLE)');

    // CPF duplicado (dois com o mesmo cpfHash, criados direto)
    const h = cpfHash('52998224725')!;
    const d1 = await prisma.customer.create({ data: { tenantId: t, name: '[Q] Dup1', cpfCnpj: '52998224725', cpfHash: h, isActive: true } });
    const d2 = await prisma.customer.create({ data: { tenantId: t, name: '[Q] Dup2', cpfCnpj: '52998224725', cpfHash: h, isActive: true } });
    ids.push(d1.id, d2.id);
    const qd = await computeCpfQuality(t, d1 as any);
    ok(qd.cpfDuplicate === true, 'CPF duplicado detectado (cpfDuplicate=true)');
    let blockedDup = false;
    try { await assertCpfReliableForBilling(t, d1.id); } catch (e: any) { blockedDup = e instanceof AppError && e.code === 'CPF_UNRELIABLE'; }
    ok(blockedDup, 'guard BLOQUEIA faturamento p/ CPF duplicado');
  });

  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  console.log('  ✓ limpeza concluída');
  console.log('\nQUALIDADE CPF + GUARD OK ✅');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('\nFALHOU ❌\n', e); await prisma.$disconnect(); process.exit(1); });
