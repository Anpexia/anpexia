// Field validation for patient data collection

export function validateCpf(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleaned)) return false; // all same digits

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(cleaned[9]) !== check) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(cleaned[10]) !== check) return false;

  return true;
}

export function formatCpf(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '');
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateBirthDate(dateStr: string): { valid: boolean; date?: Date; formatted?: string } {
  const match = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!match) return { valid: false };

  const [, day, month, year] = match;
  const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
  if (isNaN(date.getTime()) || date > new Date()) return { valid: false };

  const formatted = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  return { valid: true, date, formatted };
}

export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // Brazilian phone: 10-11 digits (with area code), or 12-13 with country code
  return cleaned.length >= 10 && cleaned.length <= 13;
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return cleaned;
}

export function validateAddress(address: string): boolean {
  // Must have at least 10 chars and include some structure (number, comma, dash, etc.)
  return address.length >= 10;
}

export function validateInsurance(value: string): boolean {
  return value.length >= 3;
}

export interface FieldConfig {
  key: string;
  label: string;
  question: string;
  extractionPrompt: string;
  validate: (value: string) => boolean;
  format?: (value: string) => string;
  confirmMessage: (value: string) => string;
  skipable: boolean;
}

export const FIELD_CONFIGS: Record<string, FieldConfig> = {
  name: {
    key: 'name',
    label: 'nome completo',
    question: 'Qual e o seu *nome completo*?',
    extractionPrompt: `Extract ONLY the person's full name from the message. Remove greetings, filler words, and anything that is not a name. Return ONLY the name, nothing else.
Examples:
- "Oi tudo bem? Meu nome é Ângelo Larocca" → "Ângelo Larocca"
- "Me chamo Maria da Silva Santos" → "Maria da Silva Santos"
- "João" → "João"
- "oi, sou o Pedro Henrique de Oliveira" → "Pedro Henrique de Oliveira"
- "bom dia! aqui é a Ana Clara" → "Ana Clara"`,
    validate: (v) => v.length >= 3 && /^[a-zA-ZÀ-ÿ\s'-]+$/.test(v),
    confirmMessage: (v) => `Seu nome completo e *${v}*?`,
    skipable: false,
  },
  birthDate: {
    key: 'birthDate',
    label: 'data de nascimento',
    question: 'Qual e a sua *data de nascimento*? (formato: DD/MM/AAAA)',
    extractionPrompt: `Extract ONLY the birth date from the message and return it in DD/MM/YYYY format. Remove any text that is not a date.
Examples:
- "Nasci em 15 de março de 1990" → "15/03/1990"
- "15/03/1990" → "15/03/1990"
- "minha data é 05-12-1985" → "05/12/1985"
- "03 de janeiro de 2000" → "03/01/2000"
- "nascimento 10/10/88" → "10/10/1988"`,
    validate: (v) => validateBirthDate(v).valid,
    format: (v) => validateBirthDate(v).formatted || v,
    confirmMessage: (v) => {
      const parsed = validateBirthDate(v);
      return `Sua data de nascimento e *${parsed.formatted || v}*?`;
    },
    skipable: true,
  },
  cpfCnpj: {
    key: 'cpfCnpj',
    label: 'CPF',
    question: 'Qual e o seu *CPF*?',
    extractionPrompt: `Extract ONLY the CPF number from the message. Remove any text that is not a CPF. Return only digits or formatted CPF.
Examples:
- "Meu CPF é 123.456.789-01" → "123.456.789-01"
- "cpf 12345678901" → "12345678901"
- "aqui: 123 456 789 01" → "12345678901"`,
    validate: validateCpf,
    format: formatCpf,
    confirmMessage: (v) => `Seu CPF e *${formatCpf(v)}*?`,
    skipable: true,
  },
  email: {
    key: 'email',
    label: 'email',
    question: 'Qual e o seu *email*?',
    extractionPrompt: `Extract ONLY the email address from the message. Remove any text that is not an email.
Examples:
- "Meu email é joao@gmail.com" → "joao@gmail.com"
- "pode mandar pra maria_silva@hotmail.com" → "maria_silva@hotmail.com"
- "email: teste@empresa.com.br" → "teste@empresa.com.br"`,
    validate: validateEmail,
    confirmMessage: (v) => `Seu email e *${v}*?`,
    skipable: true,
  },
  address: {
    key: 'address',
    label: 'endereco completo',
    question: 'Qual e o seu *endereco completo*? (rua, numero, bairro, cidade e CEP)',
    extractionPrompt: `Extract ONLY the full address from the message. Keep all parts: street, number, neighborhood, city, state, and ZIP code if present. Return it as a single clean string.
Examples:
- "Moro na Rua das Flores, 123, Centro, Salvador, CEP 40000-000" → "Rua das Flores, 123, Centro, Salvador, CEP 40000-000"
- "Av Brasil 500 apt 12 Jardim America São Paulo SP 01430-000" → "Av Brasil, 500, apt 12, Jardim América, São Paulo, SP, 01430-000"
- "rua a numero 10 bairro novo aracaju" → "Rua A, 10, Bairro Novo, Aracaju"`,
    validate: validateAddress,
    confirmMessage: (v) => `Seu endereco e *${v}*?`,
    skipable: true,
  },
  insurance: {
    key: 'insurance',
    label: 'convenio',
    question: 'Voce possui *convenio medico*? Se sim, informe o *nome do plano e numero da carteirinha*. Se nao, basta digitar "Particular".',
    extractionPrompt: `Extract insurance information from the message. If the person says they don't have insurance or will pay privately, return "Particular". If they have insurance, extract the plan name and card number in format "PlanName - CardNumber". If only plan name is given, return just the plan name.
Examples:
- "Não tenho convênio" → "Particular"
- "Vou particular" → "Particular"
- "Tenho Unimed, carteirinha 123456" → "Unimed - 123456"
- "Bradesco Saúde número 789012345" → "Bradesco Saúde - 789012345"
- "SulAmérica" → "SulAmérica"
- "sim, Amil" → "Amil"`,
    validate: validateInsurance,
    confirmMessage: (v) => {
      if (v.toLowerCase() === 'particular') {
        return `Voce vai como *particular* (sem convenio)?`;
      }
      return `Seu convenio e *${v}*?`;
    },
    skipable: true,
  },
};

export const FIELD_ORDER = ['name', 'birthDate', 'cpfCnpj', 'email', 'address', 'insurance'];
