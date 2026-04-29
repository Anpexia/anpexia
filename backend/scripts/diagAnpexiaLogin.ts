import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'anpexia@hotmail.com' },
    select: { id: true, email: true, role: true, tenantId: true, passwordDefined: true, isActive: true, passwordHash: true }
  });
  if (!user) { console.log('USUÁRIO NÃO ENCONTRADO'); return; }
  console.log('id:', user.id);
  console.log('email:', user.email);
  console.log('role:', user.role);
  console.log('tenantId:', user.tenantId);
  console.log('passwordDefined:', user.passwordDefined);
  console.log('isActive:', user.isActive);
  console.log('passwordHash starts with $2:', user.passwordHash?.startsWith('$2'));
  console.log('passwordHash length:', user.passwordHash?.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
