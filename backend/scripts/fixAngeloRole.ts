import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'angelolarocca10@gmail.com' },
    select: { id: true, email: true, role: true, tenantId: true, name: true }
  });
  console.log('Antes:', JSON.stringify(user, null, 2));

  const updated = await prisma.user.update({
    where: { id: user!.id },
    data: { role: 'OWNER' }
  });
  console.log('Depois:', JSON.stringify({ id: updated.id, email: updated.email, role: updated.role, tenantId: updated.tenantId }, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
