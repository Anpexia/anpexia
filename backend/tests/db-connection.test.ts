import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { isConnectionError } from '../src/config/database';

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
