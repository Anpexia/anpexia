import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const indexes = await prisma.$queryRaw`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'users' AND indexdef ILIKE '%email%'
  `;
  console.log(JSON.stringify(indexes, null, 2));
}
main().finally(() => prisma.$disconnect());
