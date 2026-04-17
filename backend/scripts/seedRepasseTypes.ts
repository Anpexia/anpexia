import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_TYPES = ['CONSULTA', 'EXAME', 'CIRURGIA', 'TERAPIA', 'OUTROS'];

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Found ${tenants.length} tenants`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const tenant of tenants) {
    for (const name of DEFAULT_TYPES) {
      const result = await prisma.repasseType.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name } },
        update: { isDefault: true },
        create: { tenantId: tenant.id, name, isDefault: true },
      });
      if (result.createdAt.getTime() > Date.now() - 5000) {
        createdCount++;
      } else {
        updatedCount++;
      }
    }
    console.log(`  Tenant ${tenant.name} (${tenant.id}) processed`);
  }

  console.log(`\nDone. Tenants: ${tenants.length}, Created: ${createdCount}, Updated/Kept: ${updatedCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
