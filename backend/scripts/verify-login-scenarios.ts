/**
 * Verificação dos cenários de login contra o banco real, com usuário
 * descartável e LIMPEZA total no final (não toca em usuários reais).
 *
 * Cobre: usuário inexistente (401), senha incorreta (401), login correto
 * (token + JWT válido). Os cenários de banco indisponível/lento/timeout/JWT
 * estão cobertos pelos testes unitários (db-connection, error-handler).
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import { authService } from '../src/modules/auth/auth.service';
import { AppError } from '../src/shared/middleware/error-handler';

const TEST_EMAIL = '__login_scenarios_test__@anpexia.test';
const PASSWORD = 'CorretaSenha#2026';

function ok(c: any, m: string) { if (!c) throw new Error('FALHOU: ' + m); console.log('  ✓ ' + m); }

async function cleanup(userId?: string) {
  if (userId) {
    await prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId } }).catch(() => {});
  }
  await prisma.auditLog.deleteMany({ where: { userEmail: TEST_EMAIL } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } }).catch(() => {});
}

async function main() {
  await cleanup(); // idempotência

  // 1) Usuário inexistente -> 401
  let notFound = false;
  try { await authService.login(TEST_EMAIL, 'qualquer', undefined, '0.0.0.0', 'app'); }
  catch (e: any) { notFound = e instanceof AppError && e.statusCode === 401 && e.code === 'INVALID_CREDENTIALS'; }
  ok(notFound, 'usuário inexistente -> 401 INVALID_CREDENTIALS');

  // Cria usuário descartável
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error('sem tenant para o teste');
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL, name: 'Login Test', passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: 'OWNER', tenantId: tenant.id, isActive: true, passwordDefined: true, twoFactorEnabled: false,
    },
    select: { id: true },
  });

  try {
    // 2) Senha incorreta -> 401
    let wrong = false;
    try { await authService.login(TEST_EMAIL, 'ERRADA', undefined, '0.0.0.0', 'app'); }
    catch (e: any) { wrong = e instanceof AppError && e.statusCode === 401; }
    ok(wrong, 'senha incorreta -> 401');

    // 3) Login correto -> token + JWT válido
    const res = await authService.login(TEST_EMAIL, PASSWORD, undefined, '0.0.0.0', 'app');
    ok(!!res.accessToken && !!res.refreshToken, 'login correto retorna accessToken e refreshToken');
    const decoded: any = jwt.verify(res.accessToken, env.jwtSecret);
    ok(decoded.userId === user.id && decoded.email === TEST_EMAIL, 'JWT assinado corretamente (userId/email)');
  } finally {
    await cleanup(user.id);
    console.log('  ✓ limpeza: usuário de teste e dados removidos');
  }

  console.log('\nCENÁRIOS DE LOGIN OK ✅');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('\nFALHOU ❌\n', e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
