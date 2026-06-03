import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAnamnesisService } from '../src/modules/anamnesis/anamnesis.logic';

// Fake Prisma com 1 registro de anamnese e guarda de versão (optimistic locking).
function makeFakeAnamnesisPrisma(initial: { id: string; tenantId: string; data: any; version: number }) {
  let record: any = { ...initial, data: { ...initial.data } };
  return {
    _get: () => record,
    anamnesis: {
      async findFirst({ where }: any) {
        if (record && record.id === where.id && record.tenantId === where.tenantId) {
          return { ...record, data: { ...record.data } };
        }
        return null;
      },
      async create({ data }: any) {
        record = { id: 'a1', version: 0, createdAt: new Date(), ...data };
        return { ...record };
      },
      async updateMany({ where, data }: any) {
        if (
          record &&
          record.id === where.id &&
          record.tenantId === where.tenantId &&
          record.version === where.version
        ) {
          record = { ...record, ...data };
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
}

const TENANT = 't1';

test('merge raso: novo campo não apaga campos preenchidos por outro profissional', async () => {
  const fake = makeFakeAnamnesisPrisma({ id: 'a1', tenantId: TENANT, data: { queixaPrincipal: 'Dor lombar' }, version: 0 });
  const svc = makeAnamnesisService(fake as any);

  await svc.update(TENANT, 'a1', { hma: 'Irradia para MIE' }, 0);

  const rec = fake._get();
  assert.equal(rec.data.queixaPrincipal, 'Dor lombar'); // preservado
  assert.equal(rec.data.hma, 'Irradia para MIE'); // adicionado
  assert.equal(rec.version, 1); // versão incrementada
});

test('TESTE 6 (campos estruturados): dois salvamentos com a mesma versão não perdem dados', async () => {
  const fake = makeFakeAnamnesisPrisma({ id: 'a1', tenantId: TENANT, data: {}, version: 0 });
  const svc = makeAnamnesisService(fake as any);

  // Dois profissionais carregaram a versão 0 e salvam campos diferentes.
  await svc.update(TENANT, 'a1', { queixaPrincipal: 'Dor lombar' }, 0); // versão 0 -> 1
  await svc.update(TENANT, 'a1', { hma: 'Náuseas associadas' }, 0); // conflito -> re-merge -> 1 -> 2

  const rec = fake._get();
  assert.equal(rec.data.queixaPrincipal, 'Dor lombar'); // do 1º profissional, não perdido
  assert.equal(rec.data.hma, 'Náuseas associadas'); // do 2º profissional
  assert.equal(rec.version, 2);
});

test('cliente sem version (legado) ainda atualiza com merge', async () => {
  const fake = makeFakeAnamnesisPrisma({ id: 'a1', tenantId: TENANT, data: { a: '1' }, version: 3 });
  const svc = makeAnamnesisService(fake as any);

  await svc.update(TENANT, 'a1', { b: '2' }); // sem expectedVersion

  const rec = fake._get();
  assert.equal(rec.data.a, '1');
  assert.equal(rec.data.b, '2');
  assert.equal(rec.version, 4);
});

test('update em anamnese inexistente lança 404', async () => {
  const fake = makeFakeAnamnesisPrisma({ id: 'a1', tenantId: TENANT, data: {}, version: 0 });
  const svc = makeAnamnesisService(fake as any);
  await assert.rejects(() => svc.update(TENANT, 'inexistente', { x: '1' }, 0));
});
