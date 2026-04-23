import prisma from '../../config/database';
import { schedulingService } from '../scheduling/scheduling.service';

// ============================================================
// Conversation state machine for WhatsApp chatbot
// Deterministic flow — no AI. Only handles scheduling.
//
// Flow:
//   Entry → Menu (agendar / atendente)
//   → Registration (new patient) → Scheduling
//   → Scheduling (existing patient)
// ============================================================

export type FlowState =
  | 'IDLE'
  | 'MENU'
  // Registration
  | 'REG_NAME'
  | 'REG_EMAIL'
  | 'REG_CPF'
  | 'REG_BIRTH'
  | 'REG_CEP'
  | 'REG_ADDRESS_NUMBER'
  | 'REG_COMPLEMENTO_ASK'
  | 'REG_COMPLEMENTO'
  | 'REG_CONFIRM'
  | 'REG_ALTER'
  // Scheduling
  | 'SCHED_PAYMENT'
  | 'SCHED_CONVENIO'
  | 'SCHED_SPECIALTY'
  | 'SCHED_DOCTOR'
  | 'SCHED_DATE'
  | 'SCHED_PERIOD'
  | 'SCHED_TIME'
  | 'SCHED_CONFIRM'
  // Reminder replies
  | 'REMINDER_RESCHEDULE';

interface ConversationState {
  state: FlowState;
  tenantId: string;
  phone: string;
  customerId?: string;
  data: Record<string, any>;
  expiresAt: number;
}

const STATE_TTL = 15 * 60 * 1000; // 15 minutes
const conversations = new Map<string, ConversationState>();

function key(tenantId: string, phone: string) {
  return `${tenantId}:${phone}`;
}

function getState(tenantId: string, phone: string): ConversationState | null {
  const k = key(tenantId, phone);
  const state = conversations.get(k);
  if (!state) return null;
  if (Date.now() > state.expiresAt) {
    conversations.delete(k);
    return null;
  }
  return state;
}

function setState(tenantId: string, phone: string, state: FlowState, data: Record<string, any> = {}, customerId?: string) {
  const k = key(tenantId, phone);
  const existing = conversations.get(k);
  conversations.set(k, {
    state,
    tenantId,
    phone,
    customerId: customerId ?? existing?.customerId,
    data: { ...(existing?.data || {}), ...data },
    expiresAt: Date.now() + STATE_TTL,
  });
}

function clearState(tenantId: string, phone: string) {
  conversations.delete(key(tenantId, phone));
}

// Clean expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of conversations) {
    if (now > v.expiresAt) conversations.delete(k);
  }
}, 5 * 60 * 1000);

// ============================================================
// Response types
// ============================================================

export interface FlowResponse {
  type: 'text' | 'buttons' | 'list' | 'handoff';
  text: string;
  title?: string;
  footer?: string;
  buttons?: Array<{ id: string; text: string }>;
  listButtonText?: string;
  listSections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

// ============================================================
// Main handler
// ============================================================

export async function handleConversationFlow(
  tenantId: string,
  phone: string,
  senderName: string,
  messageText: string,
): Promise<FlowResponse | null> {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  // Handle global booking triggers from notifications
  if (['agendar consulta', 'agendar agora', 'agendar retorno', 'quero agendar',
       'agendar nova consulta', 'btn_rebook', 'btn_book'].includes(textLower) ||
      textLower.replace(/\s+/g, '_') === 'agendar_consulta') {
    const customer = await findCustomer(tenantId, phone);
    if (customer) {
      setState(tenantId, phone, 'IDLE', {}, customer.id);
      return startSchedulingFlow(tenantId, phone);
    }
  }

  const conv = getState(tenantId, phone);

  // No active state — any message starts the entry menu
  if (!conv || conv.state === 'IDLE') {
    return showEntryMenu(tenantId, phone);
  }

  // Route based on current state
  switch (conv.state) {
    case 'MENU': return handleMenu(tenantId, phone, text);
    // Registration
    case 'REG_NAME': return handleRegName(tenantId, phone, text);
    case 'REG_EMAIL': return handleRegEmail(tenantId, phone, text);
    case 'REG_CPF': return handleRegCpf(tenantId, phone, text);
    case 'REG_BIRTH': return handleRegBirth(tenantId, phone, text);
    case 'REG_CEP': return handleRegCep(tenantId, phone, text);
    case 'REG_ADDRESS_NUMBER': return handleRegAddressNumber(tenantId, phone, text);
    case 'REG_COMPLEMENTO_ASK': return handleRegComplementoAsk(tenantId, phone, text);
    case 'REG_COMPLEMENTO': return handleRegComplemento(tenantId, phone, text);
    case 'REG_CONFIRM': return handleRegConfirm(tenantId, phone, text);
    case 'REG_ALTER': return handleRegAlter(tenantId, phone, text);
    // Scheduling
    case 'SCHED_PAYMENT': return handleSchedPayment(tenantId, phone, text);
    case 'SCHED_CONVENIO': return handleSchedConvenio(tenantId, phone, text);
    case 'SCHED_SPECIALTY': return handleSchedSpecialty(tenantId, phone, text);
    case 'SCHED_DOCTOR': return handleSchedDoctor(tenantId, phone, text);
    case 'SCHED_DATE': return handleSchedDate(tenantId, phone, text);
    case 'SCHED_PERIOD': return handleSchedPeriod(tenantId, phone, text);
    case 'SCHED_TIME': return handleSchedTime(tenantId, phone, text);
    case 'SCHED_CONFIRM': return handleSchedConfirm(tenantId, phone, text);
    case 'REMINDER_RESCHEDULE': return handleSchedDate(tenantId, phone, text);
    default: return null;
  }
}

// ============================================================
// Entry menu — shown on ANY first message
// ============================================================

async function showEntryMenu(tenantId: string, phone: string): Promise<FlowResponse> {
  setState(tenantId, phone, 'MENU', {});

  let greeting = 'Ola! 👋';
  try {
    const config = await prisma.chatbotConfig.findFirst({ where: { tenantId }, select: { assistantName: true } });
    if (config?.assistantName) {
      greeting = `Ola! 👋 Eu sou ${config.assistantName}, assistente virtual.`;
    }
  } catch {}

  return {
    type: 'text',
    text: `${greeting} Este canal e exclusivo para agendamento de consultas.\n\n` +
          '1 - Agendar consulta\n' +
          '2 - Falar com atendente\n\n' +
          'Responda com o numero da opcao.',
  };
}

async function handleMenu(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const n = text.trim();
  if (n === '1' || n.toLowerCase().includes('agendar')) {
    const customer = await findCustomer(tenantId, phone);
    if (customer) {
      setState(tenantId, phone, 'IDLE', {}, customer.id);
      return startSchedulingFlow(tenantId, phone);
    } else {
      return startRegistration(tenantId, phone);
    }
  }

  if (n === '2' || n.toLowerCase().includes('atendente')) {
    clearState(tenantId, phone);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { phone: true },
    });
    const phoneLine = tenant?.phone ? `(${tenant.phone})` : '';
    return {
      type: 'text',
      text: `Para falar com nossa equipe, entre em contato pelo telefone:\n${phoneLine}\n\n` +
            `Horario de atendimento: 8h as 18h.\n\n` +
            `Estamos a disposicao! 😊`,
    };
  }

  // Invalid — repeat
  return {
    type: 'text',
    text: 'Opcao invalida. Responda com o numero da opcao:\n\n' +
          '1 - Agendar consulta\n' +
          '2 - Falar com atendente',
  };
}

// ============================================================
// Registration flow — new patient
// ============================================================

function startRegistration(tenantId: string, phone: string): FlowResponse {
  setState(tenantId, phone, 'REG_NAME', { reg: {} });
  return { type: 'text', text: 'Qual o seu nome completo?' };
}

function handleRegName(tenantId: string, phone: string, text: string): FlowResponse {
  if (text.length < 3) {
    return { type: 'text', text: 'Por favor, informe seu nome completo.' };
  }
  const conv = getState(tenantId, phone)!;
  conv.data.reg = { ...conv.data.reg, name: text.trim() };
  setState(tenantId, phone, 'REG_EMAIL', conv.data);
  return { type: 'text', text: 'Qual o seu email?' };
}

function handleRegEmail(tenantId: string, phone: string, text: string): FlowResponse {
  const email = text.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { type: 'text', text: 'Email invalido. Por favor, informe um email valido.' };
  }
  const conv = getState(tenantId, phone)!;
  conv.data.reg = { ...conv.data.reg, email };
  setState(tenantId, phone, 'REG_CPF', conv.data);
  return { type: 'text', text: 'Qual o seu CPF?' };
}

function handleRegCpf(tenantId: string, phone: string, text: string): FlowResponse {
  const cleaned = text.replace(/\D/g, '');
  if (cleaned.length !== 11 || !validateCpf(cleaned)) {
    return { type: 'text', text: 'CPF invalido. Por favor, informe um CPF valido (11 digitos).' };
  }
  const formatted = cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  const conv = getState(tenantId, phone)!;
  conv.data.reg = { ...conv.data.reg, cpf: formatted, cpfRaw: cleaned };
  setState(tenantId, phone, 'REG_BIRTH', conv.data);
  return {
    type: 'text',
    text: 'Qual a sua data de nascimento?\n(exemplo: 15031990 para 15 de marco de 1990)',
  };
}

function handleRegBirth(tenantId: string, phone: string, text: string): FlowResponse {
  const cleaned = text.replace(/[\s\/\-\.]/g, '');
  let day: string, month: string, year: string;

  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    day = cleaned.slice(0, 2);
    month = cleaned.slice(2, 4);
    year = cleaned.slice(4, 8);
  } else {
    const match = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (!match) {
      return { type: 'text', text: 'Formato invalido. Use DDMMAAAA (exemplo: 15031990).' };
    }
    [, day, month, year] = match;
  }

  const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
  if (isNaN(date.getTime()) || date > new Date()) {
    return { type: 'text', text: 'Data invalida. Use DDMMAAAA (exemplo: 15031990).' };
  }

  const formatted = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  const conv = getState(tenantId, phone)!;
  conv.data.reg = { ...conv.data.reg, birthDate: formatted, birthDateISO: date.toISOString() };
  setState(tenantId, phone, 'REG_CEP', conv.data);
  return {
    type: 'text',
    text: 'Vamos cadastrar seu endereco. 📍\n\nQual o seu CEP? (exemplo: 40444-444)',
  };
}

async function handleRegCep(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const cep = text.replace(/\D/g, '');
  if (cep.length !== 8) {
    return { type: 'text', text: 'CEP invalido. Informe 8 digitos (exemplo: 40444444).' };
  }

  const conv = getState(tenantId, phone);
  if (!conv) {
    return { type: 'text', text: 'Sessao expirada. Envie qualquer mensagem para recomecar.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[CHATBOT] ViaCEP HTTP ${response.status} for CEP ${cep}`);
      return { type: 'text', text: 'Servico de CEP indisponivel no momento. Tente novamente em alguns segundos.' };
    }

    const data = await response.json() as any;

    if (data.erro) {
      conv.data.reg = { ...conv.data.reg, cep, street: '', neighborhood: '', city: '', state: '', cepNotFound: true };
      setState(tenantId, phone, 'REG_ADDRESS_NUMBER', conv.data);
      return {
        type: 'text',
        text: 'CEP nao encontrado. Digite "0" para preencher manualmente ou informe outro CEP.',
      };
    }

    conv.data.reg = {
      ...conv.data.reg,
      cep: data.cep || cep,
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || '',
      cepNotFound: false,
    };
    setState(tenantId, phone, 'REG_ADDRESS_NUMBER', conv.data);

    return {
      type: 'text',
      text: `Achei este endereco: 📍\n${data.logradouro}, ${data.bairro}, ${data.localidade}-${data.uf}\n\nQual o numero?`,
    };
  } catch (err: any) {
    console.error(`[CHATBOT] CEP lookup failed for ${cep}:`, err.message || err);
    return { type: 'text', text: 'Erro ao buscar CEP. Tente novamente em alguns segundos.' };
  }
}

function handleRegAddressNumber(tenantId: string, phone: string, text: string): FlowResponse {
  const conv = getState(tenantId, phone)!;

  if (text.trim() === '0' && conv.data.reg.cepNotFound) {
    // Manual address entry — just ask for full address
    conv.data.reg = { ...conv.data.reg, manualAddress: true };
    setState(tenantId, phone, 'REG_COMPLEMENTO', conv.data);
    return { type: 'text', text: 'Informe seu endereco completo (rua, numero, bairro, cidade e estado):' };
  }

  conv.data.reg = { ...conv.data.reg, number: text.trim() };
  setState(tenantId, phone, 'REG_COMPLEMENTO_ASK', conv.data);
  return {
    type: 'text',
    text: 'Seu endereco tem complemento?\n(apartamento, bloco, lote, etc)\n\n1 - Sim\n2 - Nao',
  };
}

function handleRegComplementoAsk(tenantId: string, phone: string, text: string): FlowResponse {
  const n = text.trim();
  if (n === '1' || n.toLowerCase() === 'sim') {
    setState(tenantId, phone, 'REG_COMPLEMENTO', getState(tenantId, phone)!.data);
    return { type: 'text', text: 'Qual o complemento?\n(exemplo: Apto 101, Bloco B, Fundos)' };
  }
  if (n === '2' || n.toLowerCase().startsWith('nao') || n.toLowerCase().startsWith('não')) {
    return showRegConfirmation(tenantId, phone, '');
  }
  return { type: 'text', text: 'Responda com 1 (Sim) ou 2 (Nao).' };
}

function handleRegComplemento(tenantId: string, phone: string, text: string): FlowResponse {
  const conv = getState(tenantId, phone)!;
  if (conv.data.reg.manualAddress) {
    conv.data.reg = { ...conv.data.reg, fullAddress: text.trim() };
    return showRegConfirmation(tenantId, phone, '');
  }
  return showRegConfirmation(tenantId, phone, text.trim());
}

function showRegConfirmation(tenantId: string, phone: string, complemento: string): FlowResponse {
  const conv = getState(tenantId, phone)!;
  const r = conv.data.reg;
  r.complemento = complemento;

  let addressLine: string;
  if (r.manualAddress) {
    addressLine = r.fullAddress || '';
  } else {
    addressLine = `${r.street}, ${r.number}`;
    if (complemento) addressLine += `, ${complemento}`;
    addressLine += `\n${r.neighborhood}, ${r.city}-${r.state}\nCEP: ${r.cep}`;
  }
  r.addressFormatted = addressLine;

  setState(tenantId, phone, 'REG_CONFIRM', conv.data);
  return {
    type: 'text',
    text: `Confirme seus dados:\n\n` +
          `Nome: ${r.name}\n` +
          `Email: ${r.email}\n` +
          `CPF: ${r.cpf}\n` +
          `Nascimento: ${r.birthDate}\n` +
          `Endereco: ${addressLine}\n\n` +
          `1 - Confirmar tudo ✅\n` +
          `2 - Alterar dados 🔄`,
  };
}

async function handleRegConfirm(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const n = text.trim();
  if (n === '1' || n.toLowerCase().includes('confirmar')) {
    const conv = getState(tenantId, phone)!;
    const r = conv.data.reg;

    // Save customer
    try {
      const addressJson = r.manualAddress
        ? { raw: r.fullAddress }
        : { cep: r.cep, street: r.street, number: r.number, complement: r.complemento || '', neighborhood: r.neighborhood, city: r.city, state: r.state };

      const customer = await prisma.customer.create({
        data: {
          tenantId,
          name: r.name,
          phone,
          email: r.email,
          cpfCnpj: r.cpfRaw,
          birthDate: r.birthDateISO ? new Date(r.birthDateISO) : undefined,
          address: addressJson,
          origin: 'whatsapp-chatbot',
          optInWhatsApp: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'customer.chatbot_create',
          entity: 'Customer',
          entityId: customer.id,
          changes: { source: 'whatsapp-chatbot' },
        },
      });

      setState(tenantId, phone, 'IDLE', {}, customer.id);
      return startSchedulingFlow(tenantId, phone);
    } catch (err: any) {
      console.error('[FLOW] Error saving customer:', err.message);
      return { type: 'text', text: 'Ocorreu um erro ao salvar seus dados. Tente novamente enviando qualquer mensagem.' };
    }
  }

  if (n === '2' || n.toLowerCase().includes('alterar')) {
    setState(tenantId, phone, 'REG_ALTER', getState(tenantId, phone)!.data);
    return {
      type: 'text',
      text: 'Qual dado deseja alterar?\n\n1 - Nome\n2 - Email\n3 - CPF\n4 - Nascimento\n5 - Endereco',
    };
  }

  return { type: 'text', text: 'Responda com 1 (Confirmar) ou 2 (Alterar).' };
}

function handleRegAlter(tenantId: string, phone: string, text: string): FlowResponse {
  const n = text.trim();
  const conv = getState(tenantId, phone)!;

  switch (n) {
    case '1':
      setState(tenantId, phone, 'REG_NAME', conv.data);
      return { type: 'text', text: 'Qual o seu nome completo?' };
    case '2':
      setState(tenantId, phone, 'REG_EMAIL', conv.data);
      return { type: 'text', text: 'Qual o seu email?' };
    case '3':
      setState(tenantId, phone, 'REG_CPF', conv.data);
      return { type: 'text', text: 'Qual o seu CPF?' };
    case '4':
      setState(tenantId, phone, 'REG_BIRTH', conv.data);
      return { type: 'text', text: 'Qual a sua data de nascimento?\n(exemplo: 15031990)' };
    case '5':
      setState(tenantId, phone, 'REG_CEP', conv.data);
      return { type: 'text', text: 'Qual o seu CEP? (exemplo: 40444-444)' };
    default:
      return { type: 'text', text: 'Opcao invalida. Escolha de 1 a 5.' };
  }
}

// ============================================================
// Scheduling flow
// ============================================================

async function startSchedulingFlow(tenantId: string, phone: string): Promise<FlowResponse> {
  setState(tenantId, phone, 'SCHED_PAYMENT', {});
  return {
    type: 'text',
    text: 'Como sera o pagamento desta consulta?\n\n1 - Particular\n2 - Convenio',
  };
}

async function handleSchedPayment(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const n = text.trim();
  if (n === '1' || n.toLowerCase().includes('particular')) {
    const conv = getState(tenantId, phone)!;
    conv.data.paymentType = 'PARTICULAR';
    conv.data.convenioId = null;
    conv.data.convenioName = null;
    setState(tenantId, phone, 'IDLE', conv.data);
    return showSpecialties(tenantId, phone);
  }

  if (n === '2' || n.toLowerCase().includes('convenio') || n.toLowerCase().includes('convênio')) {
    // Show convenios list
    const convenios = await prisma.convenio.findMany({
      where: { tenantId, ativo: true },
      orderBy: { nome: 'asc' },
    });

    if (convenios.length === 0) {
      const conv = getState(tenantId, phone)!;
      conv.data.paymentType = 'PARTICULAR';
      setState(tenantId, phone, 'IDLE', conv.data);
      return showSpecialties(tenantId, phone);
    }

    const conv = getState(tenantId, phone)!;
    conv.data.convenioList = convenios.map(c => ({ id: c.id, nome: c.nome }));
    setState(tenantId, phone, 'SCHED_CONVENIO', conv.data);

    const list = convenios.map((c, i) => `${i + 1} - ${c.nome}`).join('\n');
    return {
      type: 'text',
      text: `Qual o seu convenio?\n\n${list}\n\nResponda com o numero da opcao.`,
    };
  }

  return { type: 'text', text: 'Responda com 1 (Particular) ou 2 (Convenio).' };
}

async function handleSchedConvenio(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;
  const list = conv.data.convenioList as Array<{ id: string; nome: string }>;
  const num = parseInt(text.trim());

  if (isNaN(num) || num < 1 || num > list.length) {
    return { type: 'text', text: `Opcao invalida. Escolha de 1 a ${list.length}.` };
  }

  const selected = list[num - 1];
  conv.data.paymentType = 'CONVENIO';
  conv.data.convenioId = selected.id;
  conv.data.convenioName = selected.nome;
  setState(tenantId, phone, 'IDLE', conv.data);
  return showSpecialties(tenantId, phone);
}

async function showSpecialties(tenantId: string, phone: string): Promise<FlowResponse> {
  // Get unique specialties from active doctors in this tenant
  const doctors = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      especialidade: { not: null },
      role: { in: ['OWNER', 'MANAGER', 'EMPLOYEE'] },
    },
    select: { id: true, name: true, especialidade: true, horarios: true, duracaoConsulta: true },
  });

  const specialtyMap = new Map<string, Array<{ id: string; name: string; horarios: any; duracaoConsulta: number | null }>>();
  for (const doc of doctors) {
    if (!doc.especialidade) continue;
    const key = doc.especialidade.trim();
    if (!specialtyMap.has(key)) specialtyMap.set(key, []);
    specialtyMap.get(key)!.push({ id: doc.id, name: doc.name, horarios: doc.horarios, duracaoConsulta: doc.duracaoConsulta });
  }

  const specialties = Array.from(specialtyMap.keys()).sort();

  if (specialties.length === 0) {
    // No specialties configured — go straight to date with no doctor filter
    const conv = getState(tenantId, phone)!;
    conv.data.doctorId = null;
    conv.data.doctorName = null;
    conv.data.specialty = null;
    setState(tenantId, phone, 'IDLE', conv.data);
    return showDates(tenantId, phone);
  }

  if (specialties.length === 1) {
    // Only one specialty — auto-select
    const spec = specialties[0];
    const docs = specialtyMap.get(spec)!;
    const conv = getState(tenantId, phone)!;
    conv.data.specialty = spec;
    conv.data.specialtyDoctors = docs;

    if (docs.length === 1) {
      conv.data.doctorId = docs[0].id;
      conv.data.doctorName = docs[0].name;
      setState(tenantId, phone, 'IDLE', conv.data);
      return showDates(tenantId, phone);
    }

    setState(tenantId, phone, 'SCHED_DOCTOR', conv.data);
    const list = docs.map((d, i) => `${i + 1} - ${d.name}`).join('\n');
    return {
      type: 'text',
      text: `Escolha o medico:\n\n${list}\n\nResponda com o numero da opcao.`,
    };
  }

  const conv = getState(tenantId, phone)!;
  conv.data.specialtyList = specialties;
  conv.data.specialtyDoctorMap = Object.fromEntries(specialtyMap);
  setState(tenantId, phone, 'SCHED_SPECIALTY', conv.data);

  const list = specialties.map((s, i) => `${i + 1} - ${s}`).join('\n');
  return {
    type: 'text',
    text: `Qual especialidade voce deseja?\n\nEspecialidades disponiveis:\n${list}\n\nResponda com o numero da opcao.`,
  };
}

async function handleSchedSpecialty(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;
  const list = conv.data.specialtyList as string[];
  const num = parseInt(text.trim());

  if (isNaN(num) || num < 1 || num > list.length) {
    return { type: 'text', text: `Opcao invalida. Escolha de 1 a ${list.length}.` };
  }

  const selected = list[num - 1];
  const docs = conv.data.specialtyDoctorMap[selected] as Array<{ id: string; name: string; horarios: any; duracaoConsulta: number | null }>;
  conv.data.specialty = selected;
  conv.data.specialtyDoctors = docs;

  if (docs.length === 1) {
    conv.data.doctorId = docs[0].id;
    conv.data.doctorName = docs[0].name;
    setState(tenantId, phone, 'IDLE', conv.data);
    return showDates(tenantId, phone);
  }

  setState(tenantId, phone, 'SCHED_DOCTOR', conv.data);
  const docList = docs.map((d, i) => `${i + 1} - ${d.name}`).join('\n');
  return {
    type: 'text',
    text: `Escolha o medico:\n\n${docList}\n\nResponda com o numero da opcao.`,
  };
}

async function handleSchedDoctor(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;
  const docs = conv.data.specialtyDoctors as Array<{ id: string; name: string }>;
  const num = parseInt(text.trim());

  if (isNaN(num) || num < 1 || num > docs.length) {
    return { type: 'text', text: `Opcao invalida. Escolha de 1 a ${docs.length}.` };
  }

  const selected = docs[num - 1];
  conv.data.doctorId = selected.id;
  conv.data.doctorName = selected.name;
  setState(tenantId, phone, 'IDLE', conv.data);
  return showDates(tenantId, phone);
}

// ============================================================
// Date selection — filtered by doctor's working days
// ============================================================

const DAYS_PT = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
const DAY_KEYS_MAP = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

async function showDates(tenantId: string, phone: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;
  const doctorId = conv.data.doctorId as string | null;

  // Load doctor's working hours to filter days
  let doctorHorarios: any = null;
  let durationMin = 30;
  if (doctorId) {
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { horarios: true, duracaoConsulta: true },
    });
    if (doctor?.horarios) doctorHorarios = doctor.horarios;
    if (doctor?.duracaoConsulta) durationMin = doctor.duracaoConsulta;
  }

  // Fall back to tenant hours
  let tenantHorarios: any = null;
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (settings?.horarios) tenantHorarios = settings.horarios;
  if (!durationMin && settings?.duracaoConsultaPadrao) durationMin = settings.duracaoConsultaPadrao;

  const horarios = doctorHorarios || tenantHorarios;

  // Generate next 14 days, filter by doctor's active days
  const SP_OFFSET_VAL = '-03:00';
  const now = new Date();
  const todaySP = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const baseDate = new Date(`${todaySP}T12:00:00${SP_OFFSET_VAL}`);

  const availableDates: Array<{ date: string; dayOfWeek: number; label: string }> = [];

  for (let i = 1; i <= 30 && availableDates.length < 14; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dayOfWeek = d.getDay();
    const dayKey = DAY_KEYS_MAP[dayOfWeek];

    // Check if doctor works this day
    if (horarios && horarios[dayKey]) {
      if (!horarios[dayKey].ativo) continue;
    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue; // Default: skip weekends
    }

    const dateStr = new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Check if there are available slots on this date
    const slots = await schedulingService.getAvailableSlots(dateStr, doctorId, tenantId);
    const freeSlots = slots.filter(s => s.available);
    if (freeSlots.length === 0) continue;

    const parts = dateStr.split('-');
    const label = `${DAYS_PT[dayOfWeek]}, ${parts[2]}/${parts[1]}`;

    availableDates.push({ date: dateStr, dayOfWeek, label });
  }

  if (availableDates.length === 0) {
    clearState(tenantId, phone);
    return {
      type: 'text',
      text: 'Desculpe, nao ha datas disponiveis no momento. Tente novamente mais tarde.',
    };
  }

  conv.data.availableDates = availableDates;
  conv.data.durationMin = durationMin;
  setState(tenantId, phone, 'SCHED_DATE', conv.data);

  const list = availableDates.map((d, i) => `${i + 1} - ${d.label}`).join('\n');
  return {
    type: 'text',
    text: `Escolha a data desejada:\n\n${list}\n\nResponda com o numero da opcao.`,
  };
}

async function handleSchedDate(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;
  const dates = conv.data.availableDates as Array<{ date: string; dayOfWeek: number; label: string }>;
  const num = parseInt(text.trim());

  if (isNaN(num) || num < 1 || num > dates.length) {
    return { type: 'text', text: `Opcao invalida. Escolha de 1 a ${dates.length}.` };
  }

  const selected = dates[num - 1];
  conv.data.selectedDate = selected.date;
  conv.data.selectedDateLabel = selected.label;
  setState(tenantId, phone, 'SCHED_PERIOD', conv.data);

  return {
    type: 'text',
    text: 'Prefere horario de manha ou tarde?\n\n1 - Manha\n2 - Tarde',
  };
}

async function handleSchedPeriod(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const n = text.trim();
  let period: 'morning' | 'afternoon';

  if (n === '1' || n.toLowerCase().includes('manha') || n.toLowerCase().includes('manhã')) {
    period = 'morning';
  } else if (n === '2' || n.toLowerCase().includes('tarde')) {
    period = 'afternoon';
  } else {
    return { type: 'text', text: 'Responda com 1 (Manha) ou 2 (Tarde).' };
  }

  const conv = getState(tenantId, phone)!;
  conv.data.period = period;

  const slots = await schedulingService.getAvailableSlots(conv.data.selectedDate, conv.data.doctorId, conv.data.tenantId || tenantId);
  const available = slots.filter(s => {
    if (!s.available) return false;
    const hour = parseInt(s.time.split(':')[0]);
    return period === 'morning' ? hour < 12 : hour >= 12;
  });

  if (available.length === 0) {
    return {
      type: 'text',
      text: `Nao ha horarios disponiveis ${period === 'morning' ? 'de manha' : 'a tarde'} nesta data.\n\nPrefere horario de manha ou tarde?\n\n1 - Manha\n2 - Tarde`,
    };
  }

  conv.data.availableSlots = available;
  setState(tenantId, phone, 'SCHED_TIME', conv.data);

  const periodLabel = period === 'morning' ? 'manha' : 'tarde';
  const list = available.map((s, i) => `${i + 1} - ${s.time}`).join('\n');
  return {
    type: 'text',
    text: `Horarios disponiveis (${periodLabel}) para ${conv.data.selectedDateLabel}:\n\n${list}\n\nResponda com o numero do horario desejado.`,
  };
}

async function handleSchedTime(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;
  const slots = conv.data.availableSlots as Array<{ time: string; available: boolean }>;
  const num = parseInt(text.trim());

  if (isNaN(num) || num < 1 || num > slots.length) {
    return { type: 'text', text: `Opcao invalida. Escolha de 1 a ${slots.length}.` };
  }

  const selected = slots[num - 1];
  conv.data.selectedTime = selected.time;
  setState(tenantId, phone, 'SCHED_CONFIRM', conv.data);

  const doctorLine = conv.data.doctorName ? `\n👨‍⚕️ ${conv.data.doctorName}${conv.data.specialty ? ` (${conv.data.specialty})` : ''}` : '';
  const paymentLine = conv.data.paymentType === 'CONVENIO' && conv.data.convenioName
    ? `\n💳 ${conv.data.convenioName}`
    : '\n💳 Particular';

  return {
    type: 'text',
    text: `Confirme seu agendamento:\n\n` +
          `📅 ${conv.data.selectedDateLabel} as ${selected.time}` +
          doctorLine +
          paymentLine +
          `\n\n1 - Confirmar ✅\n2 - Cancelar ❌`,
  };
}

async function handleSchedConfirm(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const n = text.trim();

  if (n === '2' || n.toLowerCase().includes('cancelar')) {
    clearState(tenantId, phone);
    return { type: 'text', text: 'Agendamento cancelado. Se precisar, e so mandar mensagem novamente!' };
  }

  if (n !== '1' && !n.toLowerCase().includes('confirmar')) {
    return { type: 'text', text: 'Responda com 1 (Confirmar) ou 2 (Cancelar).' };
  }

  const conv = getState(tenantId, phone)!;

  try {
    const customer = conv.customerId
      ? await prisma.customer.findUnique({ where: { id: conv.customerId } })
      : await findCustomer(tenantId, phone);

    if (!customer) {
      clearState(tenantId, phone);
      return { type: 'text', text: 'Erro ao encontrar seus dados. Envie qualquer mensagem para recomecar.' };
    }

    await schedulingService.bookCall({
      name: customer.name,
      email: customer.email ?? undefined,
      phone,
      date: conv.data.selectedDate,
      time: conv.data.selectedTime,
      doctorId: conv.data.doctorId || undefined,
      paymentType: conv.data.paymentType || 'PARTICULAR',
      convenioId: conv.data.convenioId || undefined,
      notes: `Agendado via WhatsApp`,
    }, tenantId);

    // Get tenant address for confirmation message
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, address: true },
    });

    clearState(tenantId, phone);

    const doctorLine = conv.data.doctorName ? `\n👨‍⚕️ ${conv.data.doctorName}` : '';
    const addressLine = tenant?.address ? `\n\n📍 Endereco: ${tenant.address}` : '';

    return {
      type: 'text',
      text: `Agendamento confirmado! ✅\n\n` +
            `📅 ${conv.data.selectedDateLabel} as ${conv.data.selectedTime}` +
            doctorLine +
            addressLine +
            `\n\nVoce recebera um lembrete antes da consulta. Ate la! 😊`,
    };
  } catch (err: any) {
    console.error('[FLOW] Booking error:', err);
    if (err.code === 'SLOT_TAKEN') {
      setState(tenantId, phone, 'IDLE', {});
      return {
        type: 'text',
        text: 'Desculpe, este horario acabou de ser ocupado. Vamos tentar outro?\n\n1 - Agendar consulta\n2 - Falar com atendente',
      };
    }
    clearState(tenantId, phone);
    return { type: 'text', text: 'Ocorreu um erro ao agendar. Tente novamente enviando qualquer mensagem.' };
  }
}

// ============================================================
// Helpers
// ============================================================

async function findCustomer(tenantId: string, phone: string) {
  return prisma.customer.findFirst({
    where: {
      tenantId,
      phone: { contains: phone.slice(-8) },
      isActive: true,
    },
  });
}

function validateCpf(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleaned)) return false;
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
