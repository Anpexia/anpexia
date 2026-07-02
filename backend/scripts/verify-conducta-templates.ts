// Verificação SOMENTE de teste para "Modelos de Conduta".
// Cria linhas de teste, valida CRUD + ISOLAMENTO por médico (ownerId) e depois
// APAGA tudo o que criou (hard delete). Não deixa resíduo.
//
// Uso: npx tsx scripts/verify-conducta-templates.ts
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import prisma from '../src/config/database';
import { conductaTemplatesService } from '../src/modules/conductaTemplates/conductaTemplates.service';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  x FALHOU: ${name}`); }
}

async function main() {
  // Descobre um tenant com >= 2 usuários (para testar isolamento entre 2 médicos).
  const users = await prisma.user.findMany({
    where: { tenantId: { not: null } },
    select: { id: true, tenantId: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const byTenant = new Map<string, { id: string; name: string }[]>();
  for (const u of users) {
    const arr = byTenant.get(u.tenantId!) || [];
    arr.push({ id: u.id, name: u.name });
    byTenant.set(u.tenantId!, arr);
  }
  const entry = [...byTenant.entries()].find(([, us]) => us.length >= 2);
  if (!entry) { console.log('Sem tenant com 2+ usuários para testar isolamento — abortando.'); return; }
  const [tenantId, us] = entry;
  const doctorA = us[0];
  const doctorB = us[1];
  console.log(`Tenant ${tenantId} | Médico A=${doctorA.name} | Médico B=${doctorB.name}\n`);

  const createdIds: string[] = [];
  try {
    // 1. create para o médico A
    const t1 = await conductaTemplatesService.create(tenantId, doctorA.id, {
      title: '__TESTE Anamnese Otorrino', content: 'QP: ___. HDA: ___.', context: 'ANAMNESE',
    });
    createdIds.push(t1.id);
    check('create grava para o dono (ownerId=A)', t1.ownerId === doctorA.id && t1.tenantId === tenantId);

    // 2. list do A vê; list do B NÃO vê (ISOLAMENTO)
    const listA = await conductaTemplatesService.list(tenantId, doctorA.id, {});
    const listB = await conductaTemplatesService.list(tenantId, doctorB.id, {});
    check('médico A vê o próprio modelo', listA.some(x => x.id === t1.id));
    check('médico B NÃO vê o modelo do A (isolamento)', !listB.some(x => x.id === t1.id));

    // 3. getById cruzado → 404 para o B
    let crossBlocked = false;
    try { await conductaTemplatesService.getById(tenantId, doctorB.id, t1.id); }
    catch (e: any) { crossBlocked = e?.statusCode === 404; }
    check('getById do B no modelo do A → 404', crossBlocked);

    // 4. update cruzado → 404 (B não edita modelo do A)
    let updBlocked = false;
    try { await conductaTemplatesService.update(tenantId, doctorB.id, t1.id, { title: 'hack' }); }
    catch (e: any) { updBlocked = e?.statusCode === 404; }
    check('update do B no modelo do A → 404 (não sobrescreve)', updBlocked);

    // 5. update do próprio dono funciona
    const upd = await conductaTemplatesService.update(tenantId, doctorA.id, t1.id, { title: '__TESTE Editado' });
    check('dono edita o próprio modelo', upd.title === '__TESTE Editado');

    // 6. busca por texto
    const search = await conductaTemplatesService.list(tenantId, doctorA.id, { search: 'Editado' });
    check('busca por título encontra', search.some(x => x.id === t1.id));

    // 7. filtro por contexto
    const byCtx = await conductaTemplatesService.list(tenantId, doctorA.id, { context: 'ANAMNESE' });
    check('filtro por contexto ANAMNESE retorna', byCtx.some(x => x.id === t1.id));

    // 8. soft delete → some da lista
    await conductaTemplatesService.remove(tenantId, doctorA.id, t1.id);
    const afterDel = await conductaTemplatesService.list(tenantId, doctorA.id, {});
    check('após excluir, some da lista', !afterDel.some(x => x.id === t1.id));
  } finally {
    // Limpeza: hard delete de tudo que criamos (não deixa resíduo).
    if (createdIds.length) {
      await prisma.conductaTemplate.deleteMany({ where: { id: { in: createdIds } } });
      console.log(`\n[cleanup] ${createdIds.length} linha(s) de teste removida(s).`);
    }
  }

  console.log(`\n=== Resultado: ${pass} ok, ${fail} falha(s) ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error('ERRO:', e); await prisma.$disconnect(); process.exit(1); });
