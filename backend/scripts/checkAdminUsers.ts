import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // All users with admin-panel roles
  const adminRoleUsers = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'GERENTE', 'VENDEDOR'] } },
    select: { id: true, email: true, name: true, role: true, tenantId: true, passwordDefined: true, isActive: true },
  });
  console.log('Admin-role users (ADMIN/GERENTE/VENDEDOR):');
  console.log(JSON.stringify(adminRoleUsers, null, 2));

  // Users with tenantId null (actual admin-panel users)
  const nullTenantUsers = await prisma.user.findMany({
    where: { tenantId: null },
    select: { id: true, email: true, name: true, role: true, tenantId: true, passwordDefined: true },
  });
  console.log('\nUsers with tenantId=null:');
  console.log(JSON.stringify(nullTenantUsers, null, 2));
}
main().finally(() => prisma.$disconnect());
