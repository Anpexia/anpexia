/**
 * Utilitário central de telefones brasileiros.
 *
 * Separa CELULAR (11 dígitos, 9º dígito) de FIXO (10 dígitos). Elimina o "9
 * artificial": nunca injeta um 9 em telefone fixo. Toda decisão de envio de
 * WhatsApp passa por `getWhatsappPhone()`.
 */
import { AppError } from '../middleware/error-handler';

// DDDs válidos no Brasil (Anatel).
export const VALID_DDDS = new Set<string>([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

export function onlyDigits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

/** Remove o DDI 55 quando presente (heurística por tamanho). Retorna o número nacional. */
export function toNational(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d.slice(2);
  return d;
}

export function isValidDDD(national: string): boolean {
  return VALID_DDDS.has(national.slice(0, 2));
}

export type PhoneType = 'mobile' | 'landline' | 'invalid';
export type PhoneReason =
  | 'ok'
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'invalid_ddd'
  | 'mobile_missing_9'
  | 'landline_bad_prefix';

export interface PhoneClassification {
  type: PhoneType;
  national: string; // dígitos nacionais (sem DDI)
  reason: PhoneReason;
}

/**
 * Classifica um telefone como celular, fixo ou inválido.
 * - Celular: 11 dígitos, DDD válido, 3º dígito = 9.
 * - Fixo: 10 dígitos, DDD válido, 3º dígito entre 2 e 5.
 */
export function classifyPhone(raw: string | null | undefined): PhoneClassification {
  const national = toNational(raw);
  if (!national) return { type: 'invalid', national, reason: 'empty' };
  if (national.length < 10) return { type: 'invalid', national, reason: 'too_short' };
  if (national.length > 11) return { type: 'invalid', national, reason: 'too_long' };
  if (!isValidDDD(national)) return { type: 'invalid', national, reason: 'invalid_ddd' };

  const third = national[2];
  if (national.length === 11) {
    if (third === '9') return { type: 'mobile', national, reason: 'ok' };
    return { type: 'invalid', national, reason: 'mobile_missing_9' };
  }
  // length === 10
  if (third >= '2' && third <= '5') return { type: 'landline', national, reason: 'ok' };
  return { type: 'invalid', national, reason: 'landline_bad_prefix' };
}

export function isMobile(raw: string | null | undefined): boolean {
  return classifyPhone(raw).type === 'mobile';
}

export function isLandline(raw: string | null | undefined): boolean {
  return classifyPhone(raw).type === 'landline';
}

/**
 * Detecta provável "9 artificial": 11 dígitos, começa com 9, mas o dígito
 * seguinte é de prefixo de fixo (2–5) — sinal de fixo que recebeu um 9 manual.
 * Usado apenas para a FILA DE REVISÃO (não bloqueia, não reclassifica sozinho).
 */
export function isSuspectFakeNine(raw: string | null | undefined): boolean {
  const national = toNational(raw);
  if (national.length !== 11 || !isValidDDD(national)) return false;
  return national[2] === '9' && national[3] >= '2' && national[3] <= '5';
}

/** Formata um CELULAR válido para o WhatsApp: 55 + DDD + 9 + 8 dígitos (13). */
export function formatMobileForWhatsapp(raw: string | null | undefined): string | null {
  const c = classifyPhone(raw);
  if (c.type !== 'mobile') return null;
  return '55' + c.national;
}

// ---- Guard central de WhatsApp ----

export interface WhatsappTargetInput {
  cellPhone?: string | null;
  landlinePhone?: string | null;
  phone?: string | null; // legado (espelho do cellPhone)
  usarTelResponsavel?: boolean | null;
  responsavel?: WhatsappTargetInput | null;
}

export type WhatsappBlockReason = 'LANDLINE_ONLY' | 'NO_CELL';

export interface WhatsappTargetResult {
  ok: boolean;
  phone?: string; // número formatado p/ WhatsApp (13 dígitos)
  reason?: WhatsappBlockReason;
  message?: string;
}

export const WHATSAPP_MESSAGES: Record<WhatsappBlockReason, string> = {
  LANDLINE_ONLY: 'Paciente possui apenas telefone fixo cadastrado e não pode receber mensagens pelo WhatsApp.',
  NO_CELL: 'Paciente não possui telefone celular cadastrado.',
};

/** Resolve o celular efetivo de um cadastro (com fallback legado para `phone`). */
function resolveCell(c: WhatsappTargetInput): string | null {
  if (c.cellPhone && isMobile(c.cellPhone)) return c.cellPhone;
  // Fallback de transição: phone legado que ainda seja um celular válido.
  if (c.phone && isMobile(c.phone)) return c.phone;
  return null;
}

/**
 * Função OBRIGATÓRIA para qualquer envio de WhatsApp. Nenhum módulo deve montar
 * o telefone manualmente. Considera dependentes (usa o celular do responsável).
 */
export function getWhatsappPhone(customer: WhatsappTargetInput | null | undefined): WhatsappTargetResult {
  if (!customer) return { ok: false, reason: 'NO_CELL', message: WHATSAPP_MESSAGES.NO_CELL };

  // Dependente que usa o telefone do responsável.
  const target =
    customer.usarTelResponsavel && customer.responsavel ? customer.responsavel : customer;

  const cell = resolveCell(target);
  if (cell) {
    return { ok: true, phone: formatMobileForWhatsapp(cell)! };
  }

  // Sem celular: distingue "só fixo" de "nenhum".
  const hasLandline = !!(target.landlinePhone && isLandline(target.landlinePhone));
  const reason: WhatsappBlockReason = hasLandline ? 'LANDLINE_ONLY' : 'NO_CELL';
  return { ok: false, reason, message: WHATSAPP_MESSAGES[reason] };
}

// ---- Normalização de escrita (create/update/import) ----

export interface ResolvePhonesInput {
  phone?: string | null; // legado
  cellPhone?: string | null;
  landlinePhone?: string | null;
}

export interface ResolvedPhones {
  cellPhone: string | null;
  landlinePhone: string | null;
  phone: string | null; // espelho de cellPhone (compatibilidade)
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

/**
 * Normaliza e valida os telefones para gravação. Regras:
 *  - cellPhone deve ser celular válido; landlinePhone deve ser fixo válido.
 *  - Compatibilidade: se vier só `phone` (cliente antigo/CSV), classifica e
 *    roteia para o campo certo; se inválido, preserva o valor cru (nada perdido).
 *  - phone passa a ESPELHAR o cellPhone.
 *
 * `existing` é usado em updates: campos ausentes no input mantêm o valor atual.
 */
export function resolvePhones(input: ResolvePhonesInput, existing?: { cellPhone?: string | null; landlinePhone?: string | null }): ResolvedPhones {
  const cellProvided = input.cellPhone !== undefined;
  const landProvided = input.landlinePhone !== undefined;

  let cell = cellProvided ? emptyToNull(input.cellPhone) : (existing?.cellPhone ?? null);
  let land = landProvided ? emptyToNull(input.landlinePhone) : (existing?.landlinePhone ?? null);

  // Caminho legado: cliente mandou só `phone`.
  if (!cellProvided && !landProvided && input.phone !== undefined) {
    const raw = emptyToNull(input.phone);
    if (raw) {
      const c = classifyPhone(raw);
      if (c.type === 'mobile') cell = c.national;
      else if (c.type === 'landline') land = c.national;
      else {
        // Telefone legado fora do padrão: preserva cru, sem classificar nem perder.
        return { cellPhone: cell, landlinePhone: land, phone: onlyDigits(raw) || raw };
      }
    } else {
      cell = null;
    }
  }

  if (cell && !isMobile(cell)) {
    throw new AppError(400, 'INVALID_CELLPHONE', 'Telefone celular inválido. Use o formato (DD) 9XXXX-XXXX com 11 dígitos.');
  }
  if (land && !isLandline(land)) {
    throw new AppError(400, 'INVALID_LANDLINE', 'Telefone fixo inválido. Use o formato (DD) XXXX-XXXX com 10 dígitos.');
  }

  cell = cell ? toNational(cell) : null;
  land = land ? toNational(land) : null;

  return { cellPhone: cell, landlinePhone: land, phone: cell };
}
