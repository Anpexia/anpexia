import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { tenantId: null },
    select: { id: true, email: true, name: true, role: true },
  });
  console.log(`Total: ${users.length}`);
  console.log(JSON.stringify(users, null, 2));
}
main().finally(() => prisma.$disconnect());
