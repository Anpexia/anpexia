import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import dotenv from 'dotenv';

// Carrega .env do backend (mesmo padrão do load-env). Em produção já está no ambiente.
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test('tabela clinical_notes existe e é consultável', async () => {
  const count = await prisma.clinicalNote.count();
  assert.equal(typeof count, 'number');
});

test('clinical_notes tem as colunas esperadas', async () => {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'clinical_notes'`,
  )) as Array<{ column_name: string }>;
  const cols = new Set(rows.map((r) => r.column_name));
  for (const expected of ['id', 'tenant_id', 'patient_id', 'author_id', 'author_name', 'context', 'content', 'created_at']) {
    assert.ok(cols.has(expected), `coluna ausente: ${expected}`);
  }
});

test('anamneses possui coluna version', async () => {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'anamneses' AND column_name = 'version'`,
  )) as Array<{ column_name: string }>;
  assert.equal(rows.length, 1);
});

after(async () => {
  await prisma.$disconnect();
});
