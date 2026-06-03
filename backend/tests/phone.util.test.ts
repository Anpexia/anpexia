import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPhone, isMobile, isLandline, isSuspectFakeNine,
  formatMobileForWhatsapp, getWhatsappPhone, toNational, isValidDDD,
  resolvePhones,
} from '../src/shared/utils/phone';

test('classifica celular válido (11 dígitos, 9º dígito)', () => {
  const c = classifyPhone('(31) 99999-9999');
  assert.equal(c.type, 'mobile');
  assert.equal(c.national, '31999999999');
  assert.ok(isMobile('31999999999'));
});

test('classifica fixo válido (10 dígitos, prefixo 2-5)', () => {
  const c = classifyPhone('(31) 3535-1234');
  assert.equal(c.type, 'landline');
  assert.equal(c.national, '3135351234');
  assert.ok(isLandline('3135351234'));
});

test('remove DDI 55 corretamente', () => {
  assert.equal(toNational('5531999999999'), '31999999999');
  assert.equal(toNational('553135351234'), '3135351234');
  assert.equal(toNational('31999999999'), '31999999999');
});

test('DDD inválido é rejeitado', () => {
  assert.equal(classifyPhone('(00) 99999-9999').type, 'invalid');
  assert.equal(classifyPhone('(00) 99999-9999').reason, 'invalid_ddd');
  assert.ok(!isValidDDD('00'));
});

test('celular sem o 9 é inválido (11 dígitos exigem 9º dígito)', () => {
  // 10 dígitos começando com 9 não é fixo nem celular padrão
  assert.equal(classifyPhone('(31) 8888-7777').type, 'invalid'); // prefixo 8 em 10 dígitos
});

test('curto e longo são inválidos', () => {
  assert.equal(classifyPhone('3199999').reason, 'too_short');
  assert.equal(classifyPhone('319999999999999').reason, 'too_long');
});

test('detecta provável "9 artificial" em fixo', () => {
  // (31) 3535-1234 com 9 inserido -> 31 9 3535123? Exemplo: 31 9 3535-1234 = 11 díg, 4º=3
  assert.ok(isSuspectFakeNine('31935351234'));
  // celular real não é suspeito (4º dígito 6-9)
  assert.ok(!isSuspectFakeNine('31998887777'));
});

test('formata celular para WhatsApp (13 dígitos, sem 9 artificial em fixo)', () => {
  assert.equal(formatMobileForWhatsapp('31999999999'), '5531999999999');
  assert.equal(formatMobileForWhatsapp('3135351234'), null); // fixo não vira whatsapp
});

test('getWhatsappPhone: celular preenchido -> ok', () => {
  const r = getWhatsappPhone({ cellPhone: '31999999999', landlinePhone: null });
  assert.equal(r.ok, true);
  assert.equal(r.phone, '5531999999999');
});

test('getWhatsappPhone: só fixo -> bloqueia com mensagem LANDLINE_ONLY', () => {
  const r = getWhatsappPhone({ cellPhone: null, landlinePhone: '3135351234' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'LANDLINE_ONLY');
  assert.match(r.message!, /apenas telefone fixo/i);
});

test('getWhatsappPhone: sem telefone -> bloqueia NO_CELL', () => {
  const r = getWhatsappPhone({ cellPhone: null, landlinePhone: null });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NO_CELL');
  assert.match(r.message!, /não possui telefone celular/i);
});

test('getWhatsappPhone: fallback legado usa phone se for celular', () => {
  const r = getWhatsappPhone({ phone: '5531999999999', cellPhone: null, landlinePhone: null });
  assert.equal(r.ok, true);
  assert.equal(r.phone, '5531999999999');
});

test('getWhatsappPhone: dependente usa celular do responsável', () => {
  const dep = {
    cellPhone: null,
    landlinePhone: '3135351234',
    usarTelResponsavel: true,
    responsavel: { cellPhone: '31988887777' },
  };
  const r = getWhatsappPhone(dep);
  assert.equal(r.ok, true);
  assert.equal(r.phone, '5531988887777');
});

test('getWhatsappPhone: dependente cujo responsável só tem fixo -> bloqueia', () => {
  const dep = {
    cellPhone: null,
    usarTelResponsavel: true,
    responsavel: { cellPhone: null, landlinePhone: '3135351234' },
  };
  const r = getWhatsappPhone(dep);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'LANDLINE_ONLY');
});

test('nunca injeta 9 em fixo (regressão do bug do "9")', () => {
  // Um fixo jamais deve produzir um número de WhatsApp.
  assert.equal(getWhatsappPhone({ cellPhone: null, landlinePhone: '3135351234' }).ok, false);
  assert.equal(formatMobileForWhatsapp('3135351234'), null);
});

// ---- resolvePhones (normalização de escrita) ----

test('resolvePhones: UI com celular e fixo -> ambos + phone espelha celular', () => {
  const r = resolvePhones({ cellPhone: '(31) 99999-9999', landlinePhone: '(31) 3535-1234' });
  assert.equal(r.cellPhone, '31999999999');
  assert.equal(r.landlinePhone, '3135351234');
  assert.equal(r.phone, '31999999999');
});

test('resolvePhones: só fixo -> phone fica null (espelho do celular)', () => {
  const r = resolvePhones({ landlinePhone: '3135351234' });
  assert.equal(r.cellPhone, null);
  assert.equal(r.landlinePhone, '3135351234');
  assert.equal(r.phone, null);
});

test('resolvePhones: legado só phone celular -> roteia p/ cellPhone', () => {
  const r = resolvePhones({ phone: '5531999999999' });
  assert.equal(r.cellPhone, '31999999999');
  assert.equal(r.landlinePhone, null);
  assert.equal(r.phone, '31999999999');
});

test('resolvePhones: legado só phone fixo -> roteia p/ landlinePhone', () => {
  const r = resolvePhones({ phone: '553135351234' });
  assert.equal(r.cellPhone, null);
  assert.equal(r.landlinePhone, '3135351234');
  assert.equal(r.phone, null);
});

test('resolvePhones: legado phone inválido -> preserva cru, nada perdido', () => {
  const r = resolvePhones({ phone: '319999' }); // curto demais
  assert.equal(r.cellPhone, null);
  assert.equal(r.landlinePhone, null);
  assert.equal(r.phone, '319999');
});

test('resolvePhones: celular inválido explícito lança erro', () => {
  assert.throws(() => resolvePhones({ cellPhone: '3133334444' })); // 10 díg não é celular
});

test('resolvePhones: update mantém campo ausente', () => {
  const r = resolvePhones({ cellPhone: '31988887777' }, { cellPhone: null, landlinePhone: '3135351234' });
  assert.equal(r.cellPhone, '31988887777');
  assert.equal(r.landlinePhone, '3135351234'); // preservado
});
