import prisma from '../../config/database';
import { schedulingService } from '../scheduling/scheduling.service';

// ============================================================
// Conversation state machine for WhatsApp chatbot
// Deterministic flow — no AI. Only handles scheduling.
//
// Flow:
//   Entry → Menu (agendar / atendente)
//   → Registration (new patient): Name → Payment → Convenio? → Confirm → Scheduling
//   → Scheduling (existing patient): Payment → Convenio? → Specialty → Doctor → Date → Period → Time → Confirm
// ============================================================

export type FlowState =
  | 'IDLE'
  | 'MENU'
  // Registration (simplified)
  | 'REG_NAME'
  | 'REG_PAYMENT'
  | 'REG_CONVENIO'
  | 'REG_CONFIRM'
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

const STATE_TTL = 10 * 60 * 1000; // 10 minutes
const conversations = new Map<string, ConversationState>();

function key(tenantId: string, phone: string) {
  return `${tenantId}:${phone}`;
}

export function hasActiveFlow(tenantId: string, phone: string): boolean {
  const s = getState(tenantId, phone);
  return !!s && s.state !== 'IDLE';
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
    // Registration (simplified)
    case 'REG_NAME': return handleRegName(tenantId, phone, text);
    case 'REG_PAYMENT': return handleRegPayment(tenantId, phone, text);
    case 'REG_CONVENIO': return handleRegConvenio(tenantId, phone, text);
    case 'REG_CONFIRM': return handleRegConfirm(tenantId, phone, text);
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
// Registration flow — new patient (simplified: name + payment)
// ============================================================

function startRegistration(tenantId: string, phone: string): FlowResponse {
  setState(tenantId, phone, 'REG_NAME', { reg: {} });
  return { type: 'text', text: 'Vamos fazer seu cadastro rapidinho! 📋\n\nQual o seu nome completo?' };
}

function handleRegName(tenantId: string, phone: string, text: string): FlowResponse {
  if (text.length < 3) {
    return { type: 'text', text: 'Por favor, informe seu nome completo.' };
  }
  const conv = getState(tenantId, phone)!;
  conv.data.reg = { ...conv.data.reg, name: text.trim() };
  setState(tenantId, phone, 'REG_PAYMENT', conv.data);
  return {
    type: 'text',
    text: 'Como sera o pagamento da consulta?\n\n1 - Particular\n2 - Convenio',
  };
}

async function handleRegPayment(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const n = text.trim();
  if (n === '1' || n.toLowerCase().includes('particular')) {
    const conv = getState(tenantId, phone)!;
    conv.data.reg.paymentType = 'PARTICULAR';
    conv.data.reg.convenioId = null;
    conv.data.reg.convenioName = null;
    return showRegConfirmation(tenantId, phone);
  }

  if (n === '2' || n.toLowerCase().includes('convenio') || n.toLowerCase().includes('convênio')) {
    const convenios = await prisma.convenio.findMany({
      where: { tenantId, ativo: true },
      orderBy: { nome: 'asc' },
    });

    if (convenios.length === 0) {
      const conv = getState(tenantId, phone)!;
      conv.data.reg.paymentType = 'PARTICULAR';
      conv.data.reg.convenioId = null;
      conv.data.reg.convenioName = null;
      return showRegConfirmation(tenantId, phone);
    }

    const conv = getState(tenantId, phone)!;
    conv.data.reg.convenioList = convenios.map(c => ({ id: c.id, nome: c.nome }));
    setState(tenantId, phone, 'REG_CONVENIO', conv.data);

    const list = convenios.map((c, i) => `${i + 1} - ${c.nome}`).join('\n');
    return {
      type: 'text',
      text: `Qual o seu convenio?\n\n${list}\n\nResponda com o numero da opcao.`,
    };
  }

  return { type: 'text', text: 'Responda com 1 (Particular) ou 2 (Convenio).' };
}

function handleRegConvenio(tenantId: string, phone: string, text: string): FlowResponse {
  const conv = getState(tenantId, phone)!;
  const list = conv.data.reg.convenioList as Array<{ id: string; nome: string }>;
  const num = parseInt(text.trim());

  if (isNaN(num) || num < 1 || num > list.length) {
    return { type: 'text', text: `Opcao invalida. Escolha de 1 a ${list.length}.` };
  }

  const selected = list[num - 1];
  conv.data.reg.paymentType = 'CONVENIO';
  conv.data.reg.convenioId = selected.id;
  conv.data.reg.convenioName = selected.nome;
  return showRegConfirmation(tenantId, phone);
}

function showRegConfirmation(tenantId: string, phone: string): FlowResponse {
  const conv = getState(tenantId, phone)!;
  const r = conv.data.reg;

  const paymentLine = r.paymentType === 'CONVENIO' && r.convenioName
    ? `Convenio: ${r.convenioName}`
    : 'Pagamento: Particular';

  setState(tenantId, phone, 'REG_CONFIRM', conv.data);
  return {
    type: 'text',
    text: `Confirme seus dados:\n\n` +
          `Nome: ${r.name}\n` +
          `${paymentLine}\n\n` +
          `1 - Confirmar ✅\n` +
          `2 - Corrigir nome 🔄`,
  };
}

async function handleRegConfirm(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const n = text.trim();

  if (n === '2' || n.toLowerCase().includes('corrigir')) {
    setState(tenantId, phone, 'REG_NAME', getState(tenantId, phone)!.data);
    return { type: 'text', text: 'Qual o seu nome completo?' };
  }

  if (n === '1' || n.toLowerCase().includes('confirmar')) {
    const conv = getState(tenantId, phone)!;
    const r = conv.data.reg;

    try {
      const customer = await prisma.customer.create({
        data: {
          tenantId,
          name: r.name,
          phone,
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

      // Carry payment data to scheduling
      setState(tenantId, phone, 'IDLE', {
        paymentType: r.paymentType,
        convenioId: r.convenioId || null,
        convenioName: r.convenioName || null,
      }, customer.id);

      // Skip payment step — go straight to specialty
      return showSpecialties(tenantId, phone);
    } catch (err: any) {
      console.error('[FLOW] Error saving customer:', err.message);
      return { type: 'text', text: 'Ocorreu um erro ao salvar seus dados. Tente novamente enviando qualquer mensagem.' };
    }
  }

  return { type: 'text', text: 'Responda com 1 (Confirmar) ou 2 (Corrigir nome).' };
}

// ============================================================
// Scheduling flow — existing patients
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
  const doctors = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      isProvider: true,
      especialidade: { not: null },
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
    const conv = getState(tenantId, phone)!;
    conv.data.doctorId = null;
    conv.data.doctorName = null;
    conv.data.specialty = null;
    setState(tenantId, phone, 'IDLE', conv.data);
    return showDates(tenantId, phone);
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

  setState(tenantId, phone, 'SCHED_DOCTOR', conv.data);
  const docList = docs.map((d, i) => `${i + 1} - Dr(a). ${d.name}`).join('\n');
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

  let tenantHorarios: any = null;
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (settings?.horarios) tenantHorarios = settings.horarios;
  if (!durationMin && settings?.duracaoConsultaPadrao) durationMin = settings.duracaoConsultaPadrao;

  const horarios = doctorHorarios || tenantHorarios;

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

    if (horarios && horarios[dayKey]) {
      if (!horarios[dayKey].ativo) continue;
    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    const dateStr = new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
    let customer = conv.customerId
      ? await prisma.customer.findFirst({ where: { id: conv.customerId, tenantId, isActive: true } })
      : null;

    if (!customer) {
      customer = await findCustomer(tenantId, phone);
    }

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
  const suffix = phone.replace(/\D/g, '').slice(-8);
  const matches = await prisma.customer.findMany({
    where: {
      tenantId,
      phone: { contains: suffix },
      isActive: true,
    },
    select: { id: true, name: true, responsavelId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (matches.length === 0) return null;
  // Prefer the customer who is a responsavel (has no responsavelId) — i.e. the titular
  const titular = matches.find(c => !c.responsavelId);
  const chosen = titular || matches[0];
  return prisma.customer.findUnique({ where: { id: chosen.id } });
}
