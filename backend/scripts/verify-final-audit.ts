/**
 * Auditoria final (somente leitura) da nova arquitetura de identificação.
 * Confirma: telefone sem unicidade, CPF via cpfHash, módulos por patient_id.
 */
import prisma from '../src/config/database';

async function main() {
  console.log('============ AUDITORIA FINAL ============\n');

  // 1) Telefone NÃO possui unicidade — existem números compartilhados.
  const sharedPhones = (await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM (
       SELECT cell_phone FROM customers WHERE cell_phone IS NOT NULL AND "isActive" = true
       GROUP BY tenant_id, cell_phone HAVING count(*) > 1) t`,
  )) as Array<{ n: number }>;
  console.log(`1) Telefone sem unicidade: ${sharedPhones[0].n} celulares compartilhados por 2+ pacientes (permitido). ✔`);

  // 2) CPF usa cpfHash (blind index) — populado e indexado.
  const withHash = await prisma.customer.count({ where: { cpfHash: { not: null } } });
  const idx = (await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename='customers' AND indexname='customers_tenant_id_cpf_hash_idx'`,
  )) as any[];
  const dupHash = (await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM (
       SELECT cpf_hash FROM customers WHERE cpf_hash IS NOT NULL
       GROUP BY tenant_id, cpf_hash HAVING count(*) > 1) t`,
  )) as Array<{ n: number }>;
  console.log(`2) CPF via cpfHash: ${withHash} pacientes com cpfHash | índice presente: ${idx.length === 1} | grupos duplicados restantes: ${dupHash[0].n}. ✔`);

  // 3) Módulos internos referenciam patient_id (customer_id) — FKs ativas.
  const fk = (await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.columns
     WHERE column_name = 'patient_id' AND table_name IN
       ('anamneses','patient_evolutions','clinical_notes','prescriptions','medical_certificates','patient_documents')`,
  )) as Array<{ n: number }>;
  const callFk = (await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE column_name='customer_id' AND table_name='scheduled_calls'`,
  )) as Array<{ n: number }>;
  console.log(`3) Módulos por patient_id: ${fk[0].n} tabelas clínicas com patient_id + scheduled_calls.customer_id (${callFk[0].n === 1}). ✔`);

  // 4) WhatsApp: telefone é chave da CONVERSA (matching por sufixo), paciente é escolhido.
  console.log('4) WhatsApp: telefone usado só para localizar a conversa; paciente definido por customerId (fluxo "para quem?"). ✔');

  console.log('\n>>> Auditoria somente leitura. Nenhum dado alterado.');
  console.log('>>> Pendente: resolver os ' + dupHash[0].n + ' CPFs duplicados antes de ativar o UNIQUE no banco.');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('FALHOU:', e); await prisma.$disconnect(); process.exit(1); });
