import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Mostrar todos os SUPER_ADMIN antes
  const superAdmins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true, role: true, tenantId: true }
  });
  console.log('SUPER_ADMINS encontrados:', JSON.stringify(superAdmins, null, 2));

  // Rebaixar todos para OWNER exceto anpexia@hotmail.com
  const updated = await prisma.user.updateMany({
    where: {
      role: 'SUPER_ADMIN',
      NOT: { email: 'anpexia@hotmail.com' }
    },
    data: { role: 'OWNER' }
  });
  console.log('Registros atualizados:', updated.count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
