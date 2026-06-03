import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { evolutionApi } from '../src/modules/messaging/evolution.client';

test('formatPhone: celular 11 dígitos -> 55 + 11', () => {
  assert.equal(evolutionApi.formatPhone('31999999999'), '5531999999999');
  assert.equal(evolutionApi.formatPhone('5531999999999'), '5531999999999');
  assert.equal(evolutionApi.formatPhone('(31) 99999-9999'), '5531999999999');
});

test('formatPhone: FIXO retorna null (NUNCA injeta 9 — regressão do bug)', () => {
  assert.equal(evolutionApi.formatPhone('3135351234'), null);
  assert.equal(evolutionApi.formatPhone('553135351234'), null);
  assert.equal(evolutionApi.formatPhone('(31) 3535-1234'), null);
});

test('formatPhone: celular antigo 10 dígitos (3º dígito 6-9) recebe o 9', () => {
  // 31 8888-7777 (antigo celular) -> 31 9 8888-7777
  assert.equal(evolutionApi.formatPhone('3188887777'), '5531988887777');
});

test('formatPhone: número inválido retorna null', () => {
  assert.equal(evolutionApi.formatPhone('123'), null);
  assert.equal(evolutionApi.formatPhone('0099999999'), null); // DDD inválido
});

test('formatPhone: jid do WhatsApp é aceito', () => {
  assert.equal(evolutionApi.formatPhone('5531999999999@s.whatsapp.net'), '5531999999999');
});
