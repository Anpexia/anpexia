import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const nullUsers = await prisma.user.findMany({
    where: { tenantId: null },
    select: { id: true, email: true, name: true, role: true, passwordDefined: true, isActive: true, inviteToken: true }
  });
  console.log('TODOS COM tenantId NULL:', JSON.stringify(nullUsers, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
