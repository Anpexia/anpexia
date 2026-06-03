/**
 * Valida que o agendamento é criado para o PACIENTE CORRETO quando vários
 * pacientes compartilham o telefone (Fase 3 / passo 5).
 * - Com customerId (caminho do chatbot após "para quem?") -> vincula ao exato.
 * - Sem customerId (legado/painel) -> auto-link por telefone (mais recente).
 * Cria pacientes/agendamentos descartáveis e limpa no final.
 */
import prisma from '../src/config/database';
import { schedulingService } from '../src/modules/scheduling/scheduling.service';

function ok(c: any, m: string) { if (!c) throw new Error('FALHOU: ' + m); console.log('  ✓ ' + m); }
const PHONE = '31900000111';

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error('sem tenant');
  const t = tenant.id;
  const ids: string[] = [];
  const callIds: string[] = [];

  const mk = async (name: string) => {
    const c = await prisma.customer.create({ data: { tenantId: t, name, cellPhone: PHONE, phone: PHONE, isActive: true } });
    ids.push(c.id); return c;
  };
  const A = await mk('[BOOK] Paciente A');
  const B = await mk('[BOOK] Paciente B');
  const C = await mk('[BOOK] Paciente C');

  // Data futura (amanhã) — isEncaixe pula validação de slot.
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // 1) Com customerId = A -> agendamento DEVE ser de A (não B/C, mais recentes)
  const callA: any = await schedulingService.bookCall(
    { customerId: A.id, name: A.name, phone: PHONE, date, time: '10:00', isEncaixe: true, paymentType: 'PARTICULAR' } as any,
    t,
  );
  callIds.push(callA.id);
  ok(callA.customerId === A.id, 'com customerId: agendamento vinculado ao paciente EXATO (A), apesar de B/C no mesmo telefone');

  // 2) Sem customerId -> auto-link por telefone (mais recente = C). Regressão do comportamento legado.
  const callX: any = await schedulingService.bookCall(
    { name: 'Qualquer', phone: PHONE, date, time: '11:00', isEncaixe: true, paymentType: 'PARTICULAR' } as any,
    t,
  );
  callIds.push(callX.id);
  ok(callX.customerId === C.id, 'sem customerId: auto-link por telefone continua funcionando (mais recente)');

  // Limpeza
  await prisma.scheduledCall.deleteMany({ where: { id: { in: callIds } } });
  await prisma.scheduledCall.deleteMany({ where: { customerId: { in: ids } } }).catch(() => {});
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  console.log('  ✓ limpeza concluída');
  console.log('\nAGENDAMENTO PACIENTE CORRETO OK ✅');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('\nFALHOU ❌\n', e); await prisma.$disconnect(); process.exit(1); });
