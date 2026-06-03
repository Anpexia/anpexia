import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCpf, isValidCpf, computeCpfHash } from '../src/shared/utils/cpf';

const SECRET = 'a'.repeat(64);

test('normalizeCpf remove máscara', () => {
  assert.equal(normalizeCpf('111.444.777-35'), '11144477735');
  assert.equal(normalizeCpf(''), '');
  assert.equal(normalizeCpf(null), '');
});

test('isValidCpf valida dígitos verificadores', () => {
  assert.equal(isValidCpf('111.444.777-35'), true);
  assert.equal(isValidCpf('11144477735'), true);
  assert.equal(isValidCpf('111.444.777-00'), false); // dígitos errados
  assert.equal(isValidCpf('111.111.111-11'), false); // todos iguais
  assert.equal(isValidCpf('123'), false); // curto
});

test('computeCpfHash é determinístico e ignora máscara', () => {
  const h1 = computeCpfHash('111.444.777-35', SECRET);
  const h2 = computeCpfHash('11144477735', SECRET);
  assert.equal(h1, h2);
  assert.ok(h1 && h1.length === 64); // sha256 hex
});

test('computeCpfHash muda com segredo diferente (blind index seguro)', () => {
  const h1 = computeCpfHash('11144477735', SECRET);
  const h2 = computeCpfHash('11144477735', 'b'.repeat(64));
  assert.notEqual(h1, h2);
});

test('computeCpfHash retorna null para vazio', () => {
  assert.equal(computeCpfHash('', SECRET), null);
  assert.equal(computeCpfHash('---', SECRET), null);
});
