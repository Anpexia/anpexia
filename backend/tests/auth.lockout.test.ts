import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
  isLockActive,
  effectivePriorAttempts,
} from '../src/modules/auth/lockout';

const NOW = new Date('2026-07-02T16:00:00.000Z');
const future = (min: number) => new Date(NOW.getTime() + min * 60_000);
const past = (min: number) => new Date(NOW.getTime() - min * 60_000);

test('política mantém os limites de 5 tentativas / 15 minutos', () => {
  assert.equal(LOGIN_MAX_ATTEMPTS, 5);
  assert.equal(LOGIN_LOCKOUT_MINUTES, 15);
});

test('isLockActive: só bloqueia enquanto lockedUntil está no futuro', () => {
  assert.equal(isLockActive(future(10), NOW), true);   // ainda bloqueado
  assert.equal(isLockActive(past(1), NOW), false);      // expirou → liberado
  assert.equal(isLockActive(NOW, NOW), false);          // exatamente agora não conta como futuro
  assert.equal(isLockActive(null, NOW), false);
  assert.equal(isLockActive(undefined, NOW), false);
});

test('effectivePriorAttempts: conta acumula normalmente enquanto não há lock expirado', () => {
  assert.equal(effectivePriorAttempts(0, null, NOW), 0);
  assert.equal(effectivePriorAttempts(3, null, NOW), 3);
  assert.equal(effectivePriorAttempts(4, future(10), NOW), 4); // lock ainda ativo: mantém contador
});

test('effectivePriorAttempts: contador decai a zero após o lock expirar', () => {
  // Cenário do Pedro: 10 falhas acumuladas, lock já expirou → recomeça do zero.
  assert.equal(effectivePriorAttempts(10, past(1), NOW), 0);
  assert.equal(effectivePriorAttempts(5, past(30), NOW), 0);
});

test('fluxo completo: 5 erros bloqueiam, e após 15 min ganha 5 novas tentativas', () => {
  // Simula a mesma lógica do auth.service para a decisão de bloqueio.
  const decide = (failed: number, lockedUntil: Date | null, now: Date) => {
    if (isLockActive(lockedUntil, now)) return { blocked: true as const };
    const attempts = effectivePriorAttempts(failed, lockedUntil, now) + 1;
    const lockData: { failedLoginAttempts: number; lockedUntil: Date | null } = {
      failedLoginAttempts: attempts,
      lockedUntil: null,
    };
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      lockData.lockedUntil = new Date(now.getTime() + LOGIN_LOCKOUT_MINUTES * 60_000);
    }
    return { blocked: false as const, lockData };
  };

  // 4 erros: sem bloqueio, sem lock.
  let r = decide(3, null, NOW);
  assert.deepEqual(r, { blocked: false, lockData: { failedLoginAttempts: 4, lockedUntil: null } });

  // 5º erro: bloqueia por 15 min.
  r = decide(4, null, NOW);
  assert.equal(r.blocked, false);
  assert.equal(r.lockData!.failedLoginAttempts, 5);
  assert.deepEqual(r.lockData!.lockedUntil, future(15));

  // Enquanto bloqueado: nova tentativa é barrada.
  const lockedAt = future(15);
  assert.deepEqual(decide(5, lockedAt, future(5)), { blocked: true });

  // Passados os 15 min: contador zera, primeira falha vira attempt=1 (não re-bloqueia).
  const afterLock = future(16);
  const r2 = decide(5, lockedAt, afterLock);
  assert.equal(r2.blocked, false);
  assert.equal(r2.lockData!.failedLoginAttempts, 1);
  assert.equal(r2.lockData!.lockedUntil, null);
});
