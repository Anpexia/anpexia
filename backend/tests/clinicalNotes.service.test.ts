import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClinicalNotesService } from '../src/modules/clinicalNotes/clinicalNotes.logic';

// ---- Fake Prisma em memória (append-only, sem banco) ----
function makeFakePrisma(patients: Array<{ id: string; tenantId: string }>) {
  const notes: any[] = [];
  let seq = 0;
  const prisma = {
    customer: {
      async findFirst({ where }: any) {
        return patients.find((p) => p.id === where.id && p.tenantId === where.tenantId) || null;
      },
    },
    clinicalNote: {
      async create({ data }: any) {
        const row = { id: `note_${++seq}`, createdAt: new Date(Date.now() + seq), ...data };
        notes.push(row);
        return row;
      },
      async findMany({ where, orderBy }: any) {
        let rows = notes.filter(
          (n) =>
            (where.tenantId === undefined || n.tenantId === where.tenantId) &&
            (where.patientId === undefined || n.patientId === where.patientId) &&
            (where.context === undefined || n.context === where.context),
        );
        if (orderBy?.createdAt === 'asc') rows = rows.sort((a, b) => +a.createdAt - +b.createdAt);
        return rows;
      },
    },
  };
  return { prisma, notes };
}

const TENANT = 't1';
const PATIENT = 'p1';
const DR_A = { id: 'drA', name: 'Dr. João', email: 'joao@x.com', role: 'OWNER' };
const DR_B = { id: 'drB', name: 'Dra. Maria', email: 'maria@x.com', role: 'MANAGER' };

function setup() {
  const auditCalls: any[] = [];
  const { prisma, notes } = makeFakePrisma([{ id: PATIENT, tenantId: TENANT }]);
  const svc = makeClinicalNotesService({
    prisma: prisma as any,
    audit: (input) => { auditCalls.push(input); },
  });
  return { svc, notes, auditCalls };
}

// TESTE 1 — Médico A adiciona texto → registro criado
test('TESTE 1: Médico A adiciona texto e o registro é criado', async () => {
  const { svc, notes } = setup();
  const note = await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Paciente relata cefaleia.');
  assert.equal(note.content, 'Paciente relata cefaleia.');
  assert.equal(note.authorId, 'drA');
  assert.equal(note.authorName, 'Dr. João');
  assert.equal(note.context, 'ANAMNESE');
  assert.equal(notes.length, 1);
});

// TESTE 2 — Médico B adiciona → os dois registros permanecem
test('TESTE 2: Médico B adiciona e ambos os registros permanecem', async () => {
  const { svc } = setup();
  await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Paciente relata cefaleia.');
  await svc.create(TENANT, PATIENT, DR_B, 'ANAMNESE', 'Solicitado exame complementar.');
  const list = await svc.list(TENANT, PATIENT, 'ANAMNESE');
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((n: any) => n.content), [
    'Paciente relata cefaleia.',
    'Solicitado exame complementar.',
  ]);
  assert.deepEqual(list.map((n: any) => n.authorName), ['Dr. João', 'Dra. Maria']);
});

// TESTE 3 — Múltiplos registros do mesmo médico → histórico preservado
test('TESTE 3: múltiplos registros do mesmo médico preservam histórico', async () => {
  const { svc } = setup();
  await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Paciente relata cefaleia.');
  await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Refere náuseas associadas.');
  const list = await svc.list(TENANT, PATIENT, 'ANAMNESE');
  assert.equal(list.length, 2);
  assert.ok(list.every((n: any) => n.authorId === 'drA'));
});

// TESTE 4 — Anamnese Livre → context = ANAMNESE
test('TESTE 4: anamnese livre grava context = ANAMNESE', async () => {
  const { svc } = setup();
  const note = await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Texto anamnese.');
  assert.equal(note.context, 'ANAMNESE');
});

// TESTE 5 — Evolução Livre → context = EVOLUCAO
test('TESTE 5: evolução livre grava context = EVOLUCAO', async () => {
  const { svc } = setup();
  const note = await svc.create(TENANT, PATIENT, DR_A, 'EVOLUCAO', 'Texto evolução.');
  assert.equal(note.context, 'EVOLUCAO');
});

// TESTE 6 — Concorrência: dois usuários simultâneos, nenhuma perda
test('TESTE 6: dois usuários salvando simultaneamente não perdem dados', async () => {
  const { svc } = setup();
  await Promise.all([
    svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Conteúdo do Dr. João.'),
    svc.create(TENANT, PATIENT, DR_B, 'ANAMNESE', 'Conteúdo da Dra. Maria.'),
  ]);
  const list = await svc.list(TENANT, PATIENT, 'ANAMNESE');
  assert.equal(list.length, 2);
  const contents = list.map((n: any) => n.content).sort();
  assert.deepEqual(contents, ['Conteúdo da Dra. Maria.', 'Conteúdo do Dr. João.']);
});

// TESTE 7 — Auditoria registra o conteúdo adicionado
test('TESTE 7: auditoria registra usuário, ação e conteúdo', async () => {
  const { svc, auditCalls } = setup();
  await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Paciente relata cefaleia.');
  assert.equal(auditCalls.length, 1);
  const a = auditCalls[0];
  assert.equal(a.action, 'CREATE_CLINICALNOTE');
  assert.equal(a.entity, 'ClinicalNote');
  assert.equal(a.userId, 'drA');
  assert.equal(a.metadata.content, 'Paciente relata cefaleia.');
  assert.equal(a.metadata.context, 'ANAMNESE');
});

// TESTE 8 — Isolamento: anamnese não aparece na evolução e vice-versa
test('TESTE 8: anamnese e evolução ficam isoladas por context', async () => {
  const { svc } = setup();
  await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Somente anamnese.');
  await svc.create(TENANT, PATIENT, DR_A, 'EVOLUCAO', 'Somente evolução.');

  const anamnese = await svc.list(TENANT, PATIENT, 'ANAMNESE');
  const evolucao = await svc.list(TENANT, PATIENT, 'EVOLUCAO');

  assert.equal(anamnese.length, 1);
  assert.equal(evolucao.length, 1);
  assert.equal(anamnese[0].content, 'Somente anamnese.');
  assert.equal(evolucao[0].content, 'Somente evolução.');
  // Nenhum vazamento entre contextos
  assert.ok(!anamnese.some((n: any) => n.context === 'EVOLUCAO'));
  assert.ok(!evolucao.some((n: any) => n.context === 'ANAMNESE'));
});

// Extra — conteúdo vazio é rejeitado; contexto inválido é rejeitado
test('rejeita conteúdo vazio e contexto inválido', async () => {
  const { svc } = setup();
  await assert.rejects(() => svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', '   '));
  await assert.rejects(() => svc.create(TENANT, PATIENT, DR_A, 'OUTRO', 'x'));
});
