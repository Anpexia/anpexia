// Util de telefone (frontend): máscara BR e indicador de WhatsApp.

/** Máscara: celular (DD) 9XXXX-XXXX (11 díg) ou fixo (DD) XXXX-XXXX (10 díg). */
export function maskPhone(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    let out = '';
    if (d.length > 0) out = '(' + d.slice(0, 2);
    if (d.length >= 2) out += ') ';
    if (d.length > 2) out += d.slice(2, 6);
    if (d.length > 6) out += '-' + d.slice(6, 10);
    return out;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

export interface WhatsappIndicator {
  icon: string;
  label: string;
  cls: string;
}

/** Indicador visual a partir de celular/fixo. */
export function whatsappIndicator(cell: string | null | undefined, land: string | null | undefined): WhatsappIndicator {
  const cellDigits = (cell || '').replace(/\D/g, '');
  if (cellDigits.length === 11) return { icon: '✅', label: 'Recebe WhatsApp', cls: 'text-emerald-600' };
  if ((land || '').replace(/\D/g, '').length >= 10) return { icon: '⚠️', label: 'Apenas telefone fixo', cls: 'text-amber-600' };
  return { icon: '❌', label: 'Sem telefone celular', cls: 'text-slate-400' };
}
