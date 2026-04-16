import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: ['anpexia@hotmail.com', 'pedro.henriques.moreira13@gmail.com'] } },
    select: { id: true, email: true, name: true, role: true, tenantId: true, isActive: true, passwordDefined: true, twoFactorEnabled: true },
  });
  console.log(JSON.stringify(users, null, 2));
}
main().finally(() => prisma.$disconnect());
