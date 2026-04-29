import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ||
        'postgresql://neondb_owner:npg_yzo7gj2seuhY@ep-dry-bar-an7xc56l.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require',
    },
  },
});

async function main() {
  console.log('=== Fixing Anpexia Database ===\n');

  // 1. List current state
  const currentUsers = await prisma.user.findMany({
    select: { id: true, email: true, role: true, tenantId: true, isActive: true },
  });
  console.log('Current users:', currentUsers);

  const currentTenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, segment: true },
  });
  console.log('Current tenants:', currentTenants);

  // 2. Hash passwords
  const superAdminPassword = await bcrypt.hash('4nP3x1a0321@!', 12);
  const clinicaPassword = await bcrypt.hash('Clinica@2026', 12);

  // 3. Fix Angelo's user — make SUPER_ADMIN
  const angelo = await prisma.user.findFirst({ where: { email: 'angelolarocca10@gmail.com' } });
  if (angelo) {
    await prisma.user.update({
      where: { id: angelo.id },
      data: {
        role: 'SUPER_ADMIN',
        passwordHash: superAdminPassword,
        isActive: true,
        passwordDefined: true,
      },
    });
    console.log('\n✓ Angelo updated to SUPER_ADMIN with known password');
  }

  // 4. Check/create Anpexia Teste tenant
  let anpexiaTenant = await prisma.tenant.findFirst({ where: { slug: 'anpexia-teste' } });
  if (!anpexiaTenant) {
    anpexiaTenant = await prisma.tenant.create({
      data: {
        name: 'Anpexia Teste',
        slug: 'anpexia-teste',
        segment: 'OUTROS',
        email: 'anpexia@hotmail.com',
        isActive: true,
        plan: 'BUSINESS',
      },
    });
    console.log('✓ Tenant Anpexia Teste created:', anpexiaTenant.id);
  } else {
    console.log('✓ Tenant Anpexia Teste already exists:', anpexiaTenant.id);
  }

  // 5. Check/create super admin user (anpexia@hotmail.com)
  let superAdmin = await prisma.user.findFirst({ where: { email: 'anpexia@hotmail.com' } });
  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: {
        email: 'anpexia@hotmail.com',
        passwordHash: superAdminPassword,
        name: 'Angelo (Super Admin)',
        role: 'SUPER_ADMIN',
        tenantId: null,
        isActive: true,
        passwordDefined: true,
      },
    });
    console.log('✓ Super Admin anpexia@hotmail.com created:', superAdmin.id);
  } else {
    await prisma.user.update({
      where: { id: superAdmin.id },
      data: {
        role: 'SUPER_ADMIN',
        passwordHash: superAdminPassword,
        isActive: true,
        passwordDefined: true,
      },
    });
    console.log('✓ Super Admin anpexia@hotmail.com updated:', superAdmin.id);
  }

  // 6. Check/create Clinica Saude Total tenant
  let clinicaTenant = await prisma.tenant.findFirst({ where: { slug: 'clinica-saude-total' } });
  if (!clinicaTenant) {
    clinicaTenant = await prisma.tenant.create({
      data: {
        name: 'Clinica Saude Total',
        slug: 'clinica-saude-total',
        segment: 'CLINICA_OFTALMOLOGICA',
        email: 'ricardo@clinicasaudetotal.com.br',
        phone: '11999999999',
        isActive: true,
        plan: 'PRO',
      },
    });
    console.log('✓ Tenant Clinica Saude Total created:', clinicaTenant.id);
  } else {
    console.log('✓ Tenant Clinica Saude Total already exists:', clinicaTenant.id);
  }

  // 7. Check/create clinica OWNER user
  let clinicaOwner = await prisma.user.findFirst({
    where: { email: 'ricardo@clinicasaudetotal.com.br', tenantId: clinicaTenant.id },
  });
  if (!clinicaOwner) {
    clinicaOwner = await prisma.user.create({
      data: {
        email: 'ricardo@clinicasaudetotal.com.br',
        passwordHash: clinicaPassword,
        name: 'Ricardo (Owner Clinica)',
        role: 'OWNER',
        tenantId: clinicaTenant.id,
        isActive: true,
        passwordDefined: true,
      },
    });
    console.log('✓ Clinica Owner ricardo@ created:', clinicaOwner.id);
  } else {
    await prisma.user.update({
      where: { id: clinicaOwner.id },
      data: {
        passwordHash: clinicaPassword,
        role: 'OWNER',
        isActive: true,
        passwordDefined: true,
      },
    });
    console.log('✓ Clinica Owner ricardo@ updated:', clinicaOwner.id);
  }

  // 8. Create test patient (Maria Silva Teste)
  let patient = await prisma.customer.findFirst({
    where: { tenantId: clinicaTenant.id, name: 'Maria Silva Teste' },
  });
  if (!patient) {
    patient = await prisma.customer.create({
      data: {
        tenantId: clinicaTenant.id,
        name: 'Maria Silva Teste',
        phone: '11988887777',
        email: 'maria.teste@email.com',
      },
    });
    console.log('✓ Test patient Maria Silva Teste created:', patient.id);
  } else {
    console.log('✓ Test patient already exists:', patient.id);
  }

  // 9. Fix Accoral tenant — rename or keep as secondary test
  const accoralTenant = currentTenants.find((t) => t.name === 'Accoral Teste');
  if (accoralTenant) {
    // Update accoral user password too so it's accessible
    const accoralUser = await prisma.user.findFirst({ where: { email: 'accoral@hotmail.com' } });
    if (accoralUser) {
      await prisma.user.update({
        where: { id: accoralUser.id },
        data: { passwordHash: superAdminPassword },
      });
      console.log('✓ Accoral user password reset (same as super admin)');
    }
  }

  // 10. Cleanup: reset pedro's password too
  const pedro = await prisma.user.findFirst({ where: { email: 'pedro.henriques.moreira13@gmail.com' } });
  if (pedro) {
    await prisma.user.update({
      where: { id: pedro.id },
      data: { passwordHash: superAdminPassword, role: 'ADMIN' },
    });
    console.log('✓ Pedro password reset');
  }

  // Final state
  console.log('\n=== Final State ===');
  const finalUsers = await prisma.user.findMany({
    select: { id: true, email: true, role: true, tenantId: true, isActive: true, passwordDefined: true },
  });
  console.log('Users:', JSON.stringify(finalUsers, null, 2));

  const finalTenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, segment: true, isActive: true },
  });
  console.log('Tenants:', JSON.stringify(finalTenants, null, 2));

  console.log('\n=== Login Credentials ===');
  console.log('Admin Panel (admin.anpexia.com.br):');
  console.log('  anpexia@hotmail.com / 4nP3x1a0321@!');
  console.log('  angelolarocca10@gmail.com / 4nP3x1a0321@!');
  console.log('App (app.anpexia.com.br):');
  console.log('  ricardo@clinicasaudetotal.com.br / Clinica@2026');
  console.log('  accoral@hotmail.com / 4nP3x1a0321@!');
}

main()
  .catch((e) => {
    console.error('ERROR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
