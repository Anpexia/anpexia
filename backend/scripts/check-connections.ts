import prisma from '../src/config/database';

async function count(): Promise<number> {
  const r = (await prisma.$queryRawUnsafe(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()",
  )) as Array<{ n: number }>;
  return r[0].n;
}

(async () => {
  const base = await count();
  // Rajada de 20 queries concorrentes (cada uma segura 0.3s).
  const burst = Promise.all(Array.from({ length: 20 }, () => prisma.$queryRawUnsafe("SELECT pg_sleep(0.3)::text AS x")));
  await new Promise((r) => setTimeout(r, 150));
  const during = await count();
  await burst;
  const after = await count();
  console.log(`conexoes ativas -> base: ${base} | durante rajada(20 concorrentes): ${during} | depois: ${after}`);
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
