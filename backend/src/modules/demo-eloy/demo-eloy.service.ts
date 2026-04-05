import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import prisma from '../../config/database';

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

// The Eloy demo uses the "Clinica Saude Total" tenant (CLINICA_OFTALMOLOGICA)
const ELOY_TENANT_ID = 'cmnjmu0jm0001o30p9jaqj4ys';
const MAX_MESSAGES = 40;
const SP_OFFSET = '-03:00';

// Scheduling steps in order
type Step = 'idle' | 'name' | 'name_confirm' | 'phone' | 'phone_confirm'
  | 'cpf' | 'cpf_confirm' | 'email' | 'email_confirm'
  | 'address' | 'address_confirm' | 'insurance' | 'insurance_confirm'
  | 'date' | 'date_confirm' | 'time' | 'time_confirm'
  | 'final_confirm' | 'done';

interface SchedulingData {
  name?: string;
  phone?: string;
  cpf?: string;
  email?: string;
  address?: string;
  insurance?: string;
  date?: string;
  time?: string;
}

// Session state sent by the frontend and returned by the backend (stateless)
interface SessionState {
  step: Step;
  data: SchedulingData;
}

interface ChatRequest {
  message: string;
  sessionData?: SessionState;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface ChatResponse {
  reply: string;
  buttons?: Array<{ id: string; label: string }>;
  currentStep?: string;
  inputHint?: 'text' | 'phone' | 'cpf' | 'email' | 'date';
  sessionData: SessionState;
}

// Format CPF
function formatCPF(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Format phone
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

// Validate CPF digits
function isValidCPF(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (Number(d[9]) !== check) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return Number(d[10]) === check;
}

const SYSTEM_PROMPT = `Voce e Ana, atendente virtual da Clinica Dr. Eloy Chicata, oftalmologia em Para de Minas/MG.

REGRAS ABSOLUTAS:
- NUNCA faca mais de uma pergunta por mensagem
- NUNCA pergunte o motivo da consulta ou historico medico durante o agendamento
- NUNCA faca perguntas desnecessarias
- Seja DIRETA e OBJETIVA sempre
- Maximo 2 linhas por resposta
- Tom: simpatico e profissional

FLUXO DE AGENDAMENTO:
Quando o paciente quiser agendar, voce coleta UM dado por vez. O sistema controla os passos automaticamente.
Voce apenas responde de forma natural e curta conforme o dado solicitado.

OUTROS FLUXOS:
- "Urgencia / Problema ocular" ou problema de visao: "Para urgencias ligue: (37) 3231-1234. Seg a Sex 8h as 18h."
- "Conhecer os tratamentos" ou perguntas sobre especialidades: liste especialidades em ate 3 linhas e ofereca agendar
- "Tenho uma duvida" ou duvidas gerais: responda diretamente sem perguntas desnecessarias

Especialidades: Catarata, Glaucoma, Retina, Cirurgia Refrativa, Lentes de Contato, Oftalmopediatria.

Responda sempre em portugues brasileiro. Maximo 2 linhas.`;

const INSURANCE_OPTIONS = ['Particular', 'Bradesco Saude', 'SulAmerica', 'Unimed', 'Outro'];
const TIME_OPTIONS = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

// Detect if user wants to schedule from free-text
function wantsToSchedule(text: string): boolean {
  const lower = text.toLowerCase();
  return /agend|consult|marc|hora|agendar|marcar/.test(lower);
}

// Handle the structured scheduling flow without AI calls
// Mutates state in-place and returns response (state is owned by caller)
function handleSchedulingStep(state: SessionState, userMessage: string): Omit<ChatResponse, 'sessionData'> | null {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();

  switch (state.step) {
    case 'name':
      if (msg.length < 3) return { reply: 'Por favor, digite seu nome completo.', currentStep: 'name', inputHint: 'text' };
      state.data.name = msg;
      state.step = 'name_confirm';
      return { reply: `Seu nome e ${msg}, correto?`, buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Corrigir' }], currentStep: 'name_confirm' };

    case 'name_confirm':
      if (lower === 'sim' || lower === 'yes' || msg === 'Sim') {
        state.step = 'phone';
        return { reply: 'Qual e o seu telefone com DDD?', currentStep: 'phone', inputHint: 'phone' };
      }
      state.step = 'name';
      return { reply: 'Qual e o seu nome completo?', currentStep: 'name', inputHint: 'text' };

    case 'phone': {
      const digits = msg.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) return { reply: 'Telefone invalido. Digite com DDD (ex: 37 99999-1234).', currentStep: 'phone', inputHint: 'phone' };
      state.data.phone = formatPhone(digits);
      state.step = 'phone_confirm';
      return { reply: `Telefone ${state.data.phone}, correto?`, buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Corrigir' }], currentStep: 'phone_confirm' };
    }

    case 'phone_confirm':
      if (lower === 'sim' || lower === 'yes' || msg === 'Sim') {
        state.step = 'cpf';
        return { reply: 'Qual e o seu CPF?', currentStep: 'cpf', inputHint: 'cpf' };
      }
      state.step = 'phone';
      return { reply: 'Qual e o seu telefone com DDD?', currentStep: 'phone', inputHint: 'phone' };

    case 'cpf': {
      const digits = msg.replace(/\D/g, '');
      if (digits.length !== 11 || !isValidCPF(digits)) return { reply: 'CPF invalido. Digite os 11 digitos.', currentStep: 'cpf', inputHint: 'cpf' };
      state.data.cpf = formatCPF(digits);
      state.step = 'cpf_confirm';
      return { reply: `CPF ${state.data.cpf}, correto?`, buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Corrigir' }], currentStep: 'cpf_confirm' };
    }

    case 'cpf_confirm':
      if (lower === 'sim' || lower === 'yes' || msg === 'Sim') {
        state.step = 'email';
        return { reply: 'Qual e o seu e-mail?', currentStep: 'email', inputHint: 'email' };
      }
      state.step = 'cpf';
      return { reply: 'Qual e o seu CPF?', currentStep: 'cpf', inputHint: 'cpf' };

    case 'email': {
      if (!msg.includes('@') || !msg.includes('.')) return { reply: 'E-mail invalido. Ex: seu@email.com', currentStep: 'email', inputHint: 'email' };
      state.data.email = msg.toLowerCase();
      state.step = 'email_confirm';
      return { reply: `E-mail ${state.data.email}, correto?`, buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Corrigir' }], currentStep: 'email_confirm' };
    }

    case 'email_confirm':
      if (lower === 'sim' || lower === 'yes' || msg === 'Sim') {
        state.step = 'address';
        return { reply: 'Qual e o seu endereco completo? (rua, numero, cidade)', currentStep: 'address', inputHint: 'text' };
      }
      state.step = 'email';
      return { reply: 'Qual e o seu e-mail?', currentStep: 'email', inputHint: 'email' };

    case 'address':
      if (msg.length < 5) return { reply: 'Por favor, informe o endereco completo.', currentStep: 'address', inputHint: 'text' };
      state.data.address = msg;
      state.step = 'address_confirm';
      return { reply: `Endereco: ${msg}, correto?`, buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Corrigir' }], currentStep: 'address_confirm' };

    case 'address_confirm':
      if (lower === 'sim' || lower === 'yes' || msg === 'Sim') {
        state.step = 'insurance';
        return {
          reply: 'Voce possui convenio ou sera particular?',
          buttons: INSURANCE_OPTIONS.map(o => ({ id: o.toLowerCase().replace(/\s/g, '_'), label: o })),
          currentStep: 'insurance',
        };
      }
      state.step = 'address';
      return { reply: 'Qual e o seu endereco completo?', currentStep: 'address', inputHint: 'text' };

    case 'insurance': {
      const matched = INSURANCE_OPTIONS.find(o => o.toLowerCase() === lower || o.toLowerCase().replace(/\s/g, '_') === lower);
      state.data.insurance = matched || msg;
      state.step = 'insurance_confirm';
      return { reply: `Convenio: ${state.data.insurance}, correto?`, buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Corrigir' }], currentStep: 'insurance_confirm' };
    }

    case 'insurance_confirm':
      if (lower === 'sim' || lower === 'yes' || msg === 'Sim') {
        state.step = 'date';
        return { reply: 'Qual data prefere para a consulta? (ex: 15/05/2026)', currentStep: 'date', inputHint: 'date' };
      }
      state.step = 'insurance';
      return {
        reply: 'Voce possui convenio ou sera particular?',
        buttons: INSURANCE_OPTIONS.map(o => ({ id: o.toLowerCase().replace(/\s/g, '_'), label: o })),
        currentStep: 'insurance',
      };

    case 'date': {
      let dateStr = '';
      const ddmm = msg.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
      if (ddmm) {
        dateStr = `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`;
      } else {
        const iso = msg.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
        if (iso) dateStr = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
      }
      if (!dateStr) return { reply: 'Data invalida. Use o formato DD/MM/AAAA (ex: 15/05/2026).', currentStep: 'date', inputHint: 'date' };

      const d = new Date(`${dateStr}T12:00:00${SP_OFFSET}`);
      if (isNaN(d.getTime())) return { reply: 'Data invalida. Use o formato DD/MM/AAAA.', currentStep: 'date', inputHint: 'date' };
      if (d < new Date()) return { reply: 'A data precisa ser futura. Qual data prefere?', currentStep: 'date', inputHint: 'date' };

      const day = d.getDay();
      if (day === 0 || day === 6) return { reply: 'Atendemos apenas de segunda a sexta. Escolha outra data.', currentStep: 'date', inputHint: 'date' };

      state.data.date = dateStr;
      const formatted = `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}/${dateStr.slice(0, 4)}`;
      state.step = 'date_confirm';
      return { reply: `Data ${formatted}, correto?`, buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Corrigir' }], currentStep: 'date_confirm' };
    }

    case 'date_confirm':
      if (lower === 'sim' || lower === 'yes' || msg === 'Sim') {
        state.step = 'time';
        return {
          reply: 'Qual horario prefere? Temos das 8h as 18h (intervalo 12h-13h).',
          buttons: TIME_OPTIONS.map(t => ({ id: t, label: t })),
          currentStep: 'time',
        };
      }
      state.step = 'date';
      return { reply: 'Qual data prefere? (ex: 15/05/2026)', currentStep: 'date', inputHint: 'date' };

    case 'time': {
      const matched = TIME_OPTIONS.find(t => t === msg || msg.includes(t));
      if (!matched) return {
        reply: 'Horario invalido. Escolha um dos horarios disponiveis.',
        buttons: TIME_OPTIONS.map(t => ({ id: t, label: t })),
        currentStep: 'time',
      };
      state.data.time = matched;
      state.step = 'time_confirm';
      return { reply: `Horario ${matched}, correto?`, buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Corrigir' }], currentStep: 'time_confirm' };
    }

    case 'time_confirm':
      if (lower === 'sim' || lower === 'yes' || msg === 'Sim') {
        state.step = 'final_confirm';
        const d = state.data;
        const dateFormatted = d.date ? `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)}` : '';
        return {
          reply: `Resumo do agendamento:\n\n` +
            `Nome: ${d.name}\n` +
            `Tel: ${d.phone}\n` +
            `CPF: ${d.cpf}\n` +
            `Email: ${d.email}\n` +
            `Endereco: ${d.address}\n` +
            `Convenio: ${d.insurance}\n` +
            `Data: ${dateFormatted} as ${d.time}\n\n` +
            `Confirma o agendamento?`,
          buttons: [{ id: 'confirm', label: 'Sim, confirmar' }, { id: 'correct', label: 'Corrigir algo' }],
          currentStep: 'final_confirm',
        };
      }
      state.step = 'time';
      return {
        reply: 'Qual horario prefere?',
        buttons: TIME_OPTIONS.map(t => ({ id: t, label: t })),
        currentStep: 'time',
      };

    case 'final_confirm':
      // Handled separately in chat() to do DB operations
      return null;

    case 'done':
      return { reply: 'Seu agendamento ja foi confirmado! Se precisar de algo mais, estou aqui.', currentStep: 'done' };

    default:
      return null;
  }
}

async function finalizeAppointment(data: SchedulingData): Promise<{ callId: string }> {
  const d = data;

  // Find or create customer
  const phoneSuffix = (d.phone || '').replace(/\D/g, '').slice(-8);
  let customer = phoneSuffix.length >= 8
    ? await prisma.customer.findFirst({ where: { tenantId: ELOY_TENANT_ID, phone: { contains: phoneSuffix } } })
    : null;

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId: ELOY_TENANT_ID,
        name: d.name!,
        phone: d.phone,
        cpfCnpj: d.cpf,
        email: d.email,
        insurance: d.insurance,
        address: d.address ? { full: d.address } : undefined,
        origin: 'demo_eloy_chat',
        optInWhatsApp: true,
      },
    });
  }

  // Create scheduled call
  const callDate = new Date(`${d.date}T${d.time}:00${SP_OFFSET}`);
  const call = await prisma.scheduledCall.create({
    data: {
      tenantId: ELOY_TENANT_ID,
      customerId: customer.id,
      name: d.name!,
      phone: d.phone!,
      email: d.email,
      date: callDate,
      duration: 30,
      status: 'scheduled',
      notes: `Convenio: ${d.insurance || 'Nao informado'}. Agendado via demo chat.`,
    },
  });

  return { callId: call.id };
}

// Valid steps to prevent tampering
const VALID_STEPS: Set<string> = new Set([
  'idle', 'name', 'name_confirm', 'phone', 'phone_confirm',
  'cpf', 'cpf_confirm', 'email', 'email_confirm',
  'address', 'address_confirm', 'insurance', 'insurance_confirm',
  'date', 'date_confirm', 'time', 'time_confirm',
  'final_confirm', 'done',
]);

function sanitizeSessionData(raw?: any): SessionState {
  if (!raw || typeof raw !== 'object') return { step: 'idle', data: {} };
  const step = VALID_STEPS.has(raw.step) ? raw.step as Step : 'idle';
  const d = raw.data && typeof raw.data === 'object' ? raw.data : {};
  return {
    step,
    data: {
      name: typeof d.name === 'string' ? d.name.slice(0, 200) : undefined,
      phone: typeof d.phone === 'string' ? d.phone.slice(0, 30) : undefined,
      cpf: typeof d.cpf === 'string' ? d.cpf.slice(0, 20) : undefined,
      email: typeof d.email === 'string' ? d.email.slice(0, 100) : undefined,
      address: typeof d.address === 'string' ? d.address.slice(0, 300) : undefined,
      insurance: typeof d.insurance === 'string' ? d.insurance.slice(0, 100) : undefined,
      date: typeof d.date === 'string' ? d.date.slice(0, 10) : undefined,
      time: typeof d.time === 'string' ? d.time.slice(0, 5) : undefined,
    },
  };
}

export const demoEloyService = {
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const trimmed = req.message.trim();
    const state = sanitizeSessionData(req.sessionData);
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(req.history)
      ? req.history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-MAX_MESSAGES)
      : [];

    // Add the current user message to history for AI calls
    history.push({ role: 'user', content: trimmed });

    // If in scheduling flow (not idle), handle structured steps
    if (state.step !== 'idle') {
      // Handle final confirmation
      if (state.step === 'final_confirm') {
        const lower = trimmed.toLowerCase();
        if (lower === 'sim, confirmar' || lower === 'sim' || lower === 'confirm' || lower === 'yes') {
          try {
            const { callId } = await finalizeAppointment(state.data);
            state.step = 'done';
            const reply = `Agendamento confirmado! Protocolo: ${callId.slice(-8).toUpperCase()}\n\nNossa equipe entrara em contato para confirmar. Ate breve!`;
            return { reply, currentStep: 'done', sessionData: state };
          } catch (err: any) {
            console.error('[DEMO-ELOY] Appointment error:', err.message);
            const reply = 'Desculpe, houve um erro ao confirmar o agendamento. Tente novamente.';
            return { reply, currentStep: 'final_confirm', buttons: [{ id: 'confirm', label: 'Sim, confirmar' }, { id: 'correct', label: 'Corrigir algo' }], sessionData: state };
          }
        } else {
          state.step = 'name';
          const reply = 'Sem problema! Vamos corrigir. Qual e o seu nome completo?';
          return { reply, currentStep: 'name', inputHint: 'text', sessionData: state };
        }
      }

      const stepResult = handleSchedulingStep(state, trimmed);
      if (stepResult) {
        return { ...stepResult, sessionData: state };
      }
    }

    // Check if user wants to schedule
    if (state.step === 'idle' && wantsToSchedule(trimmed)) {
      state.step = 'name';
      const reply = 'Otimo! Vamos agendar sua consulta. Qual e o seu nome completo?';
      return { reply, currentStep: 'name', inputHint: 'text', sessionData: state };
    }

    // Free-text: use Claude for general questions
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: history.map(m => ({ role: m.role, content: m.content })),
      });

      const reply = response.content[0]?.type === 'text'
        ? response.content[0].text
        : 'Desculpe, nao consegui responder. Pode repetir?';

      const buttons = wantsToSchedule(reply)
        ? [{ id: 'schedule', label: 'Agendar consulta' }]
        : undefined;

      return { reply, buttons, currentStep: 'idle', sessionData: state };
    } catch (err: any) {
      console.error('[DEMO-ELOY] AI error:', err.message);
      return { reply: 'Desculpe, estou com dificuldades tecnicas. Tente novamente em instantes.', sessionData: state };
    }
  },
};
