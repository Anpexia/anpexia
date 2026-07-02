// Regras de telefone do AGENDAMENTO (lógica pura, sem I/O — testável isolada).
//
// Fonte oficial dos telefones é o Customer (cellPhone/landlinePhone). O
// ScheduledCall.phone é apenas um snapshot de compatibilidade.
//
// - `resolveAppointmentPhones` normaliza/valida via resolvePhones() (mesma lógica
//   do cadastro do paciente) e calcula o snapshot: celular quando houver, senão
//   fixo.
// - `fillEmptyCustomerPhones` monta o patch para um Customer EXISTENTE: preenche
//   apenas o campo correspondente que estiver vazio; NUNCA sobrescreve um número
//   já cadastrado.
import { resolvePhones, onlyDigits, ResolvedPhones } from '../../shared/utils/phone';

export interface AppointmentPhoneInput {
  phone?: string | null; // legado (chatbot manda o número do WhatsApp aqui)
  cellPhone?: string | null;
  landlinePhone?: string | null;
}

export interface ResolvedAppointmentPhones {
  resolved: ResolvedPhones; // { cellPhone, landlinePhone, phone } já normalizados
  snapshot: string; // ScheduledCall.phone (celular || fixo)
}

// Normaliza os telefones informados no agendamento e deriva o snapshot.
// Pode lançar INVALID_CELLPHONE / INVALID_LANDLINE (mesma validação do cadastro).
export function resolveAppointmentPhones(input: AppointmentPhoneInput): ResolvedAppointmentPhones {
  const resolved = resolvePhones({
    phone: input.phone ?? undefined,
    cellPhone: input.cellPhone ?? undefined,
    landlinePhone: input.landlinePhone ?? undefined,
  });
  const snapshot =
    resolved.cellPhone || resolved.landlinePhone || resolved.phone || onlyDigits(input.phone) || '';
  return { resolved, snapshot };
}

// Patch para um Customer EXISTENTE: só preenche campo vazio, nunca sobrescreve.
export function fillEmptyCustomerPhones(
  resolved: { cellPhone: string | null; landlinePhone: string | null },
  existing: { cellPhone?: string | null; landlinePhone?: string | null; phone?: string | null },
): { cellPhone?: string; landlinePhone?: string; phone?: string } {
  const patch: { cellPhone?: string; landlinePhone?: string; phone?: string } = {};
  if (resolved.cellPhone && !existing.cellPhone) patch.cellPhone = resolved.cellPhone;
  if (resolved.landlinePhone && !existing.landlinePhone) patch.landlinePhone = resolved.landlinePhone;
  // phone legado espelha o celular: só preenche se acabamos de definir um celular e o legado está vazio.
  if (patch.cellPhone && !existing.phone) patch.phone = patch.cellPhone;
  return patch;
}
