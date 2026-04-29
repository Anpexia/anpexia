/**
 * Migração: encripta campos sensíveis de registros existentes no banco.
 * Idempotente — detecta valores já encriptados e pula.
 *
 * Uso: ENCRYPTION_KEY=... npx ts-node scripts/migrateEncryption.ts
 */
import { PrismaClient } from '@prisma/client';
import { encrypt, isEncrypted, encryptJson } from '../src/shared/utils/encryption';

const prisma = new PrismaClient();

interface FieldMap { prisma: string; db: string; }

interface MigrationTarget {
  table: string;
  model: string;
  stringFields: FieldMap[];
  jsonFields: FieldMap[];
}

const TARGETS: MigrationTarget[] = [
  {
    table: 'customers', model: 'Customer',
    stringFields: [{ prisma: 'cpfCnpj', db: 'cpf_cnpj' }],
    jsonFields: [],
  },
  {
    table: 'medical_records', model: 'MedicalRecord',
    stringFields: [
      { prisma: 'allergies', db: 'allergies' },
      { prisma: 'medications', db: 'medications' },
      { prisma: 'chronicDiseases', db: 'chronic_diseases' },
      { prisma: 'clinicalNotes', db: 'clinical_notes' },
    ],
    jsonFields: [],
  },
  {
    table: 'medical_entries', model: 'MedicalEntry',
    stringFields: [{ prisma: 'content', db: 'content' }],
    jsonFields: [],
  },
  {
    table: 'anamneses', model: 'Anamnesis',
    stringFields: [],
    jsonFields: [{ prisma: 'data', db: 'data' }],
  },
  {
    table: 'patient_evolutions', model: 'PatientEvolution',
    stringFields: [
      { prisma: 'subjective', db: 'subjective' },
      { prisma: 'objective', db: 'objective' },
      { prisma: 'assessment', db: 'assessment' },
      { prisma: 'plan', db: 'plan' },
      { prisma: 'exams', db: 'exams' },
      { prisma: 'notes', db: 'notes' },
      { prisma: 'acuity_od', db: 'acuity_od' },
      { prisma: 'acuity_oe', db: 'acuity_oe' },
    ],
    jsonFields: [],
  },
  {
    table: 'prescriptions', model: 'Prescription',
    stringFields: [],
    jsonFields: [{ prisma: 'data', db: 'data' }],
  },
  {
    table: 'medical_certificates', model: 'MedicalCertificate',
    stringFields: [
      { prisma: 'reason', db: 'reason' },
      { prisma: 'observations', db: 'observations' },
    ],
    jsonFields: [],
  },
  {
    table: 'patient_documents', model: 'PatientDocument',
    stringFields: [
      { prisma: 'fileData', db: 'file_data' },
      { prisma: 'description', db: 'description' },
    ],
    jsonFields: [],
  },
  {
    table: 'patient_convenios', model: 'PatientConvenio',
    stringFields: [
      { prisma: 'numeroCarteirinha', db: 'numero_carteirinha' },
      { prisma: 'nomeTitular', db: 'nome_titular' },
    ],
    jsonFields: [],
  },
  {
    table: 'autorizacoes', model: 'Autorizacao',
    stringFields: [
      { prisma: 'numeroAutorizacao', db: 'numero_autorizacao' },
      { prisma: 'observacoes', db: 'observacoes' },
    ],
    jsonFields: [],
  },
];

async function migrateTable(target: MigrationTarget) {
  const allFields = [...target.stringFields, ...target.jsonFields];
  if (allFields.length === 0) return;

  console.log(`\n📋 ${target.model} (${target.table})`);

  const cols = allFields.map(f => `"${f.db}"`).join(', ');
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, ${cols} FROM "${target.table}"`
  );

  console.log(`   ${rows.length} registros encontrados`);

  let encrypted = 0;
  let skipped = 0;

  for (const row of rows) {
    const updates: { db: string; value: any; isJson: boolean }[] = [];

    for (const field of target.stringFields) {
      const value = row[field.db];
      if (value && typeof value === 'string' && !isEncrypted(value)) {
        updates.push({ db: field.db, value: encrypt(value), isJson: false });
      }
    }

    for (const field of target.jsonFields) {
      const value = row[field.db];
      if (value !== null && value !== undefined) {
        if (typeof value === 'object' && value.__enc) continue;
        updates.push({ db: field.db, value: encryptJson(value), isJson: true });
      }
    }

    if (updates.length > 0) {
      const setClauses = updates.map((u, i) =>
        u.isJson ? `"${u.db}" = $${i + 2}::jsonb` : `"${u.db}" = $${i + 2}`
      );
      const values = updates.map(u => u.isJson ? JSON.stringify(u.value) : u.value);

      await prisma.$executeRawUnsafe(
        `UPDATE "${target.table}" SET ${setClauses.join(', ')} WHERE id = $1`,
        row.id,
        ...values
      );
      encrypted++;
    } else {
      skipped++;
    }
  }

  console.log(`   ✅ ${encrypted} encriptados, ${skipped} já estavam encriptados`);
}

async function main() {
  console.log('🔐 Iniciando migração de criptografia...\n');

  for (const target of TARGETS) {
    try {
      await migrateTable(target);
    } catch (err: any) {
      console.error(`   ❌ Erro em ${target.model}: ${err.message}`);
    }
  }

  console.log('\n✅ Migração concluída!');
}

main()
  .catch(err => { console.error('❌ Erro fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
