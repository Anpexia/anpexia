import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { email: 'pedro.henriques.moreira13@gmail.com' },
    select: { id: true, email: true, name: true, role: true, tenantId: true, passwordDefined: true, isActive: true, inviteToken: true, inviteTokenExpiresAt: true },
  });
  console.log(`Found ${users.length} user(s):`);
  console.log(JSON.stringify(users, null, 2));
}
main().finally(() => prisma.$disconnect());
