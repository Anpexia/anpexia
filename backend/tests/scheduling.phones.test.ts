import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppointmentPhones, fillEmptyCustomerPhones } from '../src/modules/scheduling/scheduling.phones';

// Números de exemplo (com máscara — deve ser removida na normalização).
const CELL_MASKED = '(11) 98765-4321';
const CELL_NAT = '11987654321';
const LAND_MASKED = '(11) 3456-7890';
const LAND_NAT = '1134567890';

test('agendamento só com WhatsApp/celular → grava cellPhone, snapshot = celular', () => {
  const { resolved, snapshot } = resolveAppointmentPhones({ cellPhone: CELL_MASKED });
  assert.equal(resolved.cellPhone, CELL_NAT);
  assert.equal(resolved.landlinePhone, null);
  assert.equal(resolved.phone, CELL_NAT); // legado espelha o celular
  assert.equal(snapshot, CELL_NAT);
});

test('agendamento só com telefone fixo → grava landlinePhone, snapshot = fixo, phone legado null', () => {
  const { resolved, snapshot } = resolveAppointmentPhones({ landlinePhone: LAND_MASKED });
  assert.equal(resolved.cellPhone, null);
  assert.equal(resolved.landlinePhone, LAND_NAT);
  assert.equal(resolved.phone, null);
  assert.equal(snapshot, LAND_NAT);
});

test('agendamento com os dois → grava ambos, snapshot = celular', () => {
  const { resolved, snapshot } = resolveAppointmentPhones({ cellPhone: CELL_MASKED, landlinePhone: LAND_MASKED });
  assert.equal(resolved.cellPhone, CELL_NAT);
  assert.equal(resolved.landlinePhone, LAND_NAT);
  assert.equal(snapshot, CELL_NAT);
});

test('chatbot: phone legado (celular) é roteado para cellPhone', () => {
  const { resolved, snapshot } = resolveAppointmentPhones({ phone: '5511987654321' }); // com DDI 55
  assert.equal(resolved.cellPhone, CELL_NAT);
  assert.equal(snapshot, CELL_NAT);
});

test('phone legado (fixo) é roteado para landlinePhone', () => {
  const { resolved, snapshot } = resolveAppointmentPhones({ phone: LAND_MASKED });
  assert.equal(resolved.landlinePhone, LAND_NAT);
  assert.equal(snapshot, LAND_NAT);
});

test('celular inválido lança erro (mesma validação do cadastro)', () => {
  assert.throws(() => resolveAppointmentPhones({ cellPhone: '(11) 3456-7890' }), /INVALID_CELLPHONE|celular/i);
});

test('fixo inválido lança erro', () => {
  assert.throws(() => resolveAppointmentPhones({ landlinePhone: '(11) 98765-4321' }), /INVALID_LANDLINE|fixo/i);
});

// --- fillEmptyCustomerPhones: só preenche vazio, nunca sobrescreve ---

test('paciente existente SEM telefone recebe o celular (+ phone legado)', () => {
  const resolved = { cellPhone: CELL_NAT, landlinePhone: null };
  const patch = fillEmptyCustomerPhones(resolved, { cellPhone: null, landlinePhone: null, phone: null });
  assert.deepEqual(patch, { cellPhone: CELL_NAT, phone: CELL_NAT });
});

test('paciente existente SEM fixo recebe o fixo (sem tocar no phone legado)', () => {
  const resolved = { cellPhone: null, landlinePhone: LAND_NAT };
  const patch = fillEmptyCustomerPhones(resolved, { cellPhone: null, landlinePhone: null, phone: null });
  assert.deepEqual(patch, { landlinePhone: LAND_NAT });
});

test('paciente existente que JÁ tem celular não é sobrescrito', () => {
  const resolved = { cellPhone: CELL_NAT, landlinePhone: null };
  const patch = fillEmptyCustomerPhones(resolved, { cellPhone: '11999998888', landlinePhone: null, phone: '11999998888' });
  assert.deepEqual(patch, {}); // nada a alterar
});

test('paciente existente que JÁ tem fixo não é sobrescrito, mas ganha celular vazio', () => {
  const resolved = { cellPhone: CELL_NAT, landlinePhone: LAND_NAT };
  const patch = fillEmptyCustomerPhones(resolved, { cellPhone: null, landlinePhone: '1122223333', phone: null });
  // preenche celular (vazio) + phone legado; NÃO toca no fixo já cadastrado
  assert.deepEqual(patch, { cellPhone: CELL_NAT, phone: CELL_NAT });
});
