/**
 * Integração (real DB, com limpeza): CPF único, telefone não-bloqueante,
 * documento de identidade. Cobre os Testes 2, 3, 4 do plano.
 */
import prisma from '../src/config/database';
import { tenantStore } from '../src/shared/middleware/tenantContext';
import { customerService, findSharedPhonePatients } from '../src/modules/customers/customer.service';
import { AppError } from '../src/shared/middleware/error-handler';
import { cpfHash } from '../src/shared/utils/cpf';

function ok(c: any, m: string) { if (!c) throw new Error('FALHOU: ' + m); console.log('  ✓ ' + m); }

const TAG = '[CPFTEST]';
const CPF = '11144477735'; // CPF válido de teste
const SHARED_PHONE = '31900000077';

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error('sem tenant');
  const ids: string[] = [];

  await tenantStore.run({ tenantId: tenant.id } as any, async () => {
    // Teste 2: cadastro com CPF e sem telefone
    const a = await customerService.create(tenant.id, { name: `${TAG} A`, birthDate: '1990-01-01', cpfCnpj: CPF, documentType: 'RG', documentNumber: 'MG-12345' } as any);
    ids.push(a.id);
    ok(a.cpfHash === cpfHash(CPF) && !a.cellPhone, 'cadastro com CPF e sem telefone (cpfHash setado)');
    ok(a.documentType === 'RG' && a.documentNumber === 'MG-12345', 'documento de identidade salvo (tipo + número decriptado)');

    // Teste 4: CPF duplicado -> bloqueio com paciente existente
    let dup: any = null;
    try { const b = await customerService.create(tenant.id, { name: `${TAG} B`, birthDate: '1991-02-02', cpfCnpj: '111.444.777-35' } as any); ids.push(b.id); }
    catch (e: any) { dup = e; }
    ok(dup instanceof AppError && dup.statusCode === 409 && dup.code === 'CPF_DUPLICATE', 'CPF duplicado é bloqueado (409 CPF_DUPLICATE)');
    ok(dup?.details?.existingId === a.id, 'erro traz o paciente existente (p/ abrir cadastro)');

    // Teste 3: dois pacientes com o MESMO telefone -> ambos permitidos
    const p1 = await customerService.create(tenant.id, { name: `${TAG} Fam1`, birthDate: '1980-01-01', cellPhone: SHARED_PHONE } as any);
    const p2 = await customerService.create(tenant.id, { name: `${TAG} Fam2`, birthDate: '1982-01-01', cellPhone: SHARED_PHONE } as any);
    ids.push(p1.id, p2.id);
    ok(!!p1.id && !!p2.id, 'dois pacientes com o mesmo telefone são permitidos (sem bloqueio)');

    const shared = await findSharedPhonePatients(tenant.id, SHARED_PHONE);
    ok(shared.length >= 2, 'check-phone detecta telefone compartilhado (para alerta)');

    // Cadastro sem CPF -> permitido
    const c = await customerService.create(tenant.id, { name: `${TAG} SemCPF`, birthDate: '2000-01-01' } as any);
    ids.push(c.id);
    ok(!c.cpfHash, 'cadastro sem CPF é permitido (cpfHash null)');
  });

  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  console.log(`  ✓ limpeza: ${ids.length} pacientes de teste removidos`);
  console.log('\nCPF/TELEFONE CRUD OK ✅');
}

main().then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('\nFALHOU ❌\n', e); await prisma.$disconnect(); process.exit(1); });
