import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerSchema, updateCustomerSchema } from '../src/modules/customers/customer.validators';

test('cadastro manual EXIGE nome e data de nascimento', () => {
  assert.doesNotThrow(() => createCustomerSchema.parse({ name: 'Maria Silva', birthDate: '1990-05-10' }));
  assert.throws(() => createCustomerSchema.parse({ name: 'Maria Silva' }), /nascimento/i); // sem birthDate
  assert.throws(() => createCustomerSchema.parse({ name: 'M', birthDate: '1990-05-10' })); // nome curto
});

test('CPF, celular, fixo, documento são opcionais no cadastro', () => {
  assert.doesNotThrow(() => createCustomerSchema.parse({ name: 'Recem Nascido', birthDate: '2026-06-01' }));
  assert.doesNotThrow(() => createCustomerSchema.parse({ name: 'Estrangeiro Sem CPF', birthDate: '1980-01-01', documentType: 'PASSPORT', documentNumber: 'X1234567' }));
});

test('documentType só aceita valores válidos', () => {
  assert.doesNotThrow(() => createCustomerSchema.parse({ name: 'Joao', birthDate: '1990-01-01', documentType: 'RG' }));
  assert.throws(() => createCustomerSchema.parse({ name: 'Joao', birthDate: '1990-01-01', documentType: 'INVALIDO' as any }));
});

test('UPDATE NÃO exige nascimento (registros antigos editáveis)', () => {
  assert.doesNotThrow(() => updateCustomerSchema.parse({ name: 'Atualiza Sem Nascimento' }));
  assert.doesNotThrow(() => updateCustomerSchema.parse({ cellPhone: '31999999999' }));
});
