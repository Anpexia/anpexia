import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Delete the orphan ADMIN record with uppercase P
  console.log('1. Deletando registro ADMIN órfão (Pedro.henriques...)');
  const del = await prisma.user.deleteMany({
    where: { id: 'cmo1lah7b000vjx01ktu9tllw' },
  });
  console.log(`   removidos: ${del.count}`);

  console.log('Concluído. Para recriar o acesso admin do Pedro, usar o menu /admin/usuarios com email normalizado.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
