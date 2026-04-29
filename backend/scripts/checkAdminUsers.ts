import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { tenantId: null },
    select: { id: true, email: true, name: true, role: true, isActive: true, passwordDefined: true }
  });
  console.log('Total:', users.length);
  console.log(JSON.stringify(users, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
