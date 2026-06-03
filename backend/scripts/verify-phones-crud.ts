/**
 * Verificação de integração (CRUD de telefones) contra o banco real.
 * Cria pacientes de teste, valida e LIMPA tudo no final.
 */
import prisma from '../src/config/database';
import { tenantStore } from '../src/shared/middleware/tenantContext';
import { customerService } from '../src/modules/customers/customer.service';
import { getWhatsappPhone } from '../src/shared/utils/phone';

function ok(cond: any, msg: string) { if (!cond) throw new Error('FALHOU: ' + msg); console.log('  ✓ ' + msg); }

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) throw new Error('sem tenant');
  const ids: string[] = [];

  await tenantStore.run({ tenantId: tenant.id } as any, async () => {
    // Teste 1: só celular
    const a = await customerService.create(tenant.id, { name: '[T] Só Celular', cellPhone: '(31) 90000-0001' } as any);
    ids.push(a.id);
    ok(a.cellPhone === '31900000001' && !a.landlinePhone && a.phone === '31900000001', 'só celular: cellPhone setado, phone espelha, sem fixo');

    // Teste 2: só fixo
    const b = await customerService.create(tenant.id, { name: '[T] Só Fixo', landlinePhone: '(31) 3300-0002' } as any);
    ids.push(b.id);
    ok(!b.cellPhone && b.landlinePhone === '3133000002' && !b.phone, 'só fixo: landline setado, sem cellPhone, phone null (espelho)');

    // Teste 3: ambos
    const c = await customerService.create(tenant.id, { name: '[T] Ambos', cellPhone: '31900000003', landlinePhone: '3133000003' } as any);
    ids.push(c.id);
    ok(c.cellPhone === '31900000003' && c.landlinePhone === '3133000003', 'ambos: celular e fixo setados');

    // Teste 4: edição — adiciona fixo ao "só celular", mantém celular
    const aUpd = await customerService.update(tenant.id, a.id, { landlinePhone: '3133000099' } as any);
    ok(aUpd.cellPhone === '31900000001' && aUpd.landlinePhone === '3133000099', 'edição: fixo adicionado, celular preservado');

    // Guard: só-fixo bloqueia WhatsApp
    const wa = getWhatsappPhone(b as any);
    ok(!wa.ok && wa.reason === 'LANDLINE_ONLY', 'guard: só-fixo bloqueia WhatsApp (LANDLINE_ONLY)');
    const wa2 = getWhatsappPhone(a as any);
    ok(wa2.ok && wa2.phone === '5531900000001', 'guard: celular libera WhatsApp formatado');

    // Telefone NÃO é mais único: criar outro com o mesmo celular DEVE ser permitido.
    const d = await customerService.create(tenant.id, { name: '[T] MesmoTel', birthDate: '1990-01-01', cellPhone: '31900000003' } as any);
    ids.push(d.id);
    ok(!!d.id, 'celular duplicado é PERMITIDO (telefone não é mais único)');
  });

  // Limpeza
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  console.log(`  ✓ limpeza: ${ids.length} pacientes de teste removidos`);
  console.log('\nCRUD DE TELEFONES OK ✅');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('\nFALHOU ❌\n', e); await prisma.$disconnect(); process.exit(1); });
