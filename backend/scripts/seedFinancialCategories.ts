import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedCategory = {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  subtype: null | 'FIXA' | 'VARIAVEL' | 'ADMINISTRATIVA';
};

const CATEGORIES: SeedCategory[] = [
  // INCOME
  { name: 'Consultas Particulares', type: 'INCOME', subtype: null },
  { name: 'Convênios', type: 'INCOME', subtype: null },
  { name: 'Procedimentos', type: 'INCOME', subtype: null },
  { name: 'Outros', type: 'INCOME', subtype: null },

  // EXPENSE - FIXA
  { name: 'Aluguel', type: 'EXPENSE', subtype: 'FIXA' },
  { name: 'Energia Elétrica', type: 'EXPENSE', subtype: 'FIXA' },
  { name: 'Água e Esgoto', type: 'EXPENSE', subtype: 'FIXA' },
  { name: 'Telefone/Internet', type: 'EXPENSE', subtype: 'FIXA' },
  { name: 'Folha de Pagamento', type: 'EXPENSE', subtype: 'FIXA' },
  { name: 'Pró-labore', type: 'EXPENSE', subtype: 'FIXA' },
  { name: 'Contabilidade', type: 'EXPENSE', subtype: 'FIXA' },
  { name: 'Seguro', type: 'EXPENSE', subtype: 'FIXA' },

  // EXPENSE - VARIAVEL
  { name: 'Materiais Médicos', type: 'EXPENSE', subtype: 'VARIAVEL' },
  { name: 'Medicamentos', type: 'EXPENSE', subtype: 'VARIAVEL' },
  { name: 'Manutenção de Equipamentos', type: 'EXPENSE', subtype: 'VARIAVEL' },
  { name: 'Marketing', type: 'EXPENSE', subtype: 'VARIAVEL' },
  { name: 'Material de Escritório', type: 'EXPENSE', subtype: 'VARIAVEL' },

  // EXPENSE - ADMINISTRATIVA
  { name: 'Impostos', type: 'EXPENSE', subtype: 'ADMINISTRATIVA' },
  { name: 'Taxas Bancárias', type: 'EXPENSE', subtype: 'ADMINISTRATIVA' },
  { name: 'Honorários Jurídicos', type: 'EXPENSE', subtype: 'ADMINISTRATIVA' },
  { name: 'Treinamentos e Cursos', type: 'EXPENSE', subtype: 'ADMINISTRATIVA' },
];

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Found ${tenants.length} tenants`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const tenant of tenants) {
    for (const cat of CATEGORIES) {
      const existing = await prisma.financialCategory.findUnique({
        where: { tenantId_name: { tenantId: tenant.id, name: cat.name } },
      });

      if (!existing) {
        await prisma.financialCategory.create({
          data: {
            tenantId: tenant.id,
            name: cat.name,
            type: cat.type,
            subtype: cat.subtype,
          },
        });
        createdCount++;
      } else if (existing.type !== cat.type || (existing as any).subtype !== cat.subtype) {
        await prisma.financialCategory.update({
          where: { id: existing.id },
          data: { type: cat.type, subtype: cat.subtype },
        });
        updatedCount++;
      }
    }
    console.log(`  Tenant ${tenant.name} (${tenant.id}) processed`);
  }

  console.log(`\nDone. Created: ${createdCount}, Updated: ${updatedCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
