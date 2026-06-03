/**
 * Script PREPARADO para ativar o UNIQUE parcial de CPF.
 * NÃO aplica nada por padrão. Só cria o índice com --apply E se NÃO houver
 * CPFs duplicados (que precisam ser resolvidos manualmente antes).
 *
 *   node scripts/prepare-cpf-unique.js            -> verifica prontidão (dry-run)
 *   node scripts/prepare-cpf-unique.js --apply    -> cria o UNIQUE (só se 0 duplicados)
 *
 * Índice alvo:
 *   CREATE UNIQUE INDEX customers_tenant_cpfhash_unique
 *     ON customers(tenant_id, cpf_hash) WHERE cpf_hash IS NOT NULL;
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

async function main() {
  const dups = await prisma.$queryRawUnsafe(`
    SELECT tenant_id, cpf_hash, count(*)::int AS n
    FROM customers WHERE cpf_hash IS NOT NULL
    GROUP BY tenant_id, cpf_hash HAVING count(*) > 1`);

  console.log(`CPFs duplicados (tenant_id, cpf_hash): ${dups.length} grupo(s).`);

  if (dups.length > 0) {
    console.log('\n❌ NÃO é seguro ativar o UNIQUE: existem duplicados.');
    console.log('   Resolva-os manualmente (ver scripts/report-cpf-detailed.ts) e rode novamente.');
    if (APPLY) console.log('   --apply IGNORADO por segurança.');
    return;
  }

  console.log('✅ Pronto para ativar o UNIQUE (0 duplicados).');
  if (!APPLY) {
    console.log('\n(dry-run) Rode com --apply para criar o índice único.');
    return;
  }

  console.log('Criando índice único parcial...');
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_cpfhash_unique
      ON customers(tenant_id, cpf_hash) WHERE cpf_hash IS NOT NULL;`);
  console.log('✅ UNIQUE parcial criado.');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('ERRO:', e.message); await prisma.$disconnect(); process.exit(1); });
