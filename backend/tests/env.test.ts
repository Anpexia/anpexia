import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const BACKEND = path.join(process.cwd());

// Carrega src/config/env.ts num subprocesso com um ENCRYPTION_KEY específico.
// dotenv NÃO sobrescreve vars já presentes no ambiente, então a chave injetada
// vence a do .env; as demais obrigatórias (JWT etc.) vêm do .env do backend.
function loadEnvWith(encKey: string) {
  const script = "import('./src/config/env').then(() => process.exit(0)).catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });";
  const res = spawnSync('node', ['--import', 'tsx', '-e', script], {
    cwd: BACKEND,
    env: { ...process.env, ENCRYPTION_KEY: encKey },
    encoding: 'utf8',
  });
  return res;
}

test('startup bloqueia ENCRYPTION_KEY com tamanho inválido', () => {
  const res = loadEnvWith('abc123');
  assert.notEqual(res.status, 0, 'deveria falhar com chave curta');
  assert.match(res.stderr, /ENCRYPTION_KEY/);
});

test('startup bloqueia ENCRYPTION_KEY não-hexadecimal', () => {
  const res = loadEnvWith('z'.repeat(64));
  assert.notEqual(res.status, 0, 'deveria falhar com chave não-hex');
  assert.match(res.stderr, /ENCRYPTION_KEY/);
});

test('startup aceita ENCRYPTION_KEY válida (64 hex)', () => {
  const res = loadEnvWith('a'.repeat(64));
  assert.equal(res.status, 0, `deveria carregar; stderr=${res.stderr}`);
});
