import prisma from '../../config/database';
import { schedulingService } from '../scheduling/scheduling.service';
import {
  isCollecting,
  handleCollectionMessage,
} from './data-collection.service';

// ============================================================
// Conversation state machine for WhatsApp chatbot
// Uses interactive buttons and lists via Evolution API v1.8.2
//
// Data collection (name, birthDate, CPF, email) is handled by
// data-collection.service.ts with AI extraction + confirmation.
// This file handles menu, booking, cancellation, and view flows.
// ============================================================

export type FlowState =
  | 'IDLE'
  | 'MENU'
  | 'BOOK_DATE'
  | 'BOOK_TIME'
  | 'BOOK_CONFIRM'
  | 'VIEW_APPOINTMENT'
  | 'CANCEL_SELECT'
  | 'CANCEL_CONFIRM';

interface ConversationState {
  state: FlowState;
  tenantId: string;
  phone: string;
  customerId?: string;
  data: Record<string, any>;
  expiresAt: number;
}

const STATE_TTL = 30 * 60 * 1000; // 30 minutes
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
// Response types — text, buttons, or list
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
// Flow handler — returns FlowResponse or null (fall through to AI)
// ============================================================

export async function handleConversationFlow(
  tenantId: string,
  phone: string,
  senderName: string,
  messageText: string,
): Promise<FlowResponse | null> {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  // Normalize button responses
  const normalized = textLower
    .replace(/^btn_/, '')
    .replace(/ /g, '_');

  // ---- DATA COLLECTION INTERCEPT ----
  // If there's an active data collection, ALL messages go through it first.
  const collecting = await isCollecting(tenantId, phone);
  if (collecting) {
    const result = await handleCollectionMessage(tenantId, phone, text);
    if (result) return result;
  }

  const conv = getState(tenantId, phone);

  // Check if user wants to go back to menu
  if (['menu', 'voltar', 'inicio', '0', 'ok_obrigado', 'obrigado', 'ok, obrigado'].includes(textLower) ||
      normalized === 'ok_obrigado') {
    const customer = await findCustomer(tenantId, phone);
    if (customer) {
      setState(tenantId, phone, 'MENU', {}, customer.id);
      return buildMenuResponse(customer.name);
    }
  }

  // Handle global button replies that can come from notifications
  if (['agendar consulta', 'agendar agora', 'agendar retorno', 'quero agendar',
       'agendar nova consulta', 'btn_rebook', 'btn_book'].includes(textLower) ||
      normalized === 'agendar_consulta' || normalized === 'agendar_agora' ||
      normalized === 'agendar_retorno' || normalized === 'quero_agendar' ||
      normalized === 'agendar_nova_consulta') {
    const customer = await findCustomer(tenantId, phone);
    if (customer) {
      setState(tenantId, phone, 'MENU', {}, customer.id);
      return startBookingFlow(tenantId, phone);
    }
  }

  // No active conversation state — check if customer exists
  if (!conv || conv.state === 'IDLE') {
    const customer = await findCustomer(tenantId, phone);

    if (customer) {
      // Only show menu if user explicitly asks for it
      if (['menu', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'inicio', 'voltar'].includes(textLower)) {
        setState(tenantId, phone, 'MENU', {}, customer.id);
        return buildMenuResponse(customer.name, true);
      }
      // Otherwise fall through to AI for free-text questions.
      // Missing fields collection is triggered by AI intent detection in chatbot.service.ts.
      return null;
    } else {
      // New person — no customer record. Fall through to AI.
      // Registration only starts when AI detects patient intent ([START_REGISTRATION] token).
      return null;
    }
  }

  // Route based on current state
  switch (conv.state) {
    case 'MENU': return handleMenu(tenantId, phone, text, textLower, normalized);
    case 'BOOK_DATE': return handleBookDate(tenantId, phone, text);
    case 'BOOK_TIME': return handleBookTime(tenantId, phone, text);
    case 'BOOK_CONFIRM': return handleBookConfirm(tenantId, phone, text, textLower, normalized);
    case 'VIEW_APPOINTMENT': return handleViewAppointment(tenantId, phone, text);
    case 'CANCEL_SELECT': return handleCancelSelect(tenantId, phone, text);
    case 'CANCEL_CONFIRM': return handleCancelConfirm(tenantId, phone, text, textLower, normalized);
    default: return null;
  }
}

// ============================================================
// Menu
// ============================================================

function buildMenuResponse(name: string, greeting = false): FlowResponse {
  const text = greeting
    ? `Ola ${name}! Bem-vindo(a) de volta.\n\nComo posso te ajudar?`
    : 'Como posso te ajudar?';

  return {
    type: 'buttons',
    title: 'Menu principal',
    text,
    buttons: [
      { id: 'btn_book', text: 'Agendar consulta' },
      { id: 'btn_view', text: 'Ver consultas' },
      { id: 'btn_agent', text: 'Falar com atendente' },
    ],
  };
}

async function handleMenu(tenantId: string, phone: string, text: string, textLower: string, normalized: string): Promise<FlowResponse | null> {
  if (['1', 'agendar', 'agendar consulta', 'btn_book'].includes(textLower) ||
      normalized === 'agendar_consulta') {
    return startBookingFlow(tenantId, phone);
  }

  if (['2', 'ver', 'ver consulta', 'ver consultas', 'minha consulta', 'btn_view'].includes(textLower) ||
      normalized === 'ver_consultas') {
    return showAppointments(tenantId, phone);
  }

  if (['3', 'cancelar', 'cancelar consulta'].includes(textLower) ||
      normalized === 'cancelar_consulta') {
    return startCancelFlow(tenantId, phone);
  }

  if (['4', 'atendente', 'falar', 'falar com atendente', 'btn_agent', 'me ligue'].includes(textLower) ||
      normalized === 'falar_com_atendente' || normalized === 'me_ligue') {
    clearState(tenantId, phone);
    return { type: 'handoff', text: '' };
  }

  if (['conhecer a clinica', 'btn_info', 'conhecer'].includes(textLower) ||
      normalized === 'conhecer_a_clinica') {
    clearState(tenantId, phone);
    return null;
  }

  if (['nao obrigado', 'btn_no', 'nao, obrigado'].includes(textLower) ||
      normalized === 'nao_obrigado') {
    clearState(tenantId, phone);
    return { type: 'text', text: 'Tudo bem! Se precisar de algo, e so me chamar. Ate mais!' };
  }

  // Unrecognized text in MENU state — fall through to AI
  clearState(tenantId, phone);
  return null;
}

// ============================================================
// Booking flow
// ============================================================

async function startBookingFlow(tenantId: string, phone: string): Promise<FlowResponse> {
  try {
    const dates = await schedulingService.getAvailableDates();

    if (dates.length === 0) {
      setState(tenantId, phone, 'MENU', {});
      return {
        type: 'buttons',
        title: 'Sem disponibilidade',
        text: 'Desculpe, nao ha datas disponiveis no momento.',
        buttons: [{ id: 'btn_menu', text: 'Voltar ao menu' }],
      };
    }

    const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const available = dates.slice(0, 10);

    setState(tenantId, phone, 'BOOK_DATE', { availableDates: available });

    return {
      type: 'list',
      title: 'Agendamento',
      text: 'Escolha a data para sua consulta:',
      listButtonText: 'Ver datas disponiveis',
      listSections: [{
        title: 'Proximas datas',
        rows: available.map((d, i) => {
          const parts = d.date.split('-');
          return {
            id: `date_${i}`,
            title: `${daysOfWeek[d.dayOfWeek]} ${parts[2]}/${parts[1]}/${parts[0]}`,
            description: `${d.availableSlots} horarios disponiveis`,
          };
        }),
      }],
    };
  } catch (err) {
    console.error('[FLOW] Error getting available dates:', err);
    setState(tenantId, phone, 'MENU', {});
    return { type: 'text', text: 'Ocorreu um erro ao buscar as datas. Tente novamente em instantes.\n\nDigite *menu* para voltar.' };
  }
}

async function handleBookDate(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;
  const dates = conv.data.availableDates as Array<{ date: string; dayOfWeek: number; availableSlots: number }>;

  let index = -1;
  const idMatch = text.match(/^date_(\d+)$/i);
  if (idMatch) {
    index = parseInt(idMatch[1]);
  } else {
    const num = parseInt(text);
    if (!isNaN(num) && num >= 1 && num <= dates.length) index = num - 1;
  }

  if (index === -1) {
    const dateMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dateMatch) {
      const searchDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      index = dates.findIndex(d => d.date === searchDate);
    }
  }

  if (index < 0 || index >= dates.length) {
    return { type: 'text', text: `Opcao invalida. Escolha uma data da lista (1 a ${dates.length}).` };
  }

  const selectedDate = dates[index];

  try {
    const slots = await schedulingService.getAvailableSlots(selectedDate.date);
    const available = slots.filter(s => s.available);

    if (available.length === 0) {
      return { type: 'text', text: 'Desculpe, esta data ja nao tem horarios disponiveis. Escolha outra data.' };
    }

    const parts = selectedDate.date.split('-');
    const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;

    setState(tenantId, phone, 'BOOK_TIME', {
      selectedDate: selectedDate.date,
      selectedDateFormatted: formatted,
      availableSlots: available,
    });

    return {
      type: 'list',
      title: `Horarios - ${formatted}`,
      text: `Escolha o horario para ${formatted}:`,
      listButtonText: 'Ver horarios',
      listSections: [{
        title: 'Horarios disponiveis',
        rows: available.slice(0, 10).map((s, i) => ({
          id: `time_${i}`,
          title: s.time,
          description: `Horario disponivel`,
        })),
      }],
    };
  } catch (err) {
    console.error('[FLOW] Error getting slots:', err);
    return { type: 'text', text: 'Ocorreu um erro ao buscar os horarios. Tente novamente.' };
  }
}

async function handleBookTime(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;

  if (text.toLowerCase() === 'voltar' || text.toLowerCase() === 'btn_menu') {
    return startBookingFlow(tenantId, phone);
  }

  const slots = conv.data.availableSlots as Array<{ time: string; available: boolean }>;

  let index = -1;
  const idMatch = text.match(/^time_(\d+)$/i);
  if (idMatch) {
    index = parseInt(idMatch[1]);
  } else {
    const num = parseInt(text);
    if (!isNaN(num) && num >= 1 && num <= slots.length) index = num - 1;
  }

  if (index === -1) {
    const timeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const searchTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
      index = slots.findIndex(s => s.time === searchTime);
    }
  }

  if (index < 0 || index >= slots.length) {
    return { type: 'text', text: `Opcao invalida. Escolha um horario da lista (1 a ${slots.length}).` };
  }

  const selectedSlot = slots[index];
  setState(tenantId, phone, 'BOOK_CONFIRM', { selectedTime: selectedSlot.time });

  return {
    type: 'buttons',
    title: 'Confirmar agendamento',
    text: `Data: *${conv.data.selectedDateFormatted}*\nHorario: *${selectedSlot.time}*\n\nConfirma o agendamento?`,
    buttons: [
      { id: 'btn_yes', text: 'Confirmar' },
      { id: 'btn_no', text: 'Cancelar' },
    ],
  };
}

async function handleBookConfirm(tenantId: string, phone: string, text: string, textLower: string, normalized: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;

  if (['nao', 'não', 'n', 'cancelar', 'btn_no'].includes(textLower)) {
    setState(tenantId, phone, 'MENU', {});
    return buildMenuResponse('', false);
  }

  if (!['sim', 's', 'confirmar', 'ok', 'btn_yes'].includes(textLower)) {
    return {
      type: 'buttons',
      title: 'Confirmar?',
      text: 'Confirma o agendamento?',
      buttons: [
        { id: 'btn_yes', text: 'Confirmar' },
        { id: 'btn_no', text: 'Cancelar' },
      ],
    };
  }

  try {
    const customer = await prisma.customer.findUnique({ where: { id: conv.customerId! } });
    if (!customer) {
      setState(tenantId, phone, 'MENU', {});
      return { type: 'text', text: 'Erro ao encontrar seus dados. Digite *menu* para voltar.' };
    }

    await schedulingService.bookCall({
      name: customer.name,
      email: customer.email ?? undefined,
      phone,
      date: conv.data.selectedDate,
      time: conv.data.selectedTime,
      notes: `Agendado via WhatsApp - ${customer.name}`,
    });

    clearState(tenantId, phone);

    return {
      type: 'buttons',
      title: 'Consulta agendada!',
      text: `Data: *${conv.data.selectedDateFormatted}*\n` +
        `Horario: *${conv.data.selectedTime}*\n` +
        `Status: Confirmado\n\n` +
        `Voce recebera um lembrete antes da consulta.`,
      buttons: [
        { id: 'btn_menu', text: 'Voltar ao menu' },
      ],
    };
  } catch (err: any) {
    console.error('[FLOW] Booking error:', err);
    setState(tenantId, phone, 'MENU', {});
    if (err.code === 'SLOT_TAKEN') {
      return {
        type: 'buttons',
        title: 'Horario ocupado',
        text: 'Desculpe, este horario acabou de ser ocupado.',
        buttons: [{ id: 'btn_book', text: 'Tentar outra data' }],
      };
    }
    return { type: 'text', text: 'Ocorreu um erro ao agendar. Tente novamente.\n\nDigite *menu* para voltar.' };
  }
}

// ============================================================
// View appointments
// ============================================================

async function showAppointments(tenantId: string, phone: string): Promise<FlowResponse> {
  const now = new Date();
  const appointments = await prisma.scheduledCall.findMany({
    where: {
      phone: { contains: phone.slice(-8) },
      date: { gte: now },
      status: { in: ['scheduled', 'confirmed'] },
    },
    orderBy: { date: 'asc' },
    take: 5,
  });

  if (appointments.length === 0) {
    setState(tenantId, phone, 'MENU', {});
    return {
      type: 'buttons',
      title: 'Sem consultas',
      text: 'Voce nao tem consultas agendadas no momento.',
      buttons: [
        { id: 'btn_book', text: 'Agendar consulta' },
        { id: 'btn_menu', text: 'Voltar ao menu' },
      ],
    };
  }

  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const list = appointments.map((a) => {
    const d = new Date(a.date);
    const dateStr = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    const timeStr = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    const day = daysOfWeek[d.getUTCDay()];
    const status = a.status === 'confirmed' ? 'Confirmada' : 'Agendada';
    return `• ${day} ${dateStr} as ${timeStr} - ${status}`;
  }).join('\n');

  setState(tenantId, phone, 'VIEW_APPOINTMENT', {
    appointments: appointments.map(a => ({ id: a.id, date: a.date, status: a.status })),
  });

  return {
    type: 'buttons',
    title: 'Suas consultas',
    text: `Proximas consultas:\n\n${list}`,
    buttons: [
      { id: 'btn_cancel_flow', text: 'Cancelar consulta' },
      { id: 'btn_menu', text: 'Voltar ao menu' },
    ],
  };
}

async function handleViewAppointment(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const textLower = text.toLowerCase();
  if (['cancelar consulta', 'btn_cancel_flow', 'cancelar'].includes(textLower)) {
    return startCancelFlow(tenantId, phone);
  }
  setState(tenantId, phone, 'MENU', {});
  return buildMenuResponse('', false);
}

// ============================================================
// Cancel flow
// ============================================================

async function startCancelFlow(tenantId: string, phone: string): Promise<FlowResponse> {
  const now = new Date();
  const appointments = await prisma.scheduledCall.findMany({
    where: {
      phone: { contains: phone.slice(-8) },
      date: { gte: now },
      status: { in: ['scheduled', 'confirmed'] },
    },
    orderBy: { date: 'asc' },
    take: 10,
  });

  if (appointments.length === 0) {
    setState(tenantId, phone, 'MENU', {});
    return {
      type: 'buttons',
      title: 'Sem consultas',
      text: 'Voce nao tem consultas para cancelar.',
      buttons: [{ id: 'btn_menu', text: 'Voltar ao menu' }],
    };
  }

  setState(tenantId, phone, 'CANCEL_SELECT', {
    cancelableAppointments: appointments.map(a => ({ id: a.id, date: a.date })),
  });

  if (appointments.length === 1) {
    const a = appointments[0];
    const d = new Date(a.date);
    const dateStr = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    const timeStr = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

    setState(tenantId, phone, 'CANCEL_CONFIRM', { cancelId: a.id, cancelDate: dateStr, cancelTime: timeStr });

    return {
      type: 'buttons',
      title: 'Cancelar consulta',
      text: `Tem certeza que deseja cancelar a consulta de *${dateStr}* as *${timeStr}*?`,
      buttons: [
        { id: 'btn_yes', text: 'Sim, cancelar' },
        { id: 'btn_no', text: 'Nao, manter' },
      ],
    };
  }

  return {
    type: 'list',
    title: 'Cancelar consulta',
    text: 'Qual consulta deseja cancelar?',
    listButtonText: 'Ver consultas',
    listSections: [{
      title: 'Suas consultas',
      rows: appointments.map((a, i) => {
        const d = new Date(a.date);
        const dateStr = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
        const timeStr = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        return {
          id: `cancel_${i}`,
          title: `${dateStr} as ${timeStr}`,
        };
      }),
    }],
  };
}

async function handleCancelSelect(tenantId: string, phone: string, text: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;
  const appointments = conv.data.cancelableAppointments as Array<{ id: string; date: string }>;

  let index = -1;
  const idMatch = text.match(/^cancel_(\d+)$/i);
  if (idMatch) {
    index = parseInt(idMatch[1]);
  } else {
    const num = parseInt(text);
    if (!isNaN(num) && num >= 1 && num <= appointments.length) index = num - 1;
  }

  if (index < 0 || index >= appointments.length) {
    return { type: 'text', text: `Opcao invalida. Escolha uma consulta da lista (1 a ${appointments.length}).` };
  }

  const selected = appointments[index];
  const d = new Date(selected.date);
  const dateStr = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  const timeStr = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

  setState(tenantId, phone, 'CANCEL_CONFIRM', { cancelId: selected.id, cancelDate: dateStr, cancelTime: timeStr });

  return {
    type: 'buttons',
    title: 'Confirmar cancelamento',
    text: `Tem certeza que deseja cancelar a consulta de *${dateStr}* as *${timeStr}*?`,
    buttons: [
      { id: 'btn_yes', text: 'Sim, cancelar' },
      { id: 'btn_no', text: 'Nao, manter' },
    ],
  };
}

async function handleCancelConfirm(tenantId: string, phone: string, text: string, textLower: string, normalized: string): Promise<FlowResponse> {
  const conv = getState(tenantId, phone)!;

  if (['nao', 'não', 'n', 'nao, manter', 'btn_no'].includes(textLower)) {
    setState(tenantId, phone, 'MENU', {});
    return buildMenuResponse('', false);
  }

  if (!['sim', 's', 'confirmar', 'sim, cancelar', 'btn_yes'].includes(textLower)) {
    return {
      type: 'buttons',
      title: 'Confirmar cancelamento',
      text: 'Confirma o cancelamento?',
      buttons: [
        { id: 'btn_yes', text: 'Sim, cancelar' },
        { id: 'btn_no', text: 'Nao, manter' },
      ],
    };
  }

  try {
    await schedulingService.cancelCall(conv.data.cancelId);
    clearState(tenantId, phone);

    return {
      type: 'buttons',
      title: 'Consulta cancelada',
      text: `Consulta de *${conv.data.cancelDate}* as *${conv.data.cancelTime}* foi cancelada.\n\nQuando quiser reagendar, estamos aqui!`,
      buttons: [
        { id: 'btn_book', text: 'Agendar nova consulta' },
        { id: 'btn_ok', text: 'Ok, obrigado' },
      ],
    };
  } catch (err) {
    console.error('[FLOW] Cancel error:', err);
    setState(tenantId, phone, 'MENU', {});
    return { type: 'text', text: 'Ocorreu um erro ao cancelar. Tente novamente.\n\nDigite *menu* para voltar.' };
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
