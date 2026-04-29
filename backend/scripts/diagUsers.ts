import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const nullUsers = await prisma.user.findMany({
    where: { tenantId: null },
    select: { id: true, email: true, name: true, role: true },
  });
  console.log(`tenantId=null (${nullUsers.length}):`);
  console.log(JSON.stringify(nullUsers, null, 2));

  const angelo = await prisma.user.findMany({
    where: { email: { contains: 'angelolarocca', mode: 'insensitive' } },
    select: { id: true, email: true, name: true, role: true, tenantId: true },
  });
  console.log(`\nangelolarocca10@gmail.com (${angelo.length}):`);
  console.log(JSON.stringify(angelo, null, 2));

  const anpexia = await prisma.user.findMany({
    where: { email: { contains: 'anpexia@hotmail', mode: 'insensitive' } },
    select: { id: true, email: true, name: true, role: true, tenantId: true },
  });
  console.log(`\nanpexia@hotmail.com (${anpexia.length}):`);
  console.log(JSON.stringify(anpexia, null, 2));
}
main().finally(() => prisma.$disconnect());
