/**
 * Migração dos telefones existentes para cellPhone/landlinePhone.
 *
 * - 11 dígitos (celular)  -> cellPhone
 * - 10 dígitos (fixo)     -> landlinePhone
 * - phone NUNCA é alterado (nada perdido; "não apagar o campo antigo").
 * - Fora do padrão (curto/longo/DDD inválido) e suspeitos de "9 artificial"
 *   vão para a fila de revisão (phone_review_items).
 * - Idempotente: só processa quem ainda não tem cellPhone nem landlinePhone.
 *
 * Uso:
 *   npx tsx scripts/migrate-phones-data.ts          (dry-run)
 *   npx tsx scripts/migrate-phones-data.ts --apply  (aplica)
 */
import { PrismaClient } from '@prisma/client';
import { isSuspectFakeNine, toNational } from '../src/shared/utils/phone';

const db = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function addReview(tenantId: string, customerId: string, name: string, phone: string | null, reason: string) {
  if (!APPLY) return;
  const exists = await db.phoneReviewItem.findFirst({ where: { customerId, resolved: false } });
  if (exists) return; // não duplica
  await db.phoneReviewItem.create({ data: { tenantId, customerId, customerName: name, originalPhone: phone, reason } });
}

async function main() {
  const customers = await db.customer.findMany({
    select: { id: true, tenantId: true, name: true, phone: true, cellPhone: true, landlinePhone: true, usarTelResponsavel: true, responsavelId: true },
  });

  const stats = { total: customers.length, mobile: 0, landline: 0, suspect: 0, review: 0, empty: 0, deps: 0, skipped: 0 };

  for (const c of customers) {
    if (c.usarTelResponsavel || c.responsavelId) stats.deps++;

    // Idempotência: já migrado.
    if (c.cellPhone || c.landlinePhone) { stats.skipped++; continue; }

    const phone = (c.phone || '').trim();
    if (!phone) { stats.empty++; continue; }

    // Regra (conforme especificação): roteamento por COMPRIMENTO do número nacional.
    const national = toNational(phone);

    if (national.length === 11) {
      if (APPLY) await db.customer.update({ where: { id: c.id }, data: { cellPhone: national } });
      stats.mobile++;
      // Suspeito de "9 artificial": migra como celular, mas sinaliza para revisão.
      if (isSuspectFakeNine(phone)) {
        stats.suspect++;
        await addReview(c.tenantId, c.id, c.name, phone, 'Possível "9" inserido manualmente (11 dígitos com cara de fixo)');
      }
    } else if (national.length === 10) {
      if (APPLY) await db.customer.update({ where: { id: c.id }, data: { landlinePhone: national } });
      stats.landline++;
    } else {
      stats.review++;
      await addReview(c.tenantId, c.id, c.name, phone, national.length < 10 ? 'Menos de 10 dígitos' : 'Mais de 11 dígitos');
    }
  }

  console.log(`Total: ${stats.total}`);
  console.log(`  Celulares migrados (cellPhone):   ${stats.mobile}`);
  console.log(`  Fixos migrados (landlinePhone):   ${stats.landline}`);
  console.log(`  Sem telefone:                     ${stats.empty}`);
  console.log(`  Dependentes (usam responsável):   ${stats.deps}`);
  console.log(`  Suspeitos "9 artificial" (revisão): ${stats.suspect}`);
  console.log(`  Fora do padrão (fila de revisão):  ${stats.review}`);
  console.log(`  Já migrados (pulados):            ${stats.skipped}`);
  if (!APPLY) console.log('\n(dry-run) Rode com --apply para aplicar.');
}

main()
  .then(async () => { await db.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('Migração FALHOU:', e); await db.$disconnect(); process.exit(1); });
