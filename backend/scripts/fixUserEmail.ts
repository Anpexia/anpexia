import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('1. Deletando usuário angelolarocca10@gmail.com...');
  const del = await prisma.user.deleteMany({ where: { email: 'angelolarocca10@gmail.com' } });
  console.log(`   removidos: ${del.count}`);

  console.log('2. Atualizando ricardo@clinicasaudetotal.com.br → angelolarocca10@gmail.com...');
  const upd = await prisma.user.update({
    where: { email: 'ricardo@clinicasaudetotal.com.br' },
    data: { email: 'angelolarocca10@gmail.com' },
    select: { id: true, email: true, name: true, role: true, tenantId: true },
  });
  console.log('   atualizado:', upd);

  console.log('Concluído com sucesso');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
