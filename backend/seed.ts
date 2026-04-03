import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Anpexia database...');

  // 1. Create test tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'anpexia-teste' },
    update: {},
    create: {
      name: 'Anpexia Teste',
      slug: 'anpexia-teste',
      segment: 'tecnologia',
      phone: '5500000000000',
      email: 'teste@anpexia.com',
      isActive: true,
    },
  });
  console.log('Tenant created:', tenant.id);

  // 2. Create SUPER_ADMIN user
  const hashedPassword = await bcrypt.hash('4nP3x1a0321@!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'anpexia@hotmail.com' },
    update: {},
    create: {
      name: 'Anpexia Admin',
      email: 'anpexia@hotmail.com',
      passwordHash: hashedPassword,
      role: 'SUPER_ADMIN',
      tenantId: tenant.id,
      isActive: true,
    },
  });
  console.log('SUPER_ADMIN created:', admin.email);

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
