// Account lockout policy (pure logic, no I/O — safe to unit test in isolation).
//
// Rule: 5 failed login attempts → 15 min lock. After the lock expires, the
// failed-attempt counter decays back to zero, so the user gets a fresh set of
// 5 attempts once the 15 minutes have passed (instead of every later wrong
// attempt re-locking the account forever).

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

// True only while a lockout is still in effect (lockedUntil in the future).
export function isLockActive(lockedUntil: Date | null | undefined, now: Date): boolean {
  return !!lockedUntil && lockedUntil > now;
}

// The failed-attempt counter to build on. Once a lockout has expired, the
// counter decays back to zero.
export function effectivePriorAttempts(
  failedLoginAttempts: number | null | undefined,
  lockedUntil: Date | null | undefined,
  now: Date,
): number {
  const lockExpired = !!lockedUntil && lockedUntil <= now;
  return lockExpired ? 0 : (failedLoginAttempts || 0);
}
