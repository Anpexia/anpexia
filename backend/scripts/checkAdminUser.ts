import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  const u = await prisma.user.findUnique({
    where: { email: 'anpexia@hotmail.com' },
    select: { id: true, email: true, name: true, role: true, tenantId: true, isActive: true, passwordDefined: true, twoFactorEnabled: true },
  });
  console.log(JSON.stringify(u, null, 2));
}
main().finally(() => prisma.$disconnect());
