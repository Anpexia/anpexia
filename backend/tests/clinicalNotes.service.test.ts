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
        const row = { id: `note_${++seq}`, createdAt: new Date(Date.now() + seq), updatedById: null, updatedAt: null, ...data };
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
      async findFirst({ where }: any) {
        return (
          notes.find(
            (n) =>
              n.id === where.id &&
              (where.tenantId === undefined || n.tenantId === where.tenantId),
          ) || null
        );
      },
      async update({ where, data }: any) {
        const row = notes.find((n) => n.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
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

// ---- Edição pelo autor (nova regra de negócio) ----

// EDIT 1 — Autor edita o próprio registro → permitido, autor/data originais preservados
test('EDIT 1: autor edita o próprio registro (texto livre)', async () => {
  const { svc, notes } = setup();
  const note = await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'Paciente relata cefaleia.');
  const createdAtBefore = note.createdAt;

  const edited = await svc.update(TENANT, note.id, DR_A, 'Paciente relata cefaleia intensa.');

  assert.equal(edited.content, 'Paciente relata cefaleia intensa.');
  assert.equal(edited.authorId, 'drA');             // autor original preservado
  assert.equal(edited.authorName, 'Dr. João');      // nome original preservado
  assert.equal(+edited.createdAt, +createdAtBefore); // data de criação preservada
  assert.equal(edited.updatedById, 'drA');          // quem editou
  assert.ok(edited.updatedAt instanceof Date);      // data de edição registrada
  assert.equal(notes.length, 1);                    // não cria novo registro
});

// EDIT 2 — Médico B NÃO pode editar registro do Médico A → 403
test('EDIT 2: não-autor é bloqueado (403)', async () => {
  const { svc } = setup();
  const note = await svc.create(TENANT, PATIENT, DR_A, 'EVOLUCAO', 'Evolução do Dr. João.');
  await assert.rejects(
    () => svc.update(TENANT, note.id, DR_B, 'Tentativa de edição indevida.'),
    (err: any) => err.statusCode === 403 && err.code === 'NOT_AUTHOR',
  );
  // Conteúdo permanece intacto
  const list = await svc.list(TENANT, PATIENT, 'EVOLUCAO');
  assert.equal(list[0].content, 'Evolução do Dr. João.');
});

// EDIT 3 — Editar várias vezes preserva autor/criação; só muda updatedAt/conteúdo
test('EDIT 3: edições múltiplas preservam autoria e histórico', async () => {
  const { svc } = setup();
  const note = await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'v1');
  const created = note.createdAt;
  await svc.update(TENANT, note.id, DR_A, 'v2');
  const final = await svc.update(TENANT, note.id, DR_A, 'v3');
  assert.equal(final.content, 'v3');
  assert.equal(final.authorId, 'drA');
  assert.equal(+final.createdAt, +created);
});

// EDIT 4 — Edição com conteúdo vazio é rejeitada
test('EDIT 4: rejeita edição com conteúdo vazio', async () => {
  const { svc } = setup();
  const note = await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'algo');
  await assert.rejects(() => svc.update(TENANT, note.id, DR_A, '   '));
});

// EDIT 5 — Edição inexistente → 404
test('EDIT 5: registro inexistente → 404', async () => {
  const { svc } = setup();
  await assert.rejects(
    () => svc.update(TENANT, 'note_inexistente', DR_A, 'x'),
    (err: any) => err.statusCode === 404,
  );
});

// EDIT 6 — Auditoria da edição registra editor, autor original e antes/depois
test('EDIT 6: auditoria da edição registra editor e conteúdo antes/depois', async () => {
  const { svc, auditCalls } = setup();
  const note = await svc.create(TENANT, PATIENT, DR_A, 'ANAMNESE', 'antes');
  await svc.update(TENANT, note.id, DR_A, 'depois');
  const a = auditCalls.find((c) => c.action === 'UPDATE_CLINICALNOTE');
  assert.ok(a, 'deve haver auditoria de UPDATE');
  assert.equal(a.userId, 'drA');
  assert.equal(a.metadata.originalAuthorId, 'drA');
  assert.equal(a.metadata.contentBefore, 'antes');
  assert.equal(a.metadata.contentAfter, 'depois');
});
