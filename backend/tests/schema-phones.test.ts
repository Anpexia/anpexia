import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test('customers possui colunas phone, cell_phone e landline_phone', async () => {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name IN ('phone','cell_phone','landline_phone')`,
  )) as Array<{ column_name: string }>;
  const cols = new Set(rows.map((r) => r.column_name));
  assert.ok(cols.has('phone'), 'phone deve existir (legado)');
  assert.ok(cols.has('cell_phone'), 'cell_phone deve existir');
  assert.ok(cols.has('landline_phone'), 'landline_phone deve existir');
});

test('Prisma Client expõe cellPhone/landlinePhone', async () => {
  const c = await prisma.customer.findFirst({ select: { id: true, phone: true, cellPhone: true, landlinePhone: true } });
  // Só valida que a query não quebra (campos existem no client).
  assert.ok(c === null || typeof c === 'object');
});

after(async () => { await prisma.$disconnect(); });
