/**
 * Diagnóstico de criptografia (SOMENTE LEITURA).
 *
 * Para cada modelo/campo criptografado, lê o dado CRU (client base, sem a
 * extensão de decrypt), tenta descriptografar com a ENCRYPTION_KEY do processo
 * e valida a integridade. NÃO grava, NÃO recriptografa, NÃO altera nada.
 *
 * Uso:
 *   npx tsx scripts/diagnose-encryption.ts
 *
 * Para diagnosticar com a chave de PRODUÇÃO sem editar o .env, rode com a var
 * injetada no processo (ENCRYPTION_KEY=<prod> ...).
 */
import { PrismaClient } from '@prisma/client';
import { ENCRYPTED_MODELS, isEncrypted, decrypt, decryptJson } from '../src/shared/utils/encryption';
import crypto from 'crypto';

const db = new PrismaClient();

// Mapeia o nome do model (schema) para o delegate do Prisma Client.
const DELEGATES: Record<string, string> = {
  Customer: 'customer',
  MedicalRecord: 'medicalRecord',
  MedicalEntry: 'medicalEntry',
  Anamnesis: 'anamnesis',
  PatientEvolution: 'patientEvolution',
  ClinicalNote: 'clinicalNote',
  Prescription: 'prescription',
  MedicalCertificate: 'medicalCertificate',
  PatientDocument: 'patientDocument',
  PatientConvenio: 'patientConvenio',
  Autorizacao: 'autorizacao',
};

interface ModelReport {
  model: string;
  rows: number;
  encryptedValues: number;
  ok: number;
  failed: number;
  readErrors: number;
  failedIds: string[];
}

function keyFingerprint(): string {
  const k = process.env.ENCRYPTION_KEY || '';
  return crypto.createHash('sha256').update(k).digest('hex').slice(0, 16);
}

async function diagnoseModel(model: string, cfg: { string?: string[]; json?: string[] }): Promise<ModelReport> {
  const delegate = (db as any)[DELEGATES[model]];
  const report: ModelReport = { model, rows: 0, encryptedValues: 0, ok: 0, failed: 0, readErrors: 0, failedIds: [] };
  if (!delegate) return report;

  // Campos com payload gigante (base64) estouram a conversão napi do Prisma e
  // usam a MESMA chave dos demais campos — excluídos do teste em massa.
  const EXCLUDED = new Set(['fileData']);
  const strFields = (cfg.string || []).filter((f) => !EXCLUDED.has(f));
  const jsonFields = (cfg.json || []).filter((f) => !EXCLUDED.has(f));

  const select: Record<string, boolean> = { id: true };
  for (const f of strFields) select[f] = true;
  for (const f of jsonFields) select[f] = true;

  // Tenta ler em lote; se falhar (ex.: campo enorme que estoura a conversão
  // napi), relê linha a linha pulando as que não conseguem ser lidas.
  let rows: any[];
  try {
    rows = await delegate.findMany({ select });
  } catch {
    rows = [];
    const ids: Array<{ id: string }> = await delegate.findMany({ select: { id: true } });
    for (const { id } of ids) {
      try {
        const r = await delegate.findUnique({ where: { id }, select });
        if (r) rows.push(r);
      } catch {
        report.readErrors++;
      }
    }
  }
  report.rows = rows.length + report.readErrors;

  for (const row of rows) {
    let rowFailed = false;

    for (const f of strFields) {
      const v = row[f];
      if (typeof v === 'string' && isEncrypted(v)) {
        report.encryptedValues++;
        try {
          const dec = decrypt(v);
          if (typeof dec !== 'string') throw new Error('resultado não-string');
          report.ok++;
        } catch {
          report.failed++;
          rowFailed = true;
        }
      }
    }

    for (const f of jsonFields) {
      const v = row[f];
      if (v && typeof v === 'object' && (v as any).__enc) {
        report.encryptedValues++;
        try {
          const dec = decryptJson(v);
          // Integridade: deve voltar objeto/array/valor (não o wrapper __enc).
          if (dec && typeof dec === 'object' && (dec as any).__enc) throw new Error('ainda cifrado');
          report.ok++;
        } catch {
          report.failed++;
          rowFailed = true;
        }
      }
    }

    if (rowFailed && report.failedIds.length < 10) report.failedIds.push(row.id);
  }

  return report;
}

async function main() {
  console.log('========================================');
  console.log(' DIAGNÓSTICO DE CRIPTOGRAFIA (read-only)');
  console.log('========================================');
  console.log(`ENCRYPTION_KEY (sha256/16): ${keyFingerprint()}`);
  console.log('');

  const reports: ModelReport[] = [];
  for (const [model, cfg] of Object.entries(ENCRYPTED_MODELS)) {
    const r = await diagnoseModel(model, cfg as any);
    reports.push(r);
    const status = r.failed === 0 ? 'OK' : 'FALHAS';
    const re = r.readErrors > 0 ? ` | leituraErro=${r.readErrors}` : '';
    console.log(
      `${model.padEnd(20)} linhas=${String(r.rows).padStart(5)} | valores cifrados=${String(r.encryptedValues).padStart(5)} | ok=${String(r.ok).padStart(5)} | falhas=${String(r.failed).padStart(4)}${re}  [${status}]`,
    );
    if (r.failed > 0) console.log(`   ↳ ids com falha (amostra): ${r.failedIds.join(', ')}`);
  }

  const totals = reports.reduce(
    (acc, r) => ({ enc: acc.enc + r.encryptedValues, ok: acc.ok + r.ok, failed: acc.failed + r.failed, readErrors: acc.readErrors + r.readErrors }),
    { enc: 0, ok: 0, failed: 0, readErrors: 0 },
  );

  console.log('');
  console.log('---------------- RESUMO ----------------');
  console.log(`Valores criptografados encontrados: ${totals.enc}`);
  console.log(`Descriptografados com sucesso:      ${totals.ok}`);
  console.log(`Falhas de descriptografia:          ${totals.failed}`);
  if (totals.readErrors > 0) console.log(`Linhas não lidas (campo muito grande): ${totals.readErrors}`);
  console.log('');
  if (totals.failed === 0) {
    console.log('VEREDITO: ✅ chave alinhada — todos os dados descriptografam, nenhum corrompido, nenhuma recriptografia necessária.');
  } else {
    console.log('VEREDITO: ❌ há valores que NÃO descriptografam com esta chave (chave divergente OU dado corrompido).');
  }
  console.log('Operação 100% somente-leitura: nenhum dado foi alterado.');
}

main()
  .then(async () => { await db.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error('Diagnóstico FALHOU:', e); await db.$disconnect(); process.exit(1); });
