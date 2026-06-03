/**
 * Integração do fluxo "Para quem é o atendimento?" no chatbot.
 * Teste 5: 1 paciente vinculado -> fluxo normal (não pergunta).
 * Teste 6: >=2 pacientes -> pergunta para quem.
 * Cria pacientes descartáveis e limpa no final.
 */
import prisma from '../src/config/database';
import { handleConversationFlow } from '../src/modules/chatbot/conversation-flow';

function ok(c: any, m: string) { if (!c) throw new Error('FALHOU: ' + m); console.log('  ✓ ' + m); }

const MULTI_PHONE = '31900000088';
const SINGLE_PHONE = '31900000099';

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error('sem tenant');
  const t = tenant.id;
  const ids: string[] = [];

  const mk = async (name: string, cell: string) => {
    const c = await prisma.customer.create({ data: { tenantId: t, name, cellPhone: cell, phone: cell, isActive: true } });
    ids.push(c.id); return c;
  };

  // 2 pacientes no mesmo telefone + 1 paciente em outro telefone
  await mk('[CBT] João Silva', MULTI_PHONE);
  await mk('[CBT] Maria Silva', MULTI_PHONE);
  await mk('[CBT] Solteiro Único', SINGLE_PHONE);

  // ----- Teste 6: múltiplos pacientes -----
  await handleConversationFlow(t, MULTI_PHONE, 'Cliente', 'oi'); // -> menu
  const r1 = await handleConversationFlow(t, MULTI_PHONE, 'Cliente', '1'); // -> agendar
  ok(/para quem/i.test(r1?.text || ''), 'múltiplos pacientes: pergunta "Para quem é o atendimento?"');
  ok(/João Silva/.test(r1!.text) && /Maria Silva/.test(r1!.text), 'lista os pacientes do telefone');
  ok(/Outro paciente/i.test(r1!.text), 'oferece "Outro paciente"');

  // Seleciona o paciente 1 -> avança (não pergunta de novo)
  const r2 = await handleConversationFlow(t, MULTI_PHONE, 'Cliente', '1');
  ok(!/para quem/i.test(r2?.text || ''), 'após escolher, NÃO pergunta de novo (avançou no fluxo)');

  // ----- Teste 5: paciente único -----
  await handleConversationFlow(t, SINGLE_PHONE, 'Cliente', 'oi'); // -> menu
  const s1 = await handleConversationFlow(t, SINGLE_PHONE, 'Cliente', '1'); // -> agendar
  ok(!/para quem/i.test(s1?.text || ''), 'paciente único: NÃO pergunta (fluxo idêntico ao atual)');

  // Limpeza
  await prisma.scheduledCall.deleteMany({ where: { customerId: { in: ids } } }).catch(() => {});
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  console.log(`  ✓ limpeza: ${ids.length} pacientes de teste removidos`);
  console.log('\nCHATBOT MULTI-PACIENTE OK ✅');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('\nFALHOU ❌\n', e); await prisma.$disconnect(); process.exit(1); });
