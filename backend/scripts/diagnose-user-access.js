// Diagnostico SOMENTE LEITURA de acesso de usuario (User <-> Tenant <-> Admin).
// NAO altera nada. NUNCA imprime password_hash.
// Uso:
//   node scripts/diagnose-user-access.js                 -> varredura agregada
//   node scripts/diagnose-user-access.js email@dominio   -> diagnostico de 1 email
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// PrismaClient direto (sem o $extends do projeto) — leitura pura, sem isolamento/cripto.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnoseEmail(email) {
  const rows = await prisma.user.findMany({
    where: { email },
    select: {
      id: true, email: true, tenantId: true, role: true, isActive: true,
      passwordDefined: true, lockedUntil: true, failedLoginAttempts: true, createdAt: true,
      tenant: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n=== Linhas para "${email}": ${rows.length} ===`);
  for (const r of rows) {
    console.log({
      id: r.id,
      tenantId: r.tenantId,
      tenant: r.tenantId === null ? 'NULL (Admin)' : (r.tenant?.name || '(tenant nao encontrado)'),
      role: r.role,
      isActive: r.isActive,
      passwordDefined: r.passwordDefined,
      lockedUntil: r.lockedUntil,
      failedLoginAttempts: r.failedLoginAttempts,
      createdAt: r.createdAt,
    });
  }

  const adminNull = rows.filter(r => r.tenantId === null);
  const superInClinic = rows.filter(r => r.role === 'SUPER_ADMIN' && r.tenantId !== null);
  const adminMatch = rows.filter(r => r.isActive && (r.tenantId === null || r.role === 'SUPER_ADMIN'));

  console.log('\n--- Diagnostico ---');
  console.log('Linha Admin propria (tenantId=null):', adminNull.length, adminNull.map(r => `${r.role}/active=${r.isActive}`));
  console.log('SUPER_ADMIN dentro de clinica (tenantId!=null):', superInClinic.length, superInClinic.map(r => `${r.tenant?.name}/active=${r.isActive}`));
  console.log('Linhas que o LOGIN ADMIN casaria agora (OR tenantId=null | SUPER_ADMIN, isActive):', adminMatch.length);
  if (adminMatch.length === 0) console.log('  >> HIPOTESE A CONFIRMADA: nenhuma linha casa o login admin -> "email/senha invalidos".');
  if (adminMatch.length > 1) console.log('  >> HIPOTESE B (ambiguidade): findFirst sem orderBy escolhe 1 entre', adminMatch.length, 'linhas, cada uma com SUA senha.');
  if (adminMatch.length === 1) console.log('  >> Login admin determinístico (1 linha). Se falha, investigar senha/lockout dessa linha especifica.');
  const locked = rows.filter(r => r.lockedUntil && new Date(r.lockedUntil) > new Date());
  if (locked.length) console.log('  >> ATENCAO: ha linha(s) com lockedUntil no futuro (conta bloqueada por tentativas):', locked.map(r => r.tenantId || 'ADMIN'));

  // --- Trilha de auditoria de LOGIN (read-only) ---
  const byId = {};
  for (const r of rows) byId[r.id] = r.tenantId === null ? 'ADMIN(null)' : (r.tenant?.name || r.tenantId);
  const logs = await prisma.auditLog.findMany({
    where: { userEmail: email, action: 'LOGIN' },
    select: { createdAt: true, ip: true, ipAddress: true, entityId: true, userId: true, tenantId: true, metadata: true },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  console.log(`\n=== AuditLog LOGIN para "${email}": ${logs.length} eventos (mais recentes primeiro) ===`);
  if (logs.length === 0) console.log('  (nenhum evento de LOGIN registrado para esse email)');
  for (const l of logs) {
    const m = l.metadata || {};
    const alvo = byId[l.entityId] || byId[l.userId] || (l.tenantId === null ? 'ADMIN(null)?' : l.tenantId || '?');
    console.log(`${new Date(l.createdAt).toISOString()} | ip=${l.ipAddress || l.ip || '-'} | alvo=${alvo} | detail=${m.detail || m.result || m.reason || '-'} | attempt=${m.attempt ?? '-'}`);
  }
}

async function aggregate() {
  const all = await prisma.user.findMany({
    select: { email: true, tenantId: true, role: true, isActive: true },
  });

  const byEmail = {};
  for (const u of all) { (byEmail[u.email] = byEmail[u.email] || []).push(u); }
  const dups = Object.entries(byEmail).filter(([, rows]) => rows.length > 1);

  console.log(`\n=== Total de usuarios (linhas): ${all.length} | emails distintos: ${Object.keys(byEmail).length} ===`);
  console.log(`\n=== Emails com MULTIPLAS linhas: ${dups.length} ===`);
  for (const [email, rows] of dups) {
    const tenants = rows.map(r => r.tenantId === null ? 'NULL/Admin' : r.tenantId.slice(0, 8)).join(', ');
    const roles = rows.map(r => r.role).join(', ');
    console.log(`- ${email} | ${rows.length} linhas | roles=[${roles}] | tenants=[${tenants}]`);
  }

  const superInClinic = all.filter(u => u.role === 'SUPER_ADMIN' && u.tenantId !== null);
  console.log(`\n=== SUPER_ADMIN com tenantId != null (acesso admin "pendurado" numa clinica): ${superInClinic.length} ===`);
  for (const u of superInClinic) console.log(`- ${u.email} | tenant=${u.tenantId} | active=${u.isActive}`);
  if (superInClinic.length === 0) console.log('  (nenhum — hipotese A nao se aplica a NENHUM usuario hoje)');

  const adminRows = all.filter(u => u.tenantId === null);
  const adminRoles = [...new Set(adminRows.map(r => r.role))];
  console.log(`\n=== Linhas Admin (tenantId=null): ${adminRows.length} | roles: [${adminRoles.join(', ')}] ===`);
}

async function auditHealth() {
  const total = await prisma.auditLog.count();
  console.log(`=== Total de audit_logs: ${total} ===`);
  const latest = await prisma.auditLog.findMany({
    select: { createdAt: true, action: true, entity: true, userEmail: true, ipAddress: true },
    orderBy: { createdAt: 'desc' }, take: 12,
  });
  console.log('\n=== Ultimos 12 audit_logs (QUALQUER usuario/acao) ===');
  for (const l of latest) console.log(`${new Date(l.createdAt).toISOString()} | ${l.action} | ${l.entity} | ${l.userEmail || '-'} | ip=${l.ipAddress || '-'}`);

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const recent = await prisma.auditLog.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });
  const byDay = {};
  for (const r of recent) { const d = new Date(r.createdAt).toISOString().slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; }
  console.log('\n=== audit_logs por dia (ultimos 30 dias) ===');
  const days = Object.keys(byDay).sort();
  if (days.length === 0) console.log('  (nenhum audit_log nos ultimos 30 dias!)');
  for (const d of days) console.log(`${d}: ${byDay[d]}`);

  const nowIso = new Date().toISOString();
  console.log(`\n(agora = ${nowIso})`);

  // RefreshToken / sessao: ha sessao recente desse admin? (read-only)
  const adminLogins09 = await prisma.auditLog.count({ where: { action: 'LOGIN', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } });
  console.log(`Eventos LOGIN nas ultimas 24h (qualquer usuario): ${adminLogins09}`);
}

async function loginsToday() {
  const start = new Date(Date.now() - 30 * 3600 * 1000); // ~ ultimas 30h
  const logins = await prisma.auditLog.findMany({
    where: { action: 'LOGIN', createdAt: { gte: start } },
    select: { createdAt: true, userEmail: true, ipAddress: true, entityId: true, tenantId: true, metadata: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`=== Eventos LOGIN nas ultimas ~30h: ${logins.length} ===`);
  for (const l of logins) {
    const m = l.metadata || {};
    console.log(`${new Date(l.createdAt).toISOString()} | ${l.userEmail || '-'} | ip=${l.ipAddress || '-'} | detail=${m.detail || m.result || m.reason || '-'} | attempt=${m.attempt ?? '-'} | entityId=${l.entityId || '-'}`);
  }
  const wrong = logins.filter(l => (l.metadata || {}).detail === 'wrong_password');
  console.log(`\n>> wrong_password nas ultimas ~30h: ${wrong.length}`);
  const pedro = logins.filter(l => (l.userEmail || '').includes('pedro.henriques'));
  console.log(`>> eventos do Pedro nas ultimas ~30h: ${pedro.length}`);
}

async function main() {
  const arg = (process.argv[2] || '').trim();
  if (arg.toLowerCase() === 'logins-today') await loginsToday();
  else if (arg.toLowerCase() === 'audit') await auditHealth();
  else if (arg) await diagnoseEmail(arg.toLowerCase());
  else await aggregate();
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('ERRO:', e.message); await prisma.$disconnect(); process.exit(1); });
