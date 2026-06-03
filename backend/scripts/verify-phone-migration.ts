import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

(async () => {
  const total = await db.customer.count();
  const withCell = await db.customer.count({ where: { cellPhone: { not: null } } });
  const withLand = await db.customer.count({ where: { landlinePhone: { not: null } } });
  const withPhone = await db.customer.count({ where: { phone: { not: null } } });
  const reviews = await db.phoneReviewItem.count({ where: { resolved: false } });
  // Ninguém perdeu telefone: quem tinha phone continua com phone OU foi para cell/land OU revisão.
  const lostPhone = await db.customer.count({ where: { AND: [{ phone: null }, { cellPhone: null }, { landlinePhone: null }] } });

  console.log('Total customers:', total);
  console.log('com cellPhone:   ', withCell, '(esperado 374)');
  console.log('com landlinePhone:', withLand, '(esperado 91)');
  console.log('com phone (legado intacto):', withPhone);
  console.log('itens na fila de revisão:', reviews, '(esperado ~35 = 30 fora do padrão + 5 suspeitos)');
  console.log('sem nenhum telefone (esperado 10 sem tel):', lostPhone);

  // Amostra de revisão (relatório admin)
  const sample = await db.phoneReviewItem.findMany({ where: { resolved: false }, take: 4, select: { customerName: true, originalPhone: true, reason: true } });
  console.log('Amostra da fila de revisão:');
  for (const s of sample) console.log(`   - ${s.customerName} | ${s.originalPhone} | ${s.reason}`);

  await db.$disconnect(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
