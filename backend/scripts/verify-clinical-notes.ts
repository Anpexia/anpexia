/**
 * Verificação de integração REAL contra o banco configurado no .env.
 * Cria notas de Anamnese e Evolução pelo service real (passando por
 * criptografia, isolamento por tenant e auditoria), valida e LIMPA tudo.
 *
 * Uso: npx tsx scripts/verify-clinical-notes.ts
 */
import { PrismaClient } from '@prisma/client';
import prisma from '../src/config/database';
import { tenantStore } from '../src/shared/middleware/tenantContext';
import { clinicalNotesService } from '../src/modules/clinicalNotes/clinicalNotes.service';

// Client base (SEM a extensão de criptografia) para inspecionar o dado em repouso.
const rawDb = new PrismaClient();

function assert(cond: any, msg: string) {
  if (!cond) throw new Error('ASSERT FALHOU: ' + msg);
  console.log('  ✓ ' + msg);
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) throw new Error('Nenhum tenant encontrado');
  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id }, select: { id: true, name: true, email: true, role: true } });
  if (!user) throw new Error('Nenhum usuário no tenant');
  const patient = await prisma.customer.findFirst({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
  if (!patient) throw new Error('Nenhum paciente no tenant');

  console.log(`Tenant: ${tenant.name} | Paciente: ${patient.name} | Autor: ${user.name}`);

  const createdIds: string[] = [];

  await tenantStore.run({ tenantId: tenant.id, userId: user.id, role: user.role } as any, async () => {
    const author = { id: user.id, name: user.name, email: user.email, role: user.role };

    const a = await clinicalNotesService.create(tenant.id, patient.id, author, 'ANAMNESE', '[INTEG] anamnese A');
    const e = await clinicalNotesService.create(tenant.id, patient.id, author, 'EVOLUCAO', '[INTEG] evolucao E');
    createdIds.push(a.id, e.id);

    const anamnese = await clinicalNotesService.list(tenant.id, patient.id, 'ANAMNESE');
    const evolucao = await clinicalNotesService.list(tenant.id, patient.id, 'EVOLUCAO');

    assert(anamnese.some((n: any) => n.id === a.id && n.content === '[INTEG] anamnese A'), 'ANAMNESE lista o registro com conteúdo decriptado');
    assert(!anamnese.some((n: any) => n.id === e.id), 'ANAMNESE não vaza registro de EVOLUCAO (isolamento)');
    assert(evolucao.some((n: any) => n.id === e.id && n.content === '[INTEG] evolucao E'), 'EVOLUCAO lista o registro com conteúdo decriptado');
    assert(!evolucao.some((n: any) => n.id === a.id), 'EVOLUCAO não vaza registro de ANAMNESE (isolamento)');
    assert(a.authorName === user.name, 'authorName resolvido autoritativamente');
  });

  // Conteúdo deve estar CRIPTOGRAFADO no banco — usar client base (sem extensão).
  const rawRows = (await rawDb.$queryRawUnsafe(
    `SELECT content FROM clinical_notes WHERE id = ANY($1::text[])`,
    createdIds,
  )) as Array<{ content: string }>;
  assert(rawRows.length === 2 && rawRows.every((r) => r.content.startsWith('enc:v1:')), 'conteúdo armazenado está criptografado no banco');

  // Auditoria com conteúdo
  const audits = await prisma.auditLog.findMany({ where: { entityId: { in: createdIds }, action: 'CREATE_CLINICALNOTE' } });
  assert(audits.length === 2, 'auditoria registrou 2 criações');
  assert(audits.every((x: any) => x.metadata && (x.metadata as any).content), 'auditoria contém o conteúdo adicionado');

  // Limpeza
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
  await prisma.clinicalNote.deleteMany({ where: { id: { in: createdIds } } });
  console.log('  ✓ limpeza concluída (notas e auditorias de teste removidas)');

  console.log('\nINTEGRAÇÃO OK ✅');
}

main()
  .then(async () => { await prisma.$disconnect(); await rawDb.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('\nINTEGRAÇÃO FALHOU ❌\n', e); await prisma.$disconnect(); await rawDb.$disconnect(); process.exit(1); });
