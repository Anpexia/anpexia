import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConnectionError, withConnectionRetry } from '../src/shared/utils/dbErrors';

const noSleep = async () => {};

function errWith(props: { message?: string; name?: string; code?: string }): Error {
  const e = new Error(props.message || 'x');
  if (props.name) e.name = props.name;
  if (props.code) (e as any).code = props.code;
  return e;
}

test('banco indisponível (can\'t reach / P1001) é erro de conexão', () => {
  assert.equal(isConnectionError(errWith({ message: "Can't reach database server at neon" })), true);
  assert.equal(isConnectionError(errWith({ code: 'P1001', message: 'unreachable' })), true);
  assert.equal(isConnectionError(errWith({ name: 'PrismaClientInitializationError', message: 'init' })), true);
});

test('timeout / pool timeout (P2024) é erro de conexão', () => {
  assert.equal(isConnectionError(errWith({ message: 'connection ETIMEDOUT' })), true);
  assert.equal(isConnectionError(errWith({ code: 'P2024', message: 'Timed out fetching a new connection from the connection pool' })), true);
});

test('queda de conexão (ECONNRESET / connection terminated / prepared statement)', () => {
  assert.equal(isConnectionError(errWith({ message: 'read ECONNRESET' })), true);
  assert.equal(isConnectionError(errWith({ message: 'Connection terminated unexpectedly' })), true);
  assert.equal(isConnectionError(errWith({ message: 'prepared statement "s0" does not exist' })), true);
  assert.equal(isConnectionError(errWith({ message: 'server closed the connection unexpectedly' })), true);
});

test('erro comum NÃO é tratado como conexão (não deve dar retry infinito)', () => {
  assert.equal(isConnectionError(errWith({ message: 'invalid input' })), false);
  assert.equal(isConnectionError(errWith({ code: 'P2002', message: 'unique constraint' })), false);
  assert.equal(isConnectionError('string qualquer' as any), false);
});

test('withConnectionRetry: banco lento/queda — falha 2x e recupera na 3ª', async () => {
  let calls = 0;
  const result = await withConnectionRetry(async () => {
    calls++;
    if (calls < 3) throw errWith({ message: 'connection ETIMEDOUT' });
    return 'ok';
  }, { delays: [0, 0, 0], sleep: noSleep });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('withConnectionRetry: banco indisponível persistente — esgota tentativas e lança', async () => {
  let calls = 0;
  await assert.rejects(
    () => withConnectionRetry(async () => { calls++; throw errWith({ code: 'P1001', message: "can't reach database" }); }, { delays: [0, 0], sleep: noSleep }),
    /reach database/,
  );
  assert.equal(calls, 3); // 1 + 2 retries
});

test('withConnectionRetry: erro NÃO de conexão sobe imediatamente (sem retry)', async () => {
  let calls = 0;
  await assert.rejects(
    () => withConnectionRetry(async () => { calls++; throw errWith({ message: 'senha incorreta' }); }, { delays: [0, 0], sleep: noSleep }),
    /senha incorreta/,
  );
  assert.equal(calls, 1);
});
