import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDocumentLimits, MAX_DOC_BYTES, MAX_PATIENT_DOC_BYTES } from '../src/modules/customers/documentLimits';

const MB = 1024 * 1024;

test('limites são 10 MB por arquivo e 50 MB por paciente', () => {
  assert.equal(MAX_DOC_BYTES, 10 * MB);
  assert.equal(MAX_PATIENT_DOC_BYTES, 50 * MB);
});

test('arquivo dentro do limite e paciente com espaço → ok (null)', () => {
  assert.equal(checkDocumentLimits(5 * MB, 10 * MB), null);
  assert.equal(checkDocumentLimits(10 * MB, 0), null); // exatamente 10 MB é permitido
  assert.equal(checkDocumentLimits(1, 50 * MB - 1), null); // cabe no limite exato
});

test('arquivo acima de 10 MB → DOCUMENT_TOO_LARGE (413)', () => {
  const err = checkDocumentLimits(10 * MB + 1, 0);
  assert.ok(err);
  assert.equal(err!.status, 413);
  assert.equal(err!.code, 'DOCUMENT_TOO_LARGE');
});

test('estoura 50 MB do paciente → PATIENT_STORAGE_LIMIT (413) com MB usados', () => {
  const err = checkDocumentLimits(5 * MB, 46 * MB); // 46+5 = 51 > 50
  assert.ok(err);
  assert.equal(err!.status, 413);
  assert.equal(err!.code, 'PATIENT_STORAGE_LIMIT');
  assert.match(err!.message, /46\.0 MB em uso/);
});

test('per-arquivo tem prioridade sobre o total (arquivo gigante em paciente vazio)', () => {
  const err = checkDocumentLimits(20 * MB, 0);
  assert.equal(err!.code, 'DOCUMENT_TOO_LARGE');
});

test('Buffer.byteLength(base64) reflete o tamanho real do arquivo (sanidade)', () => {
  // 9 bytes de dados -> base64 "MTIzNDU2Nzg5"
  const raw = Buffer.from('123456789');
  const b64 = raw.toString('base64');
  assert.equal(Buffer.byteLength(b64, 'base64'), 9);
});
