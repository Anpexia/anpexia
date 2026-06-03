import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Utilitário de CPF: normalização, validação e "blind index" (HMAC) para
 * unicidade sem expor o CPF (que é armazenado criptografado).
 */

export function normalizeCpf(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '');
}

/** Valida CPF pelos dígitos verificadores (11 dígitos). CNPJ (14) não é CPF. */
export function isValidCpf(raw: string | null | undefined): boolean {
  const c = normalizeCpf(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i], 10) * (10 - i);
  let d1 = (s * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(c[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i], 10) * (11 - i);
  let d2 = (s * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(c[10], 10);
}

/**
 * Hash determinístico (HMAC-SHA256) dos dígitos do CPF/CNPJ, usado como índice
 * cego para unicidade. A chave do HMAC é DERIVADA do ENCRYPTION_KEY (sem nova
 * variável de ambiente), com separação de domínio.
 */
export function computeCpfHash(rawDigits: string, secret: string): string | null {
  const digits = (rawDigits || '').replace(/\D/g, '');
  if (!digits) return null;
  const key = crypto.createHmac('sha256', secret).update('cpf-blind-index-v1').digest();
  return crypto.createHmac('sha256', key).update(digits).digest('hex');
}

/** cpfHash usando a chave do ambiente. Retorna null se vazio. */
export function cpfHash(raw: string | null | undefined): string | null {
  return computeCpfHash(normalizeCpf(raw), env.encryptionKey);
}
