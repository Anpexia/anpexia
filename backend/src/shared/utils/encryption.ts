import crypto from 'crypto';
import { env } from '../../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

let keyBuffer: Buffer | null = null;

function getKey(): Buffer {
  if (!keyBuffer) {
    keyBuffer = Buffer.from(env.encryptionKey, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error('ENCRYPTION_KEY deve ter 32 bytes (64 caracteres hex)');
    }
  }
  return keyBuffer;
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext || !isEncrypted(ciphertext)) return ciphertext;
  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return ciphertext;
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptJson(data: any): any {
  if (data === null || data === undefined) return data;
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  return { __enc: encrypt(json) };
}

export function decryptJson(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'object' && data.__enc) {
    const decrypted = decrypt(data.__enc);
    try { return JSON.parse(decrypted); } catch { return decrypted; }
  }
  return data;
}

interface EncryptedModelConfig {
  string?: string[];
  json?: string[];
}

export const ENCRYPTED_MODELS: Record<string, EncryptedModelConfig> = {
  Customer: { string: ['cpfCnpj'] },
  MedicalRecord: { string: ['allergies', 'medications', 'chronicDiseases', 'clinicalNotes'] },
  MedicalEntry: { string: ['content'] },
  Anamnesis: { json: ['data'] },
  PatientEvolution: { string: ['subjective', 'objective', 'assessment', 'plan', 'exams', 'notes', 'acuity_od', 'acuity_oe'] },
  Prescription: { json: ['data'] },
  MedicalCertificate: { string: ['reason', 'observations'] },
  PatientDocument: { string: ['fileData', 'description'] },
  PatientConvenio: { string: ['numeroCarteirinha', 'nomeTitular'] },
  Autorizacao: { string: ['numeroAutorizacao', 'observacoes'] },
};

export function encryptModelFields(model: string, data: any): void {
  if (!data || typeof data !== 'object') return;
  const config = ENCRYPTED_MODELS[model];
  if (!config) return;

  if (config.string) {
    for (const field of config.string) {
      if (data[field] && typeof data[field] === 'string' && !isEncrypted(data[field])) {
        data[field] = encrypt(data[field]);
      }
    }
  }
  if (config.json) {
    for (const field of config.json) {
      if (data[field] !== undefined && data[field] !== null) {
        if (typeof data[field] === 'object' && data[field].__enc) continue;
        data[field] = encryptJson(data[field]);
      }
    }
  }
}

export function decryptModelFields(model: string, data: any): void {
  if (!data || typeof data !== 'object') return;
  const config = ENCRYPTED_MODELS[model];
  if (!config) return;

  if (config.string) {
    for (const field of config.string) {
      if (data[field] && typeof data[field] === 'string' && isEncrypted(data[field])) {
        data[field] = decrypt(data[field]);
      }
    }
  }
  if (config.json) {
    for (const field of config.json) {
      if (data[field] !== undefined && data[field] !== null) {
        data[field] = decryptJson(data[field]);
      }
    }
  }
}

export function decryptResultData(model: string, result: any): any {
  if (!result || !ENCRYPTED_MODELS[model]) return result;
  if (Array.isArray(result)) {
    for (const item of result) decryptModelFields(model, item);
  } else {
    decryptModelFields(model, result);
  }
  return result;
}
