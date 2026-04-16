import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: ['ricardo@clinicasaudetotal.com.br', 'angelolarocca10@gmail.com', 'anpexia@hotmail.com'] } },
    select: { id: true, email: true, name: true, role: true, tenantId: true },
  });
  console.log(JSON.stringify(users, null, 2));
}
main().finally(() => prisma.$disconnect());
