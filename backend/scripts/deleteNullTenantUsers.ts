import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const del = await prisma.user.deleteMany({ where: { tenantId: null, email: { not: 'anpexia@hotmail.com' } } });
  console.log('Deletados:', del.count);
  const remaining = await prisma.user.findMany({ where: { tenantId: null }, select: { id: true, email: true, role: true } });
  console.log('Restantes com tenantId=null:', JSON.stringify(remaining, null, 2));
}
main().finally(() => prisma.$disconnect());
