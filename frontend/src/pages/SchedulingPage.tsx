import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar, Clock, X, Check, XCircle, Phone, Search, AlertTriangle, ChevronLeft, ChevronRight, FileCheck2, AlertCircle, UserCog, Stethoscope, ShieldCheck, ShieldAlert, Undo2, Trash2, UserCheck, Eye, ChevronDown, ChevronUp, RotateCcw, DoorOpen, Plus, Pencil } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isBefore, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { PatientPanel } from '../components/PatientPanel';

interface DoctorHorario {
  ativo: boolean;
  manha?: { inicio: string; fim: string };
  tarde?: { inicio: string; fim: string };
  inicio?: string;
  fim?: string;
}

interface Doctor {
  id: string;
  name: string;
  especialidade?: string | null;
  horarios?: Record<string, DoctorHorario> | null;
  duracaoConsulta?: number | null;
}

interface CallProcedure {
  id: string;
  authorizationNumber: string | null;
  doctorId?: string | null;
  doctor?: { id: string; name: string } | null;
  tussProcedure: {
    id: string;
    code: string;
    description: string;
    type: string;
    value: number;
  };
}

interface CallPrivateProcedure {
  id: string;
  doctorId?: string | null;
  doctor?: { id: string; name: string } | null;
  notes?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  privateProcedure: {
    id: string;
    name: string;
    type: string;
    value: number | null;
  };
}

interface TussProc {
  id: string;
  code: string;
  description: string;
  type: string;
  value: number;
  convenioId: string | null;
}

interface AvailableDate {
  date: string;
  dayName: string;
  availableSlots: number;
}

interface Slot {
  time: string;
  available: boolean;
}

interface Appointment {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  date: string;
  duration: number;
  status: string;
  notes: string | null;
  customerId: string | null;
  doctorId: string | null;
  authorizationNumber: string | null;
  paymentType: string | null;
  convenioId: string | null;
  checkinAt: string | null;
  calledAt: string | null;
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  doctor: { id: string; name: string; salas?: Record<string, { manha: string | null; tarde: string | null }> | null } | null;
  convenio?: { id: string; nome: string } | null;
  procedures?: CallProcedure[];
  privateProcedureCalls?: CallPrivateProcedure[];
  isReturn?: boolean;
  isEncaixe?: boolean;
  originalCallId?: string | null;
  returnCall?: { id: string; date: string; status: string } | null;
  createdAt: string;
}

interface ConvenioOption { id: string; nome: string; ativo: boolean }

interface CustomerSearch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

type View = 'calendar' | 'list' | 'history';

const statusMap: Record<string, { label: string; cls: string; icon: string; step: number }> = {
  scheduled: { label: 'Agendado', cls: 'bg-blue-100 text-blue-700', icon: '🔵', step: 1 },
  confirmed: { label: 'Confirmado', cls: 'bg-green-100 text-green-700', icon: '✅', step: 2 },
  awaiting_payment: { label: 'Aguardando pgto', cls: 'bg-yellow-100 text-yellow-700', icon: '💰', step: 3 },
  paid: { label: 'Pago', cls: 'bg-emerald-100 text-emerald-700', icon: '✅', step: 3 },
  present: { label: 'Na fila', cls: 'bg-purple-100 text-purple-700', icon: '🏥', step: 4 },
  attended: { label: 'Atendido', cls: 'bg-emerald-100 text-emerald-700', icon: '🩺', step: 5 },
  completed: { label: 'Realizado', cls: 'bg-slate-100 text-slate-600', icon: '✅', step: 6 },
  cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700', icon: '❌', step: -1 },
  no_show: { label: 'Faltou', cls: 'bg-red-100 text-red-700', icon: '❌', step: -1 },
};

function getDisplayStatus(a: { status: string; paymentType: string | null; privateProcedureCalls?: { paymentStatus?: string | null }[] }): string {
  if (a.status === 'awaiting_payment' && a.paymentType === 'PARTICULAR' &&
    (a.privateProcedureCalls?.length || 0) > 0 &&
    a.privateProcedureCalls!.every(p => p.paymentStatus === 'paid')) {
    return 'paid';
  }
  return a.status;
}

const timelineSteps = [
  { key: 'scheduled', label: 'Agendado', icon: '🔵' },
  { key: 'confirmed', label: 'Confirmado', icon: '✅' },
  { key: 'awaiting_payment', label: 'Pgto', icon: '💰' },
  { key: 'present', label: 'Fila', icon: '🏥' },
  { key: 'attended', label: 'Atendido', icon: '🩺' },
  { key: 'completed', label: 'Realizado', icon: '✅' },
];

function StatusTimeline({ status }: { status: string }) {
  const currentStep = statusMap[status]?.step || 0;
  const isCancelled = status === 'cancelled' || status === 'no_show';

  if (isCancelled) {
    const st = statusMap[status];
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded font-medium ${st.cls}`}>{st.icon} {st.label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {timelineSteps.map((step, i) => {
        const isActive = currentStep >= (i + 1);
        const isCurrent = currentStep === (i + 1);
        return (
          <div key={step.key} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${isActive ? 'bg-[#EFF6FF] text-[#1E3A5F] font-medium' : 'bg-slate-100 text-slate-400'} ${isCurrent ? 'ring-1 ring-[#2563EB]' : ''}`}>
              <span className="text-[10px]">{step.icon}</span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < timelineSteps.length - 1 && (
              <div className={`w-3 h-0.5 ${isActive ? 'bg-[#1E3A5F]' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface TimeGridRow {
  time: string;
  minutes: number;
  type: 'free' | 'appointment';
  appointment?: Appointment;
}

function buildTimeGrid(
  dayAppts: Appointment[],
  doctorsForDay: Doctor[],
  dayKey: string,
  filterDoctorId: string,
): TimeGridRow[] {
  const slotDuration = (() => {
    if (filterDoctorId) {
      const doc = doctorsForDay.find(d => d.id === filterDoctorId);
      if (doc?.duracaoConsulta) return doc.duracaoConsulta;
    }
    if (doctorsForDay.length === 1 && doctorsForDay[0].duracaoConsulta) {
      return doctorsForDay[0].duracaoConsulta;
    }
    return 30;
  })();

  let startMin = 480; // 08:00
  let endMin = 1080; // 18:00

  const targetDoc = filterDoctorId ? doctorsForDay.find(d => d.id === filterDoctorId) : null;
  if (targetDoc?.horarios?.[dayKey]?.ativo) {
    const h = targetDoc.horarios[dayKey];
    const parseTime = (t: string) => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm; };
    if (h.manha && h.tarde) {
      startMin = parseTime(h.manha.inicio);
      endMin = parseTime(h.tarde.fim);
    } else if (h.inicio && h.fim) {
      startMin = parseTime(h.inicio);
      endMin = parseTime(h.fim);
    }
  } else if (doctorsForDay.length > 0) {
    const parseTime = (t: string) => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm; };
    let earliest = 1440, latest = 0;
    for (const doc of doctorsForDay) {
      if (!doc.horarios?.[dayKey]?.ativo) continue;
      const h = doc.horarios[dayKey];
      if (h.manha && h.tarde) {
        earliest = Math.min(earliest, parseTime(h.manha.inicio));
        latest = Math.max(latest, parseTime(h.tarde.fim));
      } else if (h.inicio && h.fim) {
        earliest = Math.min(earliest, parseTime(h.inicio));
        latest = Math.max(latest, parseTime(h.fim));
      }
    }
    if (earliest < latest) { startMin = earliest; endMin = latest; }
  }

  const standardSlots: number[] = [];
  for (let m = startMin; m < endMin; m += slotDuration) {
    standardSlots.push(m);
  }

  const apptMinutes = dayAppts.map(a => {
    const d = new Date(a.date);
    const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return sp.getUTCHours() * 60 + sp.getUTCMinutes();
  });

  const allTimes = new Set<number>(standardSlots);
  apptMinutes.forEach(m => allTimes.add(m));
  const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

  const apptsByMinute = new Map<number, Appointment[]>();
  dayAppts.forEach((a, i) => {
    const m = apptMinutes[i];
    if (!apptsByMinute.has(m)) apptsByMinute.set(m, []);
    apptsByMinute.get(m)!.push(a);
  });

  const rows: TimeGridRow[] = [];
  for (const m of sortedTimes) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const time = `${hh}:${mm}`;
    const appts = apptsByMinute.get(m);
    if (appts && appts.length > 0) {
      for (const appt of appts) {
        rows.push({ time, minutes: m, type: 'appointment', appointment: appt });
      }
    } else {
      rows.push({ time, minutes: m, type: 'free' });
    }
  }

  return rows;
}

export function SchedulingPage() {
  const { user } = useAuth();
  const canRevert = user?.role === 'OWNER' || user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
  const [view, setView] = useState<View>('list');
  const [agendaMode, setAgendaMode] = useState<'diario' | 'semanal' | 'mensal'>('diario');
  const [agendaDate, setAgendaDate] = useState(() => new Date());
  const [agendaAppointments, setAgendaAppointments] = useState<Appointment[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [agendaRefresh, setAgendaRefresh] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [, setAvailableDates] = useState<AvailableDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'agendamentos' | 'medicos'>('agendamentos');

  // New / Edit appointment
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingCallId, setEditingCallId] = useState<string | null>(null);
  const [bookForm, setBookForm] = useState({ name: '', phone: '', email: '', date: '', time: '', notes: '', customerId: '', doctorId: '' });
  const [saving, setSaving] = useState(false);
  // Payment type for new appointment
  const [bookPaymentType, setBookPaymentType] = useState<'PARTICULAR' | 'CONVENIO'>('PARTICULAR');
  const [bookConvenioId, setBookConvenioId] = useState<string>('');
  const [bookProcedureId, setBookProcedureId] = useState<string>('');
  const [bookEncaixe, setBookEncaixe] = useState(false);
  // Private procedures list (for booking PARTICULAR)
  interface BookPrivProc { id: string; name: string; value: number | null; type: string }
  const [bookPrivProcedures, setBookPrivProcedures] = useState<BookPrivProc[]>([]);
  // Repasse warning for booking
  const [repasseWarning, setRepasseWarning] = useState('');
  // Tenant-wide convenios lookup (for rendering badges and booking modal)
  const [conveniosLookup, setConveniosLookup] = useState<Record<string, ConvenioOption>>({});

  // Payment modal
  interface PaymentSummaryItem { id: string; procedureId: string; name: string; type: string; value: number; discountPercent: number; finalAmount: number; paymentStatus: string; paymentMethod: string | null; paidAt: string | null }
  interface PaymentSummary { items: PaymentSummaryItem[]; total: number; totalFinal: number; paid: number; pending: number }
  const [paymentCallId, setPaymentCallId] = useState<string | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [payingIds, setPayingIds] = useState(false);
  const [paymentDiscounts, setPaymentDiscounts] = useState<Record<string, number>>({});

  // Add procedure modal (post-attendance) — supports multiple procedures
  const [addProcCallId, setAddProcCallId] = useState<string | null>(null);
  interface AddProcRow { procedureId: string; doctorId: string }
  const [addProcRows, setAddProcRows] = useState<AddProcRow[]>([{ procedureId: '', doctorId: '' }]);
  const [addProcSaving, setAddProcSaving] = useState(false);

  // Doctors
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [roomsMap, setRoomsMap] = useState<Record<string, string>>({});

  // Doctor filter — doctors only see their own agenda
  const isProviderRole = user?.role === 'DOCTOR' || user?.role === 'HEALTH_PROFESSIONAL';
  const canSeeAllAgendas = user?.role === 'OWNER' || user?.role === 'MANAGER' || user?.role === 'RECEPTIONIST' || user?.role === 'SUPER_ADMIN';
  const [filterDoctorId, setFilterDoctorId] = useState<string>('');

  const DAY_KEYS_SCHED = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const getRoomName = (a: Appointment): string | null => {
    if (!a.doctor?.salas) return null;
    const d = new Date(a.date);
    const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    const dayKey = DAY_KEYS_SCHED[sp.getUTCDay()];
    const hour = sp.getUTCHours();
    const daySalas = a.doctor.salas[dayKey];
    if (!daySalas) return null;
    const roomId = hour < 12 ? daySalas.manha : daySalas.tarde;
    return roomId ? (roomsMap[roomId] || null) : null;
  };

  // Booking modal: mini-calendar + slot picker
  const [bookCalMonth, setBookCalMonth] = useState(() => startOfMonth(new Date()));
  const [bookSlots, setBookSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [loadingBookSlots, setLoadingBookSlots] = useState(false);

  // Confirmar Realizacao (ao clicar em "Realizado")
  const [tussModalCall, setTussModalCall] = useState<Appointment | null>(null);
  const [tussModalProcedures, setTussModalProcedures] = useState<TussProc[]>([]);
  const [tussLoadingList, setTussLoadingList] = useState(false);
  // Multi-select: array of chosen TUSS procedures with per-procedure doctorId
  interface TussItem { procedureId: string; authNumber: string; doctorId: string }
  const [tussItems, setTussItems] = useState<TussItem[]>([{ procedureId: '', authNumber: '', doctorId: '' }]);
  const [tussSaving, setTussSaving] = useState(false);
  // When true, saving the TUSS modal REPLACES procedures (edit mode) instead of
  // registering + marking completed.
  const [tussEditMode, setTussEditMode] = useState(false);
  // When true, the call is already completed (legacy "Registrar TUSS") — skip status change.
  const [tussAlreadyCompleted, setTussAlreadyCompleted] = useState(false);
  const [tussCompleteOnSave, setTussCompleteOnSave] = useState(false);

  // ---- Stock withdrawal extension (procedure templates + materials) ----
  interface TplMaterial { productId: string; productName: string; unit: string; quantity: number }
  interface ProcedureTpl { id: string; name: string; description: string | null; procedureType?: string; privateProcedureId?: string | null; materials: TplMaterial[] }
  interface InventoryProduct { id: string; name: string; quantity: number; unit: string }
  interface MaterialRow { productId: string; productName: string; unit: string; quantity: number; available: number }
  const [procedureTemplates, setProcedureTemplates] = useState<ProcedureTpl[] | null>(null);
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[] | null>(null);
  const [tussTab, setTussTab] = useState<'tuss' | 'estoque'>('tuss');
  // Per-procedure materials: keyed by tussItem row index
  const [tussAllMaterials, setTussAllMaterials] = useState<Record<number, { tpl: MaterialRow[]; extra: MaterialRow[] }>>({});
  const [tussModalError, setTussModalError] = useState<string>('');
  // Tracks whether the modal was opened via the "Registrar TUSS" badge (retro flow)
  const [tussRetroMode, setTussRetroMode] = useState(false);

  // ---- PARTICULAR procedure modal (completely separate from TUSS) ----
  interface PrivProc { id: string; name: string; description: string | null; value: number | null; duration: number | null; isActive: boolean }
  interface PartItem { procedureId: string; doctorId: string; notes: string }
  const [partModalCall, setPartModalCall] = useState<Appointment | null>(null);
  const [partProcedures, setPartProcedures] = useState<PrivProc[]>([]);
  const [partItems, setPartItems] = useState<PartItem[]>([{ procedureId: '', doctorId: '', notes: '' }]);
  const [partTab, setPartTab] = useState<'procedimento' | 'estoque'>('procedimento');
  // Per-procedure materials: keyed by procedure row index
  const [partAllMaterials, setPartAllMaterials] = useState<Record<number, { tpl: MaterialRow[]; extra: MaterialRow[] }>>({});
  const [partError, setPartError] = useState<string>('');
  const [partSubmitting, setPartSubmitting] = useState(false);
  const [partRetro, setPartRetro] = useState(false);
  const [partLoading, setPartLoading] = useState(false);

  // Assign/change doctor
  const [doctorEditCall, setDoctorEditCall] = useState<Appointment | null>(null);
  const [doctorEditValue, setDoctorEditValue] = useState('');
  const [savingDoctor, setSavingDoctor] = useState(false);

  // Inline authorization editor — keyed by call id
  const [authEditingId, setAuthEditingId] = useState<string | null>(null);
  const [authEditValue, setAuthEditValue] = useState('');
  const [savingAuthId, setSavingAuthId] = useState<string | null>(null);

  // Convenio presence cache — map customerId → boolean
  const [convenioMap, setConvenioMap] = useState<Record<string, boolean>>({});

  // Customer search in booking modal
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSearch[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [selectedBookCustomer, setSelectedBookCustomer] = useState<CustomerSearch | null>(null);

  // Calendar month view
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [monthAppointments, setMonthAppointments] = useState<Appointment[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);

  // History filters
  const [historyFrom, setHistoryFrom] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [historyTo, setHistoryTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [historyData, setHistoryData] = useState<Appointment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Patient panel
  const [patientPanelId, setPatientPanelId] = useState<string | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

  // Return appointment
  const [returnPromptCall, setReturnPromptCall] = useState<Appointment | null>(null);
  const [returnModalCall, setReturnModalCall] = useState<Appointment | null>(null);
  const [returnForm, setReturnForm] = useState({ doctorId: '', date: '', time: '', notes: 'Retorno' });
  const [returnCalMonth, setReturnCalMonth] = useState(() => startOfMonth(new Date()));
  const [returnSlots, setReturnSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [loadingReturnSlots, setLoadingReturnSlots] = useState(false);
  const [savingReturn, setSavingReturn] = useState(false);

  const fetchAppointments = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterDoctorId) params.doctorId = filterDoctorId;
      const { data } = await api.get('/scheduling/calls', { params });
      setAppointments(data.data);
    } catch {} finally { setLoading(false); }
  }, [filterDoctorId]);

  const fetchHistory = useCallback(async (from: string, to: string) => {
    setLoadingHistory(true);
    try {
      const params: Record<string, string | number> = { from, to, limit: 500 };
      if (filterDoctorId) params.doctorId = filterDoctorId;
      const { data } = await api.get('/scheduling/calls', { params });
      const all: Appointment[] = data.data || [];
      const pastStatuses = new Set(['completed', 'cancelled', 'no_show']);
      setHistoryData(all.filter(a => pastStatuses.has(a.status)));
    } catch {} finally { setLoadingHistory(false); }
  }, [filterDoctorId]);

  const fetchDates = useCallback(async () => {
    try {
      const { data } = await api.get('/scheduling/available-dates');
      setAvailableDates(data.data);
    } catch {}
  }, []);

  const fetchMonthAppointments = useCallback(async (month: Date) => {
    setLoadingMonth(true);
    try {
      const from = format(month, 'yyyy-MM-dd');
      const to = format(endOfMonth(month), 'yyyy-MM-dd');
      const params: Record<string, string | number> = { from, to, limit: 200 };
      if (filterDoctorId) params.doctorId = filterDoctorId;
      const { data } = await api.get('/scheduling/calls', { params });
      setMonthAppointments(data.data || []);
    } catch {} finally { setLoadingMonth(false); }
  }, [filterDoctorId]);

  const fetchDoctors = useCallback(async () => {
    try {
      const { data } = await api.get('/team/doctors');
      setDoctors(data.data || []);
    } catch {}
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const { data } = await api.get('/rooms');
      const map: Record<string, string> = {};
      for (const r of (data.data || [])) map[r.id] = r.name;
      setRoomsMap(map);
    } catch {}
  }, []);

  // Fetch all tenant convenios once to resolve badge names (fallback when the
  // backend's inlined convenio resolve is absent — e.g. during cache lag).
  const fetchConveniosLookup = useCallback(async () => {
    try {
      const { data } = await api.get('/convenios');
      const list: ConvenioOption[] = data.data || [];
      const map: Record<string, ConvenioOption> = {};
      for (const c of list) map[c.id] = c;
      setConveniosLookup(map);
    } catch {}
  }, []);

  const fetchAgenda = useCallback(async (date: Date, mode: 'diario' | 'semanal' | 'mensal') => {
    setLoadingAgenda(true);
    try {
      let from: string, to: string;
      if (mode === 'diario') {
        from = format(date, 'yyyy-MM-dd');
        to = from;
      } else if (mode === 'semanal') {
        const ws = startOfWeek(date, { weekStartsOn: 1 });
        from = format(ws, 'yyyy-MM-dd');
        to = format(addDays(ws, 6), 'yyyy-MM-dd');
      } else {
        from = format(startOfMonth(date), 'yyyy-MM-dd');
        to = format(endOfMonth(date), 'yyyy-MM-dd');
      }
      const params: Record<string, string | number> = { from, to, limit: 500 };
      if (filterDoctorId) params.doctorId = filterDoctorId;
      const { data } = await api.get('/scheduling/calls', { params });
      setAgendaAppointments(data.data || []);
    } catch {} finally { setLoadingAgenda(false); }
  }, [filterDoctorId]);

  const fetchBookPrivProcedures = useCallback(async () => {
    try {
      const { data } = await api.get('/private-procedures');
      setBookPrivProcedures((data.data || []).filter((p: BookPrivProc & { isActive: boolean }) => p.isActive));
    } catch {}
  }, []);

  useEffect(() => {
    if (isProviderRole && !canSeeAllAgendas && user?.id) {
      setFilterDoctorId(user.id);
    }
  }, [isProviderRole, canSeeAllAgendas, user?.id]);

  useEffect(() => { fetchAppointments(); fetchDates(); fetchDoctors(); fetchRooms(); fetchConveniosLookup(); fetchBookPrivProcedures(); }, [fetchAppointments, fetchDates, fetchDoctors, fetchRooms, fetchConveniosLookup, fetchBookPrivProcedures]);

  useEffect(() => { if (view === 'list') fetchAgenda(agendaDate, agendaMode); }, [view, agendaDate, agendaMode, fetchAgenda, agendaRefresh]);

  useEffect(() => { if (view === 'history') fetchHistory(historyFrom, historyTo); }, [view, historyFrom, historyTo, fetchHistory]);

  useEffect(() => {
    if (view === 'calendar') fetchMonthAppointments(calMonth);
  }, [view, calMonth, fetchMonthAppointments]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calMonth);
    const monthEnd = endOfMonth(calMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }
    return days;
  }, [calMonth]);

  // Map appointments per day
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of monthAppointments) {
      const dayKey = format(new Date(a.date), 'yyyy-MM-dd');
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(a);
    }
    return map;
  }, [monthAppointments]);

  // Customer search debounce
  useEffect(() => {
    if (!customerSearch || customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCustomer(true);
      try {
        const { data } = await api.get('/customers', { params: { search: customerSearch, limit: 5 } });
        setCustomerResults(data.data || []);
      } catch {} finally { setSearchingCustomer(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const handleDateClick = async (date: string) => {
    setSelectedDate(date);
    setLoadingSlots(true);
    try {
      const params: any = {};
      if (bookForm.doctorId) params.doctorId = bookForm.doctorId;
      const { data } = await api.get(`/scheduling/available-slots/${date}`, { params });
      setSlots(data.data);
    } catch {} finally { setLoadingSlots(false); }
  };

  const resetPaymentState = () => {
    setBookPaymentType('PARTICULAR');
    setBookConvenioId('');
    setBookProcedureId('');
  };

  const openPaymentModal = async (callId: string) => {
    setPaymentCallId(callId);
    setPaymentMethod('PIX');
    setPayingIds(false);
    setPaymentDiscounts({});
    try {
      const { data } = await api.get(`/scheduling/calls/${callId}/payment-summary`);
      setPaymentSummary(data.data);
      const existing: Record<string, number> = {};
      for (const item of (data.data?.items || [])) {
        if (item.discountPercent > 0) existing[item.id] = item.discountPercent;
      }
      if (Object.keys(existing).length > 0) setPaymentDiscounts(existing);
    } catch { setPaymentSummary(null); }
  };

  const handlePay = async () => {
    if (!paymentCallId || !paymentSummary) return;
    const unpaidIds = paymentSummary.items.filter(i => i.paymentStatus !== 'paid').map(i => i.id);
    if (unpaidIds.length === 0) return;
    setPayingIds(true);
    try {
      const discountsToSend: Record<string, number> = {};
      for (const id of unpaidIds) {
        if (paymentDiscounts[id] && paymentDiscounts[id] > 0) {
          discountsToSend[id] = paymentDiscounts[id];
        }
      }
      await api.post(`/scheduling/calls/${paymentCallId}/pay`, {
        procedureCallIds: unpaidIds,
        paymentMethod,
        discounts: Object.keys(discountsToSend).length > 0 ? discountsToSend : undefined,
      });
      showToast('Pagamento registrado!');
      setPaymentCallId(null);
      setPaymentSummary(null);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao registrar pagamento');
    } finally { setPayingIds(false); }
  };

  const handleAddProcedure = async () => {
    if (!addProcCallId) return;
    const validRows = addProcRows.filter(r => r.procedureId);
    if (validRows.length === 0) return;
    setAddProcSaving(true);
    try {
      for (const row of validRows) {
        await api.post(`/scheduling/calls/${addProcCallId}/add-procedure`, {
          privateProcedureId: row.procedureId,
          doctorId: row.doctorId || undefined,
        });
      }
      await api.patch(`/scheduling/calls/${addProcCallId}`, { status: 'awaiting_payment' });
      showToast(`${validRows.length} procedimento(s) adicionado(s)! Aguardando pagamento.`);
      setAddProcCallId(null);
      setAddProcRows([{ procedureId: '', doctorId: '' }]);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao adicionar procedimento');
    } finally { setAddProcSaving(false); }
  };

  const openBookWithSlot = (date: string, time: string) => {
    setEditingCallId(null);
    setBookForm({ name: '', phone: '', email: '', date, time, notes: '', customerId: '', doctorId: '' });
    setSelectedBookCustomer(null);
    setCustomerSearch('');
    resetPaymentState();
    setBookEncaixe(false);
    setShowBookModal(true);
  };

  const openBook = () => {
    setEditingCallId(null);
    setBookForm({ name: '', phone: '', email: '', date: '', time: '', notes: '', customerId: '', doctorId: '' });
    setSelectedBookCustomer(null);
    setCustomerSearch('');
    resetPaymentState();
    setBookEncaixe(false);
    setShowBookModal(true);
  };

  const openEditModal = (a: Appointment) => {
    const dt = new Date(a.date);
    const spDate = new Date(dt.getTime() - 3 * 60 * 60 * 1000);
    const dateStr = spDate.toISOString().slice(0, 10);
    const timeStr = spDate.toISOString().slice(11, 16);
    setEditingCallId(a.id);
    setBookForm({
      name: a.name,
      phone: a.phone,
      email: a.email || '',
      date: dateStr,
      time: timeStr,
      notes: a.notes || '',
      customerId: a.customerId || '',
      doctorId: a.doctorId || '',
    });
    if (a.customer) {
      setSelectedBookCustomer(a.customer);
    } else {
      setSelectedBookCustomer(null);
    }
    setCustomerSearch('');
    setBookPaymentType((a.paymentType === 'CONVENIO' ? 'CONVENIO' : 'PARTICULAR') as 'PARTICULAR' | 'CONVENIO');
    setBookConvenioId(a.convenioId || '');
    const existingProc = a.privateProcedureCalls?.[0];
    setBookProcedureId(existingProc?.privateProcedure?.id || '');
    setBookEncaixe(!!a.isEncaixe);
    setBookCalMonth(startOfMonth(new Date(dateStr + 'T12:00:00')));
    bookDoctorRef.current = a.doctorId || '';
    setShowBookModal(true);
  };

  // Fetch available slots when doctor + date are both selected
  useEffect(() => {
    if (!showBookModal || !bookForm.doctorId || !bookForm.date) {
      setBookSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingBookSlots(true);
    const params: any = { doctorId: bookForm.doctorId, tenantId: user?.tenant?.id };
    if (editingCallId) params.excludeCallId = editingCallId;
    api.get(`/scheduling/available-slots/${bookForm.date}`, { params })
      .then(({ data }) => { if (!cancelled) setBookSlots(data.data || []); })
      .catch(() => { if (!cancelled) setBookSlots([]); })
      .finally(() => { if (!cancelled) setLoadingBookSlots(false); });
    return () => { cancelled = true; };
  }, [showBookModal, bookForm.doctorId, bookForm.date, user?.tenant?.id, editingCallId]);

  // Reset date + time when doctor changes in booking modal
  const bookDoctorRef = useRef(bookForm.doctorId);
  useEffect(() => {
    if (!showBookModal) return;
    if (bookDoctorRef.current === bookForm.doctorId) return;
    bookDoctorRef.current = bookForm.doctorId;
    setBookForm(prev => ({ ...prev, date: '', time: '' }));
    setBookSlots([]);
    setBookCalMonth(startOfMonth(new Date()));
  }, [showBookModal, bookForm.doctorId]);

  useEffect(() => {
    if (!showBookModal || bookPaymentType !== 'PARTICULAR' || !bookForm.doctorId || !bookProcedureId) {
      setRepasseWarning('');
      return;
    }
    let cancelled = false;
    api.get(`/doctors/${bookForm.doctorId}/repasse/private`)
      .then(({ data }) => {
        if (cancelled) return;
        const items: { procedureId: string; name: string; percentage: number }[] = data.data || [];
        const match = items.find(i => i.procedureId === bookProcedureId);
        if (!match || match.percentage <= 0) {
          const procName = bookPrivProcedures.find(p => p.id === bookProcedureId)?.name || 'este procedimento';
          const docName = doctors.find(d => d.id === bookForm.doctorId)?.name || 'o medico';
          setRepasseWarning(`Repasse nao configurado para "${procName}" com Dr. ${docName}. Configure antes de registrar o pagamento.`);
        } else {
          setRepasseWarning('');
        }
      })
      .catch(() => { if (!cancelled) setRepasseWarning(''); });
    return () => { cancelled = true; };
  }, [showBookModal, bookPaymentType, bookForm.doctorId, bookProcedureId, bookPrivProcedures, doctors]);

  const selectCustomerForBooking = (c: CustomerSearch) => {
    setSelectedBookCustomer(c);
    setBookForm(prev => ({
      ...prev,
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      customerId: c.id,
    }));
    setCustomerSearch('');
    setCustomerResults([]);
    setBookConvenioId('');
  };

  const clearSelectedCustomer = () => {
    setSelectedBookCustomer(null);
    setBookForm(prev => ({ ...prev, customerId: '' }));
    setBookConvenioId('');
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookForm.doctorId) {
      showToast('Selecione o medico responsavel pela consulta');
      return;
    }
    if (!bookForm.date) {
      showToast('Selecione a data da consulta');
      return;
    }
    if (!bookForm.time) {
      showToast('Selecione o horario da consulta');
      return;
    }
    if (bookPaymentType === 'CONVENIO' && !bookConvenioId) {
      showToast('Selecione o convenio do paciente');
      return;
    }
    if (bookPaymentType === 'PARTICULAR' && !bookProcedureId) {
      showToast('Selecione o procedimento');
      return;
    }
    setSaving(true);
    try {
      if (editingCallId) {
        const payload: any = {
          name: bookForm.name,
          phone: bookForm.phone,
          email: bookForm.email || null,
          date: bookForm.date,
          time: bookForm.time || undefined,
          notes: bookForm.notes || null,
          doctorId: bookForm.doctorId || null,
          paymentType: bookPaymentType,
          isEncaixe: bookEncaixe || false,
        };
        if (bookPaymentType === 'CONVENIO') {
          payload.convenioId = bookConvenioId || null;
        }
        if (bookPaymentType === 'PARTICULAR') {
          payload.privateProcedureId = bookProcedureId || null;
        }
        await api.patch(`/scheduling/calls/${editingCallId}/edit`, payload);
        setShowBookModal(false);
        setEditingCallId(null);
        fetchAppointments(); setAgendaRefresh(r => r + 1);
        fetchDates();
        showToast('Agendamento atualizado com sucesso!');
      } else {
        const payload: any = {
          name: bookForm.name,
          phone: bookForm.phone,
          email: bookForm.email || undefined,
          date: bookForm.date,
          time: bookForm.time || undefined,
          notes: bookForm.notes || undefined,
          customerId: bookForm.customerId || undefined,
          doctorId: bookForm.doctorId,
          paymentType: bookPaymentType,
          isEncaixe: bookEncaixe || undefined,
        };
        if (bookPaymentType === 'CONVENIO') {
          payload.convenioId = bookConvenioId;
        }
        if (bookPaymentType === 'PARTICULAR' && bookProcedureId) {
          payload.privateProcedureId = bookProcedureId;
        }
        await api.post('/scheduling/book', payload);
        setShowBookModal(false);
        fetchAppointments(); setAgendaRefresh(r => r + 1);
        fetchDates();
        showToast('Agendamento criado com sucesso!');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || (editingCallId ? 'Erro ao atualizar agendamento.' : 'Erro ao criar agendamento. Tente novamente.');
      showToast(msg);
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (id: string, status: string): Promise<boolean> => {
    setUpdatingId(id);
    try {
      await api.patch(`/scheduling/calls/${id}`, { status });
      fetchAppointments(); setAgendaRefresh(r => r + 1);
      return true;
    } catch (err: any) { showToast(err?.response?.data?.error?.message || 'Erro ao atualizar status.'); return false; } finally { setUpdatingId(null); }
  };

  // When clicking "Realizado": branch by paymentType.
  // PARTICULAR → procedures already paid; only check stock materials then complete.
  // CONVENIO / null / undefined → open the existing TUSS modal (unchanged).
  const handleRealized = async (a: Appointment) => {
    if (a.paymentType === 'PARTICULAR') {
      await openStockOnlyModal(a);
    } else {
      const hasExistingProcs = (a.procedures?.length || 0) > 0;
      await openTussModalForCall(a, hasExistingProcs, false, true);
    }
  };

  // PARTICULAR "Realizado": check if linked procedures have stock templates.
  // If yes → show stock-only popup. If no → mark completed directly.
  const [stockOnlyCall, setStockOnlyCall] = useState<Appointment | null>(null);
  const [stockOnlyMaterials, setStockOnlyMaterials] = useState<{ tpl: MaterialRow[]; extra: MaterialRow[] }[]>([]);
  const [stockOnlyProcNames, setStockOnlyProcNames] = useState<string[]>([]);
  const [stockOnlySubmitting, setStockOnlySubmitting] = useState(false);
  const [stockOnlyError, setStockOnlyError] = useState('');

  const openStockOnlyModal = async (a: Appointment) => {
    await ensureTemplatesAndProducts();
    const procs = a.privateProcedureCalls || [];
    const templates = procedureTemplates || [];
    const products = inventoryProducts || [];

    const procNames: string[] = [];
    const matGroups: { tpl: MaterialRow[]; extra: MaterialRow[] }[] = [];

    for (const pc of procs) {
      const name = pc.privateProcedure.name;
      procNames.push(name);
      const tpl = templates.find(
        (t) => t.name.trim().toLowerCase() === name.trim().toLowerCase() && (!t.procedureType || t.procedureType === 'PARTICULAR'),
      );
      if (tpl && tpl.materials.length > 0) {
        matGroups.push({
          tpl: tpl.materials.map((m) => {
            const prod = products.find((p) => p.id === m.productId);
            return {
              productId: m.productId,
              productName: m.productName || prod?.name || '',
              unit: m.unit || prod?.unit || 'un',
              quantity: m.quantity,
              available: prod?.quantity ?? 0,
            };
          }),
          extra: [],
        });
      } else {
        matGroups.push({ tpl: [], extra: [] });
      }
    }

    const hasMaterials = matGroups.some(g => g.tpl.length > 0);
    if (!hasMaterials) {
      try {
        await api.patch(`/scheduling/calls/${a.id}`, { status: 'completed' });
        showToast('Realizacao confirmada!');
        fetchAppointments(); setAgendaRefresh(r => r + 1);
        if (!a.isReturn) setReturnPromptCall(a);
      } catch (err: any) {
        showToast(err?.response?.data?.error?.message || 'Erro ao finalizar');
      }
      return;
    }

    setStockOnlyCall(a);
    setStockOnlyProcNames(procNames);
    setStockOnlyMaterials(matGroups);
    setStockOnlyError('');
    setStockOnlySubmitting(false);
  };

  const submitStockOnly = async () => {
    if (!stockOnlyCall) return;
    setStockOnlySubmitting(true);
    setStockOnlyError('');
    try {
      const allMats: { productId: string; quantity: number }[] = [];
      for (const g of stockOnlyMaterials) {
        for (const m of [...g.tpl, ...g.extra]) {
          if (m.productId && Number(m.quantity) > 0) {
            allMats.push({ productId: m.productId, quantity: Number(m.quantity) });
          }
        }
      }
      if (allMats.length > 0) {
        try {
          await api.post(`/scheduling/calls/${stockOnlyCall.id}/inventory`, { materials: allMats });
        } catch (invErr: any) {
          const code = invErr?.response?.data?.error?.code;
          const msg = invErr?.response?.data?.error?.message || 'Erro ao baixar estoque';
          if (code === 'INSUFFICIENT_STOCK') {
            setStockOnlyError(msg);
            try {
              const { data } = await api.get('/inventory/products', { params: { limit: 500 } });
              setInventoryProducts(data.data || []);
            } catch {}
            return;
          }
          throw invErr;
        }
      }
      await api.patch(`/scheduling/calls/${stockOnlyCall.id}`, { status: 'completed' });
      showToast('Realizacao confirmada!');
      if (!stockOnlyCall.isReturn) setReturnPromptCall(stockOnlyCall);
      setStockOnlyCall(null);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao finalizar');
    } finally {
      setStockOnlySubmitting(false);
    }
  };

  // Prefetch convenio flags for all appointments with customers so we can show
  // the "Autorizado"/"Sem autorizacao" badges without waiting for click.
  useEffect(() => {
    const ids = Array.from(new Set(
      appointments
        .map((a) => a.customerId)
        .filter((id): id is string => !!id && convenioMap[id] === undefined),
    ));
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const { data } = await api.get(`/convenios/patients/${id}`);
            return [id, !!data.data] as const;
          } catch {
            return [id, false] as const;
          }
        }),
      );
      if (cancelled) return;
      setConvenioMap((m) => {
        const next = { ...m };
        for (const [id, has] of results) next[id] = has;
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [appointments, convenioMap]);

  // Fetch procedure templates and inventory products (cached after first call)
  const ensureTemplatesAndProducts = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];
    if (procedureTemplates === null) {
      tasks.push(
        api.get('/procedure-templates')
          .then(({ data }) => setProcedureTemplates(data.data || []))
          .catch(() => setProcedureTemplates([])),
      );
    }
    if (inventoryProducts === null) {
      tasks.push(
        api.get('/inventory/products', { params: { limit: 500 } })
          .then(({ data }) => setInventoryProducts(data.data || []))
          .catch(() => setInventoryProducts([])),
      );
    }
    if (tasks.length > 0) await Promise.all(tasks);
  }, [procedureTemplates, inventoryProducts]);

  // Recompute matched template + prefilled materials when TUSS selection changes
  useEffect(() => {
    if (!tussModalCall || procedureTemplates === null) return;
    const products = inventoryProducts || [];
    const newMats: Record<number, { tpl: MaterialRow[]; extra: MaterialRow[] }> = {};
    for (let i = 0; i < tussItems.length; i++) {
      const item = tussItems[i];
      if (!item.procedureId) continue;
      const chosen = tussModalProcedures.find((p) => p.id === item.procedureId);
      if (!chosen) continue;
      const target = chosen.description.trim().toLowerCase();
      const tpl = (procedureTemplates || []).find(
        (t) => t.name.trim().toLowerCase() === target && (!t.procedureType || t.procedureType === 'TUSS'),
      );
      const existing = tussAllMaterials[i];
      if (tpl) {
        newMats[i] = {
          tpl: tpl.materials.map((m) => {
            const prod = products.find((p) => p.id === m.productId);
            return {
              productId: m.productId,
              productName: m.productName || prod?.name || '',
              unit: m.unit || prod?.unit || 'un',
              quantity: m.quantity,
              available: prod?.quantity ?? 0,
            };
          }),
          extra: existing?.extra || [],
        };
      } else {
        newMats[i] = { tpl: [], extra: existing?.extra || [] };
      }
    }
    setTussAllMaterials(newMats);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tussItems.map(i => i.procedureId).join(','), tussModalCall, tussModalProcedures, procedureTemplates, inventoryProducts]);

  const openTussModalForCall = async (a: Appointment, editMode: boolean, retroMode = false, completeOnSave = false) => {
    setTussModalCall(a);
    setTussEditMode(editMode);
    setTussAlreadyCompleted(a.status === 'completed');
    setTussRetroMode(retroMode);
    setTussCompleteOnSave(completeOnSave);
    const defaultDocId = a.doctorId || '';
    setTussItems([{ procedureId: '', authNumber: '', doctorId: defaultDocId }]);
    setTussLoadingList(true);
    setTussTab('tuss');
    setTussAllMaterials({});
    setTussModalError('');
    ensureTemplatesAndProducts();
    try {
      let convenioId: string | null = null;
      if (a.customerId) {
        try {
          const { data } = await api.get(`/convenios/patients/${a.customerId}`);
          convenioId = data.data?.convenioId || null;
        } catch {}
      }
      const params: any = {};
      if (convenioId) params.convenioId = convenioId;
      const { data } = await api.get('/tuss/procedures', { params });
      const list: TussProc[] = data.data || [];

      if (editMode && a.procedures && a.procedures.length > 0) {
        const listIds = new Set(list.map((l) => l.id));
        const extras: TussProc[] = [];
        for (const p of a.procedures) {
          if (!listIds.has(p.tussProcedure.id)) {
            extras.push({
              id: p.tussProcedure.id,
              code: p.tussProcedure.code,
              description: p.tussProcedure.description,
              type: p.tussProcedure.type,
              value: p.tussProcedure.value,
              convenioId: null,
            });
          }
        }
        setTussModalProcedures([...extras, ...list]);
        setTussItems(a.procedures.map(p => ({
          procedureId: p.tussProcedure.id,
          authNumber: p.authorizationNumber || '',
          doctorId: (p as any).doctor?.id || a.doctorId || '',
        })));
      } else {
        setTussModalProcedures(list);
      }
    } catch {
      setTussModalProcedures([]);
    } finally {
      setTussLoadingList(false);
    }
  };

  const tussCombinedMaterials = (): { productId: string; quantity: number }[] => {
    const all: MaterialRow[] = [];
    Object.values(tussAllMaterials).forEach(({ tpl, extra }) => { all.push(...tpl, ...extra); });
    return all
      .filter((m) => m.productId && Number(m.quantity) > 0)
      .map((m) => ({ productId: m.productId, quantity: Number(m.quantity) }));
  };

  const tussHasMaterials = Object.values(tussAllMaterials).some(({ tpl, extra }) => tpl.length > 0 || extra.length > 0);

  const submitTussModal = async () => {
    if (!tussModalCall) return;

    const validItems = tussItems.filter(it => it.procedureId);
    if (validItems.length === 0) {
      showToast('Selecione ao menos um procedimento TUSS');
      return;
    }

    if (tussTab === 'tuss' && tussHasMaterials) {
      setTussTab('estoque');
      return;
    }

    const selected = validItems.map(it => ({
      tussProcedureId: it.procedureId,
      authorizationNumber: it.authNumber.trim() || null,
      doctorId: it.doctorId || null,
    }));
    const materials = tussCombinedMaterials();

    setTussSaving(true);
    setTussModalError('');
    try {
      if (tussEditMode || tussAlreadyCompleted) {
        await api.put(`/scheduling/calls/${tussModalCall.id}/procedures`, { procedures: selected });
      } else {
        await api.post(`/scheduling/calls/${tussModalCall.id}/procedures`, { procedures: selected });
      }
      if (tussCompleteOnSave && !tussAlreadyCompleted) {
        await api.patch(`/scheduling/calls/${tussModalCall.id}`, { status: 'completed' });
      }

      if (materials.length > 0) {
        try {
          await api.post(`/scheduling/calls/${tussModalCall.id}/inventory`, { materials });
        } catch (invErr: any) {
          const code = invErr?.response?.data?.error?.code;
          const msg = invErr?.response?.data?.error?.message || 'Erro ao baixar estoque';
          if (code === 'INSUFFICIENT_STOCK') {
            setTussModalError(msg);
            setTussTab('estoque');
            try {
              const { data } = await api.get('/inventory/products', { params: { limit: 500 } });
              setInventoryProducts(data.data || []);
            } catch {}
            return;
          }
          throw invErr;
        }
      }

      showToast(
        tussCompleteOnSave && !tussAlreadyCompleted
          ? 'Realizacao confirmada!'
          : tussEditMode
            ? 'Procedimentos atualizados!'
            : tussAlreadyCompleted
              ? 'Procedimentos registrados!'
              : 'Realizacao confirmada!',
      );
      if (tussCompleteOnSave && !tussAlreadyCompleted && tussModalCall && !tussModalCall.isReturn) {
        setReturnPromptCall(tussModalCall);
      }
      setTussModalCall(null);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao salvar procedimento');
    } finally {
      setTussSaving(false);
    }
  };

  const submitInventoryOnly = async () => {
    if (!tussModalCall) return;
    const materials = tussCombinedMaterials();
    if (materials.length === 0) {
      showToast('Adicione pelo menos um material');
      return;
    }
    setTussSaving(true);
    setTussModalError('');
    try {
      await api.post(`/scheduling/calls/${tussModalCall.id}/inventory`, { materials });
      showToast('Baixa de estoque registrada!');
      setTussModalCall(null);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      const msg = err?.response?.data?.error?.message || 'Erro ao baixar estoque';
      if (code === 'INSUFFICIENT_STOCK') {
        setTussModalError(msg);
        try {
          const { data } = await api.get('/inventory/products', { params: { limit: 500 } });
          setInventoryProducts(data.data || []);
        } catch {}
      } else {
        showToast(msg);
      }
    } finally {
      setTussSaving(false);
    }
  };

  const openRegistrarTussForExisting = async (a: Appointment) => {
    await openTussModalForCall(a, false, true);
  };

  // ---- PARTICULAR modal logic ----
  const openPartModalForCall = async (a: Appointment, retro: boolean) => {
    setPartModalCall(a);
    setPartRetro(retro);
    const defaultDocId = a.doctorId || '';
    setPartItems([{ procedureId: '', doctorId: defaultDocId, notes: '' }]);
    setPartTab('procedimento');
    setPartAllMaterials({});
    setPartError('');
    setPartSubmitting(false);
    setPartLoading(true);
    const tasks: Promise<unknown>[] = [];
    tasks.push(
      api.get('/private-procedures')
        .then(({ data }) => setPartProcedures((data.data || []).filter((p: PrivProc) => p.isActive)))
        .catch(() => setPartProcedures([])),
    );
    if (procedureTemplates === null) {
      tasks.push(
        api.get('/procedure-templates')
          .then(({ data }) => setProcedureTemplates(data.data || []))
          .catch(() => setProcedureTemplates([])),
      );
    }
    if (inventoryProducts === null) {
      tasks.push(
        api.get('/inventory/products', { params: { limit: 500 } })
          .then(({ data }) => setInventoryProducts(data.data || []))
          .catch(() => setInventoryProducts([])),
      );
    }
    await Promise.all(tasks);
    setPartLoading(false);
  };

  useEffect(() => {
    if (!partModalCall || procedureTemplates === null) return;
    const products = inventoryProducts || [];
    const newMats: Record<number, { tpl: MaterialRow[]; extra: MaterialRow[] }> = {};
    for (let i = 0; i < partItems.length; i++) {
      const item = partItems[i];
      if (!item.procedureId) continue;
      const proc = partProcedures.find((p) => p.id === item.procedureId);
      if (!proc) continue;
      const target = proc.name.trim().toLowerCase();
      const tpl = (procedureTemplates || []).find((t) => t.name.trim().toLowerCase() === target && (!t.procedureType || t.procedureType === 'PARTICULAR'));
      const existing = partAllMaterials[i];
      if (tpl) {
        newMats[i] = {
          tpl: tpl.materials.map((m) => {
            const prod = products.find((p) => p.id === m.productId);
            return {
              productId: m.productId,
              productName: m.productName || prod?.name || '',
              unit: m.unit || prod?.unit || 'un',
              quantity: m.quantity,
              available: prod?.quantity ?? 0,
            };
          }),
          extra: existing?.extra || [],
        };
      } else {
        newMats[i] = { tpl: [], extra: existing?.extra || [] };
      }
    }
    setPartAllMaterials(newMats);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partItems.map(i => i.procedureId).join(','), partModalCall, partProcedures, procedureTemplates, inventoryProducts]);

  const partCombinedMaterials = (): { productId: string; quantity: number }[] => {
    const all: MaterialRow[] = [];
    Object.values(partAllMaterials).forEach(({ tpl, extra }) => { all.push(...tpl, ...extra); });
    return all
      .filter((m) => m.productId && Number(m.quantity) > 0)
      .map((m) => ({ productId: m.productId, quantity: Number(m.quantity) }));
  };

  const partHasMaterials = Object.values(partAllMaterials).some(({ tpl, extra }) => tpl.length > 0 || extra.length > 0);

  const submitPartModal = async () => {
    if (!partModalCall) return;

    const validItems = partItems.filter(it => it.procedureId);
    if (validItems.length === 0) {
      showToast('Selecione ao menos um procedimento');
      return;
    }

    if (partTab === 'procedimento' && partHasMaterials) {
      setPartTab('estoque');
      return;
    }

    setPartSubmitting(true);
    setPartError('');
    try {
      const procedures = validItems.map(it => ({
        privateProcedureId: it.procedureId,
        doctorId: it.doctorId || null,
        notes: it.notes.trim() || null,
      }));
      await api.put(`/scheduling/calls/${partModalCall.id}/private-procedures`, { procedures });

      const materials = partCombinedMaterials();
      if (materials.length > 0) {
        try {
          await api.post(`/scheduling/calls/${partModalCall.id}/inventory`, { materials });
        } catch (invErr: any) {
          const code = invErr?.response?.data?.error?.code;
          const msg = invErr?.response?.data?.error?.message || 'Erro ao baixar estoque';
          if (code === 'INSUFFICIENT_STOCK') {
            setPartError(msg);
            setPartTab('estoque');
            try {
              const { data } = await api.get('/inventory/products', { params: { limit: 500 } });
              setInventoryProducts(data.data || []);
            } catch {}
            return;
          }
          throw invErr;
        }
      }

      if (!partRetro) {
        await api.patch(`/scheduling/calls/${partModalCall.id}`, { status: 'completed' });
      }

      showToast(partRetro ? 'Procedimentos registrados!' : 'Realizacao confirmada!');
      setPartModalCall(null);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao salvar procedimento');
    } finally {
      setPartSubmitting(false);
    }
  };

  // Open edit modal for doctor assignment
  const openDoctorEdit = (a: Appointment) => {
    setDoctorEditCall(a);
    setDoctorEditValue(a.doctorId || '');
  };

  const saveDoctorEdit = async () => {
    if (!doctorEditCall) return;
    setSavingDoctor(true);
    try {
      await api.patch(`/scheduling/calls/${doctorEditCall.id}/doctor`, {
        doctorId: doctorEditValue || null,
      });
      showToast('Medico atualizado!');
      setDoctorEditCall(null);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao atualizar medico');
    } finally {
      setSavingDoctor(false);
    }
  };

  // Inline authorization editor
  const startEditAuth = (a: Appointment) => {
    setAuthEditingId(a.id);
    setAuthEditValue(a.authorizationNumber || '');
  };

  const cancelEditAuth = () => {
    setAuthEditingId(null);
    setAuthEditValue('');
  };

  const saveAuth = async (id: string) => {
    setSavingAuthId(id);
    try {
      await api.patch(`/scheduling/calls/${id}/authorization`, {
        authorizationNumber: authEditValue.trim() || null,
      });
      showToast('Autorizacao salva!');
      setAuthEditingId(null);
      setAuthEditValue('');
      fetchAppointments(); setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao salvar autorizacao');
    } finally {
      setSavingAuthId(null);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.delete(`/scheduling/calls/${id}`);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
      fetchDates();
      showToast('Agendamento cancelado.');
    } catch (err: any) { showToast(err?.response?.data?.error?.message || 'Erro ao cancelar agendamento.'); }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handlePermanentDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      await api.delete(`/scheduling/calls/${deleteConfirmId}/permanent`);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
      fetchDates();
      showToast('Agendamento excluido permanentemente.');
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao excluir agendamento.');
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  // Revert status
  const [revertTarget, setRevertTarget] = useState<Appointment | null>(null);
  const [reverting, setReverting] = useState(false);

  const handleRevertStatus = async () => {
    if (!revertTarget) return;
    setReverting(true);
    try {
      await api.patch(`/scheduling/calls/${revertTarget.id}/revert-status`);
      fetchAppointments(); setAgendaRefresh(r => r + 1);
      showToast('Status revertido com sucesso.');
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao reverter status.');
    } finally {
      setReverting(false);
      setRevertTarget(null);
    }
  };

  const activeStatuses = new Set(['scheduled', 'confirmed', 'awaiting_payment', 'present', 'in_attendance', 'attended', 'completed', 'no_show']);

  const agendaActive = useMemo(() => agendaAppointments.filter(a => activeStatuses.has(a.status)), [agendaAppointments]);

  const agendaByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of agendaActive) {
      const key = format(new Date(a.date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [agendaActive]);

  const agendaWeekStart = useMemo(() => startOfWeek(agendaDate, { weekStartsOn: 1 }), [agendaDate]);

  const agendaMonthDays = useMemo(() => {
    const ms = startOfMonth(agendaDate);
    const me = endOfMonth(agendaDate);
    const gs = startOfWeek(ms, { weekStartsOn: 1 });
    const ge = endOfWeek(me, { weekStartsOn: 1 });
    const days: Date[] = [];
    let d = gs;
    while (d <= ge) { days.push(d); d = addDays(d, 1); }
    return days;
  }, [agendaDate]);

  const agendaDoctorsForDay = useCallback((dateStr: string) => {
    const dayKeyMap: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
    const dayKey = dayKeyMap[dayOfWeek];
    return doctors.filter(d => {
      if (!d.horarios) return false;
      const h = d.horarios[dayKey];
      return h && h.ativo;
    });
  }, [doctors]);

  const navigateAgenda = (dir: number) => {
    if (agendaMode === 'diario') setAgendaDate(d => addDays(d, dir));
    else if (agendaMode === 'semanal') setAgendaDate(d => addDays(d, dir * 7));
    else setAgendaDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1));
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

  const openReturnModal = (a: Appointment) => {
    setReturnModalCall(a);
    setReturnForm({ doctorId: a.doctorId || '', date: '', time: '', notes: 'Retorno' });
    setReturnCalMonth(startOfMonth(new Date()));
    setReturnSlots([]);
  };

  const handleBookReturn = async () => {
    if (!returnModalCall || !returnForm.date || !returnForm.time) return;
    setSavingReturn(true);
    try {
      await api.post('/scheduling/book', {
        name: returnModalCall.customer?.name || returnModalCall.name,
        phone: returnModalCall.customer?.phone || returnModalCall.phone,
        email: returnModalCall.customer?.email || returnModalCall.email || undefined,
        date: returnForm.date,
        time: returnForm.time,
        notes: returnForm.notes || 'Retorno',
        customerId: returnModalCall.customerId || undefined,
        doctorId: returnForm.doctorId || undefined,
        isReturn: true,
        originalCallId: returnModalCall.id,
      });
      showToast('Retorno agendado com sucesso!');
      setReturnModalCall(null);
      fetchAppointments();
      setAgendaRefresh(r => r + 1);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao agendar retorno');
    } finally {
      setSavingReturn(false);
    }
  };

  useEffect(() => {
    if (!returnModalCall || !returnForm.doctorId || !returnForm.date) {
      setReturnSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingReturnSlots(true);
    api.get(`/scheduling/available-slots/${returnForm.date}`, {
      params: { doctorId: returnForm.doctorId, tenantId: user?.tenant?.id },
    })
      .then(({ data }) => { if (!cancelled) setReturnSlots(data.data || []); })
      .catch(() => { if (!cancelled) setReturnSlots([]); })
      .finally(() => { if (!cancelled) setLoadingReturnSlots(false); });
    return () => { cancelled = true; };
  }, [returnModalCall, returnForm.doctorId, returnForm.date]);

  const isReturnEligible = (a: Appointment) => {
    if (a.status !== 'completed' || a.isReturn || a.returnCall) return false;
    const deadline = new Date(a.date);
    deadline.setDate(deadline.getDate() + 30);
    return new Date() <= deadline;
  };

  const renderAppointmentCard = (a: Appointment) => {
    const isCompleted = a.status === 'completed';
    const dStatus = getDisplayStatus(a);
    const allProcsPaid = dStatus === 'paid';
    return (
    <div key={a.id} className={`rounded-xl border shadow-sm p-4 space-y-3 ${a.status === 'no_show' ? 'bg-red-50/50 border-red-300 opacity-75' : isCompleted ? 'bg-slate-50 border-slate-200 opacity-60' : a.isEncaixe ? 'bg-orange-50/30 border-orange-300' : 'bg-white border-slate-200'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="bg-[#EFF6FF] rounded-lg p-3 text-center min-w-[60px]">
            <p className="text-xs text-[#1E3A5F] font-medium">{format(new Date(a.date), 'MMM', { locale: ptBR }).toUpperCase()}</p>
            <p className="text-xl font-bold text-[#1E3A5F]">{format(new Date(a.date), 'dd')}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {a.customerId ? (
                <button onClick={() => setPatientPanelId(a.customerId!)} className="font-medium text-[#2563EB] hover:underline text-left">
                  {a.customer?.name || a.name}
                </button>
              ) : (
                <span className="font-medium text-slate-800">{a.name}</span>
              )}
              {a.isEncaixe && (
                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Encaixe</span>
              )}
              {a.isReturn && (
                <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1"><RotateCcw size={10} />Retorno</span>
              )}
              {a.returnCall && (
                <span className="text-xs bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">Retorno em {format(new Date(a.returnCall.date), 'dd/MM')}</span>
              )}
              {(() => {
                const pt = a.paymentType || 'PARTICULAR';
                if (pt === 'RETURN') return null;
                if (pt === 'CONVENIO') {
                  const nome = a.convenio?.nome || (a.convenioId ? conveniosLookup[a.convenioId]?.nome : null) || 'Convenio';
                  return <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{nome}</span>;
                }
                return <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Particular</span>;
              })()}
              {a.doctor ? (
                <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                  <Stethoscope size={11} /> {a.doctor.name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                  <AlertTriangle size={11} /> Sem medico
                </span>
              )}
              <button onClick={() => openDoctorEdit(a)} title="Editar medico" className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                <UserCog size={13} />
              </button>
              {(() => { const rn = getRoomName(a); return rn ? <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded"><DoorOpen size={11} />{rn}</span> : null; })()}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
              <span className="flex items-center gap-1"><Clock size={14} />{format(new Date(a.date), 'HH:mm')}</span>
              <span className="flex items-center gap-1"><Phone size={14} />{a.phone}</span>
            </div>
            {a.paymentType === 'CONVENIO' && a.customerId && convenioMap[a.customerId] && (
              <div className="mt-2">
                {authEditingId === a.id ? (
                  <div className="flex items-center gap-1.5">
                    <input type="text" value={authEditValue} onChange={(e) => setAuthEditValue(e.target.value)} placeholder="Numero de autorizacao" className="px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#2563EB]" autoFocus />
                    <button onClick={() => saveAuth(a.id)} disabled={savingAuthId === a.id} className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Check size={12} /></button>
                    <button onClick={cancelEditAuth} className="p-1 rounded bg-slate-50 text-slate-500 hover:bg-slate-100"><X size={12} /></button>
                  </div>
                ) : a.authorizationNumber ? (
                  <button onClick={() => startEditAuth(a)} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded hover:bg-emerald-100" title="Clique para editar">
                    <ShieldCheck size={11} /> Autorizado: {a.authorizationNumber}
                  </button>
                ) : (
                  <button onClick={() => startEditAuth(a)} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded hover:bg-amber-100" title="Clique para adicionar numero de autorizacao">
                    <ShieldAlert size={11} /> Sem autorizacao
                  </button>
                )}
              </div>
            )}
            {a.notes && <p className="text-xs text-slate-400 mt-1">{a.notes}</p>}
            {/* Private procedure info */}
            {a.paymentType === 'PARTICULAR' && a.privateProcedureCalls && a.privateProcedureCalls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.privateProcedureCalls.map(pc => (
                  <span key={pc.id} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                    {pc.privateProcedure.name}
                    {pc.privateProcedure.value != null && <span className="font-medium">R$ {Number(pc.privateProcedure.value).toFixed(2)}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isCompleted && ['scheduled', 'confirmed', 'awaiting_payment'].includes(a.status) && (
            <button onClick={() => openEditModal(a)} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center gap-1"><Pencil size={14} />Editar</button>
          )}
          {a.status === 'no_show' && (
            <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium flex items-center gap-1">❌ Faltou</span>
          )}
          {isCompleted && isReturnEligible(a) && (
            <button onClick={() => openReturnModal(a)} className="px-3 py-1.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-medium hover:bg-sky-100 flex items-center gap-1"><RotateCcw size={14} />Agendar Retorno</button>
          )}
          {isCompleted && !isReturnEligible(a) && (
            <span className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs">Realizado</span>
          )}
          {isCompleted && canRevert && (
            <button onClick={() => setRevertTarget(a)} className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 flex items-center gap-1">
              <Undo2 size={14} />Desfazer realizado
            </button>
          )}
          {!isCompleted && a.status === 'scheduled' && (
            <button onClick={() => handleStatusChange(a.id, 'confirmed')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 flex items-center gap-1"><Check size={14} />Confirmar</button>
          )}
          {!isCompleted && a.status === 'confirmed' && a.paymentType === 'PARTICULAR' && (
            <button onClick={async () => { const ok = await handleStatusChange(a.id, 'awaiting_payment'); if (ok) openPaymentModal(a.id); }} disabled={updatingId === a.id} className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-semibold hover:bg-yellow-600 flex items-center gap-1">Efetuar pagamento</button>
          )}
          {!isCompleted && a.status === 'confirmed' && a.paymentType !== 'PARTICULAR' && (
            <button onClick={() => handleStatusChange(a.id, 'present')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 flex items-center gap-1"><UserCheck size={14} />Presente</button>
          )}
          {!isCompleted && a.status === 'awaiting_payment' && !allProcsPaid && (
            <button onClick={() => openPaymentModal(a.id)} className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-semibold hover:bg-yellow-600 flex items-center gap-1 animate-pulse">Efetuar pagamento</button>
          )}
          {!isCompleted && a.status === 'awaiting_payment' && allProcsPaid && (
            <button onClick={() => handleStatusChange(a.id, 'present')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 flex items-center gap-1"><UserCheck size={14} />Presente</button>
          )}
          {!isCompleted && canRevert && (a.status === 'confirmed' || a.status === 'awaiting_payment' || a.status === 'present' || a.status === 'attended') && (
            <button onClick={() => setRevertTarget(a)} className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 flex items-center gap-1">
              <Undo2 size={14} />{a.status === 'present' ? 'Desfazer presente' : a.status === 'attended' ? 'Desfazer atendido' : a.status === 'awaiting_payment' ? (allProcsPaid ? 'Desfazer pago' : 'Cancelar pagamento') : 'Desconfirmar'}
            </button>
          )}
          {!isCompleted && a.status === 'in_attendance' && (
            <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium flex items-center gap-1">Em atendimento...</span>
          )}
          {!isCompleted && a.status === 'attended' && (
            <>
              <button onClick={() => handleRealized(a)} disabled={updatingId === a.id} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1 animate-pulse"><Check size={14} />Realizado</button>
              {a.paymentType === 'PARTICULAR' ? (
                <button onClick={() => { setAddProcCallId(a.id); setAddProcRows([{ procedureId: '', doctorId: '' }]); }} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center gap-1"><Calendar size={14} />Novo procedimento</button>
              ) : (
                <button onClick={() => openTussModalForCall(a, true)} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center gap-1"><Calendar size={14} />Novo procedimento</button>
              )}
            </>
          )}
          {a.status !== 'attended' && a.status !== 'in_attendance' && a.status !== 'completed' && a.status !== 'awaiting_payment' && a.status !== 'no_show' && (
            <button onClick={() => handleRealized(a)} disabled={updatingId === a.id} className="px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-100">Realizado</button>
          )}
          {!isCompleted && a.status !== 'in_attendance' && a.status !== 'attended' && a.status !== 'awaiting_payment' && a.status !== 'no_show' && (
            <button onClick={() => handleStatusChange(a.id, 'no_show')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 flex items-center gap-1"><AlertTriangle size={14} />Faltou</button>
          )}
          {!isCompleted && a.status !== 'in_attendance' && a.status !== 'attended' && a.status !== 'awaiting_payment' && a.status !== 'no_show' && (
            <button onClick={() => handleCancel(a.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 flex items-center gap-1"><XCircle size={14} />Cancelar</button>
          )}
          {!isCompleted && canRevert && (
            <button onClick={() => setDeleteConfirmId(a.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 flex items-center gap-1" title="Excluir permanentemente"><Trash2 size={14} />Excluir</button>
          )}
        </div>
      </div>
      <div className="pt-2 border-t border-slate-100">
        <StatusTimeline status={dStatus} />
      </div>
    </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Agendamentos</h2>
          <p className="text-slate-500 mt-1">Gerencie consultas e compromissos</p>
        </div>
        <button onClick={openBook} className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors">
          <Calendar size={18} />
          Novo agendamento
        </button>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <button onClick={() => setView('list')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === 'list' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Agendamentos
        </button>
        <button onClick={() => setView('history')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === 'history' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Historico
        </button>
        <button onClick={() => setView('calendar')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === 'calendar' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Calendario
        </button>
      </div>

      {/* Doctor filter dropdown — visible only for roles that can see all agendas */}
      {canSeeAllAgendas && doctors.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <Stethoscope size={16} className="text-slate-500" />
          <select
            value={filterDoctorId}
            onChange={e => setFilterDoctorId(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] bg-white min-w-[220px]"
          >
            <option value="">Todos os medicos</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>{d.name}{d.especialidade ? ` — ${d.especialidade}` : ''}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A5F]" /></div>
      ) : (
        <>
          {/* List View — Agenda Modes */}
          {view === 'list' && (
            <div className="space-y-4">
              {/* Mode selector + navigation */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {(['diario', 'semanal', 'mensal'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setAgendaMode(m)}
                      className={`px-4 py-1.5 text-sm font-medium transition-colors ${agendaMode === m ? 'bg-[#1E3A5F] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {m === 'diario' ? 'Diario' : m === 'semanal' ? 'Semanal' : 'Mensal'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigateAgenda(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><ChevronLeft size={18} /></button>
                  <span className="text-sm font-semibold text-slate-800 min-w-[180px] text-center capitalize">
                    {agendaMode === 'diario' && format(agendaDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    {agendaMode === 'semanal' && `${format(agendaWeekStart, 'dd MMM', { locale: ptBR })} - ${format(addDays(agendaWeekStart, 6), 'dd MMM yyyy', { locale: ptBR })}`}
                    {agendaMode === 'mensal' && format(agendaDate, 'MMMM yyyy', { locale: ptBR })}
                  </span>
                  <button onClick={() => navigateAgenda(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><ChevronRight size={18} /></button>
                </div>
                <button
                  onClick={() => setAgendaDate(new Date())}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#EFF6FF] text-[#1E3A5F] hover:bg-[#DBEAFE]"
                >
                  Hoje
                </button>
                <span className="text-xs text-slate-400 ml-auto">{agendaActive.length} agendamento(s)</span>
              </div>

              {loadingAgenda ? (
                <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A5F]" /></div>
              ) : (
                <>
                  {/* DIARIO */}
                  {agendaMode === 'diario' && (() => {
                    const dateStr = format(agendaDate, 'yyyy-MM-dd');
                    const dayAppts = agendaActive.filter(a => format(new Date(a.date), 'yyyy-MM-dd') === dateStr);
                    const doctorsToday = agendaDoctorsForDay(dateStr);
                    const dayKeyMap: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
                    const dayKey = dayKeyMap[agendaDate.getDay()];
                    const timeGrid = buildTimeGrid(dayAppts, doctorsToday, dayKey, filterDoctorId);

                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-2 space-y-3">
                          <h3 className="font-semibold text-slate-800">Grade de horarios ({dayAppts.length} agendamento{dayAppts.length !== 1 ? 's' : ''})</h3>
                          {timeGrid.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                              <p className="text-sm text-slate-500">Nenhum horario configurado para este dia.</p>
                            </div>
                          ) : (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                              <div className="divide-y divide-slate-100">
                                {timeGrid.map((row, idx) => (
                                  <div key={row.appointment?.id || `free-${row.time}-${idx}`} className={`flex ${row.type === 'appointment' ? (row.appointment?.status === 'no_show' ? 'bg-red-50/40' : '') : 'hover:bg-blue-50/50'}`}>
                                    <div className={`w-16 shrink-0 flex items-center justify-center py-3 border-r border-slate-100 ${row.type === 'appointment' ? (row.appointment?.status === 'no_show' ? 'bg-red-50' : 'bg-slate-50') : 'bg-white'}`}>
                                      <span className={`text-xs font-mono font-semibold ${row.type === 'appointment' ? 'text-[#1E3A5F]' : 'text-slate-400'}`}>{row.time}</span>
                                    </div>
                                    {row.type === 'appointment' && row.appointment ? (
                                      <div className="flex-1 min-w-0 p-2">
                                        {renderAppointmentCard(row.appointment)}
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          const bf = { name: '', phone: '', email: '', date: dateStr, time: row.time, notes: '', customerId: '', doctorId: filterDoctorId || '' };
                                          setBookForm(bf);
                                          setSelectedBookCustomer(null);
                                          setCustomerSearch('');
                                          resetPaymentState();
                                          setBookEncaixe(false);
                                          setBookCalMonth(startOfMonth(agendaDate));
                                          setShowBookModal(true);
                                        }}
                                        className="flex-1 min-w-0 flex items-center gap-2 px-4 py-3 text-sm text-slate-400 hover:text-[#2563EB] transition-colors group"
                                      >
                                        <Plus size={14} className="text-slate-300 group-hover:text-[#2563EB]" />
                                        <span className="group-hover:text-[#2563EB]">Horario livre — clique para agendar</span>
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="space-y-4">
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                            <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                              <Stethoscope size={16} className="text-emerald-600" /> Medicos do dia
                            </h4>
                            {doctorsToday.length === 0 ? (
                              <p className="text-sm text-slate-500 text-center py-4">Nenhum medico neste dia</p>
                            ) : (
                              <div className="space-y-2">
                                {doctorsToday.map(d => {
                                  const h = d.horarios![dayKey] as DoctorHorario;
                                  const shifts: string[] = [];
                                  if (h.manha) shifts.push(`${h.manha.inicio} - ${h.manha.fim}`);
                                  if (h.tarde) shifts.push(`${h.tarde.inicio} - ${h.tarde.fim}`);
                                  if (shifts.length === 0 && h.inicio && h.fim) shifts.push(`${h.inicio} - ${h.fim}`);
                                  const doctorApptCount = dayAppts.filter(a => a.doctorId === d.id).length;
                                  return (
                                    <div key={d.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <span className="text-sm font-semibold text-slate-800">{d.name}</span>
                                          {d.especialidade && <p className="text-xs text-slate-500">{d.especialidade}</p>}
                                        </div>
                                        <span className="text-xs bg-[#EFF6FF] text-[#1E3A5F] px-2 py-0.5 rounded-full font-medium">{doctorApptCount} consulta{doctorApptCount !== 1 ? 's' : ''}</span>
                                      </div>
                                      {shifts.map((s, i) => (
                                        <div key={i} className="flex items-center gap-1.5 mt-1">
                                          <Clock size={12} className="text-slate-400" />
                                          <span className="text-xs text-slate-600">{s}</span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* SEMANAL */}
                  {agendaMode === 'semanal' && (() => {
                    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(agendaWeekStart, i));
                    const dayKeyMapW: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-3">
                        {weekDays.map(day => {
                          const dayStr = format(day, 'yyyy-MM-dd');
                          const dayAppts = agendaByDay.get(dayStr) || [];
                          const today = isToday(day);
                          const dayKey = dayKeyMapW[day.getDay()];
                          const doctorsThisDay = agendaDoctorsForDay(dayStr);
                          const grid = buildTimeGrid(dayAppts, doctorsThisDay, dayKey, filterDoctorId);
                          const occupiedCount = grid.filter(r => r.type === 'appointment').length;
                          return (
                            <div key={dayStr} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${today ? 'border-[#2563EB] ring-1 ring-[#2563EB]' : 'border-slate-200'}`}>
                              <div className={`px-3 py-2 text-center ${today ? 'bg-[#1E3A5F] text-white' : 'bg-slate-50'}`}>
                                <p className={`text-xs font-medium capitalize ${today ? 'text-white/80' : 'text-slate-500'}`}>{format(day, 'EEE', { locale: ptBR })}</p>
                                <p className={`text-lg font-bold ${today ? 'text-white' : 'text-slate-800'}`}>{format(day, 'dd')}</p>
                                {grid.length > 0 && (
                                  <p className={`text-[10px] mt-0.5 ${today ? 'text-white/70' : 'text-slate-400'}`}>{occupiedCount}/{grid.length} ocupados</p>
                                )}
                              </div>
                              <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
                                {grid.length === 0 && (
                                  <p className="text-xs text-slate-400 text-center py-4">Sem horarios</p>
                                )}
                                {grid.map((row, rIdx) => (
                                  <div key={row.appointment?.id || `free-${row.time}-${rIdx}`} className={`flex items-center gap-1.5 px-2 py-1.5 ${row.type === 'free' ? 'hover:bg-blue-50/50' : ''}`}>
                                    <span className={`text-[10px] font-mono w-10 shrink-0 ${row.type === 'appointment' ? 'font-semibold text-[#1E3A5F]' : 'text-slate-400'}`}>{row.time}</span>
                                    {row.type === 'appointment' && row.appointment ? (
                                      <button
                                        onClick={() => { setAgendaMode('diario'); setAgendaDate(day); }}
                                        className="flex-1 min-w-0 text-left"
                                      >
                                        <p className="text-xs font-medium text-slate-800 truncate">{row.appointment.customer?.name || row.appointment.name}</p>
                                        <div className="flex items-center gap-1">
                                          {(() => { const ds = getDisplayStatus(row.appointment!); return <span className={`text-[9px] px-1 py-0.5 rounded ${statusMap[ds]?.cls || ''}`}>{statusMap[ds]?.icon}</span>; })()}
                                          {row.appointment.doctor && <span className="text-[9px] text-indigo-600 truncate">{row.appointment.doctor.name}</span>}
                                        </div>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          const bf = { name: '', phone: '', email: '', date: dayStr, time: row.time, notes: '', customerId: '', doctorId: filterDoctorId || '' };
                                          setBookForm(bf);
                                          setSelectedBookCustomer(null);
                                          setCustomerSearch('');
                                          resetPaymentState();
                                          setBookEncaixe(false);
                                          setBookCalMonth(startOfMonth(day));
                                          setShowBookModal(true);
                                        }}
                                        className="flex-1 min-w-0 text-[10px] text-slate-300 hover:text-[#2563EB] transition-colors"
                                      >
                                        + Livre
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* MENSAL */}
                  {agendaMode === 'mensal' && (() => {
                    const dayKeyMapM: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
                    return (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="grid grid-cols-7 mb-1">
                        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map(d => (
                          <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {agendaMonthDays.map(day => {
                          const dayStr = format(day, 'yyyy-MM-dd');
                          const inMonth = isSameMonth(day, agendaDate);
                          const today = isToday(day);
                          const dayAppts = agendaByDay.get(dayStr) || [];
                          const count = dayAppts.length;
                          const dayKey = dayKeyMapM[day.getDay()];
                          const doctorsThisDay = inMonth ? agendaDoctorsForDay(dayStr) : [];
                          const totalSlots = inMonth && doctorsThisDay.length > 0 ? buildTimeGrid([], doctorsThisDay, dayKey, filterDoctorId).length : 0;

                          return (
                            <button
                              key={dayStr}
                              onClick={() => { setAgendaMode('diario'); setAgendaDate(day); }}
                              disabled={!inMonth}
                              className={`relative p-2 rounded-lg text-sm transition-colors min-h-[72px] flex flex-col items-center
                                ${!inMonth ? 'text-slate-300 cursor-default' : 'hover:bg-[#EFF6FF] cursor-pointer'}
                                ${today ? 'ring-2 ring-[#2563EB] ring-inset font-semibold bg-[#EFF6FF]' : ''}
                              `}
                            >
                              <span className={`text-sm ${inMonth ? 'text-slate-700' : 'text-slate-300'}`}>{format(day, 'd')}</span>
                              {inMonth && (count > 0 || totalSlots > 0) && (
                                <div className="mt-1 flex flex-col items-center gap-0.5">
                                  {count > 0 && (
                                    <div className="flex gap-0.5">
                                      {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                                      ))}
                                    </div>
                                  )}
                                  <span className="text-[10px] font-medium text-[#1E3A5F]">
                                    {totalSlots > 0 ? `${count}/${totalSlots}` : `${count} consulta${count !== 1 ? 's' : ''}`}
                                  </span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* History View */}
          {view === 'history' && (
            <div>
              {/* Date filters */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600 font-medium">De:</label>
                  <input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600 font-medium">Ate:</label>
                  <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                </div>
                <button
                  onClick={() => { const today = format(new Date(), 'yyyy-MM-dd'); setHistoryFrom(today); setHistoryTo(today); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  Hoje
                </button>
                <span className="text-xs text-slate-400 ml-auto">{historyData.length} registro(s)</span>
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A5F]" /></div>
              ) : historyData.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                  <p className="text-sm text-slate-500">Nenhum registro no historico para o periodo selecionado.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historyData.map((a) => {
                    const st = statusMap[getDisplayStatus(a)] || { label: a.status, cls: 'bg-gray-100 text-gray-600', icon: '⬜', step: 0 };
                    const isRealized = a.status === 'completed';
                    const hasProcs = (a.procedures?.length || 0) > 0;
                    const hasPrivProcs = (a.privateProcedureCalls?.length || 0) > 0;
                    const isExpanded = expandedHistoryId === a.id;
                    return (
                      <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isRealized && hasProcs && (
                                <button
                                  onClick={() => openTussModalForCall(a, true)}
                                  title={`Clique para editar TUSS — ${a.procedures?.map((p) => `${p.tussProcedure.code} ${p.tussProcedure.description}`).join('; ')}`}
                                  className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded hover:bg-emerald-100"
                                >
                                  <FileCheck2 size={12} /> TUSS {a.procedures?.[0]?.tussProcedure.code}
                                </button>
                              )}
                              {isRealized && !hasProcs && a.paymentType !== 'PARTICULAR' && (
                                <span title="Sem TUSS vinculado" className="flex items-center text-amber-500"><AlertCircle size={14} /></span>
                              )}
                              <span className="text-sm text-slate-500">{format(new Date(a.date), 'dd/MM HH:mm')}</span>
                              {a.customerId ? (
                                <button onClick={() => setPatientPanelId(a.customerId!)} className="text-sm font-medium text-[#2563EB] hover:underline truncate text-left">
                                  {a.customer?.name || a.name}
                                </button>
                              ) : (
                                <span className="text-sm font-medium text-slate-800 truncate">{a.name}</span>
                              )}
                              {a.isEncaixe && (
                                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Encaixe</span>
                              )}
                              {a.isReturn && (
                                <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1"><RotateCcw size={10} />Retorno</span>
                              )}
                              {a.returnCall && (
                                <span className="text-xs bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">Retorno em {format(new Date(a.returnCall.date), 'dd/MM')}</span>
                              )}
                              {(() => {
                                const pt = a.paymentType || 'PARTICULAR';
                                if (pt === 'RETURN') return null;
                                if (pt === 'CONVENIO') {
                                  const nome = a.convenio?.nome || (a.convenioId ? conveniosLookup[a.convenioId]?.nome : null) || 'Convenio';
                                  return (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{nome}</span>
                                  );
                                }
                                return (
                                  <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Particular</span>
                                );
                              })()}
                              <span className="text-sm text-slate-500 hidden sm:inline">{a.phone}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {a.doctor ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                                  <Stethoscope size={11} /> {a.doctor.name}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                                  <AlertTriangle size={11} /> Sem medico
                                </span>
                              )}
                              <button
                                onClick={() => openDoctorEdit(a)}
                                title="Editar medico"
                                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                              >
                                <UserCog size={12} />
                              </button>
                              {(() => { const rn = getRoomName(a); return rn ? <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded"><DoorOpen size={11} />{rn}</span> : null; })()}
                              {a.paymentType === 'CONVENIO' && a.customerId && convenioMap[a.customerId] && (
                                authEditingId === a.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={authEditValue}
                                      onChange={(e) => setAuthEditValue(e.target.value)}
                                      placeholder="Numero de autorizacao"
                                      className="px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => saveAuth(a.id)}
                                      disabled={savingAuthId === a.id}
                                      className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    >
                                      <Check size={12} />
                                    </button>
                                    <button
                                      onClick={cancelEditAuth}
                                      className="p-1 rounded bg-slate-50 text-slate-500 hover:bg-slate-100"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : a.authorizationNumber ? (
                                  <button
                                    onClick={() => startEditAuth(a)}
                                    className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded hover:bg-emerald-100"
                                    title="Clique para editar"
                                  >
                                    <ShieldCheck size={11} /> Autorizado: {a.authorizationNumber}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => startEditAuth(a)}
                                    className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded hover:bg-amber-100"
                                    title="Clique para adicionar numero"
                                  >
                                    <ShieldAlert size={11} /> Sem autorizacao
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isRealized && isReturnEligible(a) && (
                              <button
                                onClick={() => openReturnModal(a)}
                                className="px-2 py-1 text-xs font-medium rounded bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 flex items-center gap-1"
                              >
                                <RotateCcw size={12} />Retorno
                              </button>
                            )}
                            {isRealized && !hasProcs && a.paymentType !== 'PARTICULAR' && (
                              <button
                                onClick={() => openRegistrarTussForExisting(a)}
                                className="px-2 py-1 text-xs font-medium rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                              >
                                Registrar TUSS
                              </button>
                            )}
                            {isRealized && a.paymentType === 'PARTICULAR' && !((a as any).privateProcedureCalls?.length || (a as any)._count?.privateProcedureCalls) && (
                              <button
                                onClick={() => openPartModalForCall(a, true)}
                                className="px-2 py-1 text-xs font-medium rounded bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200"
                              >
                                Registrar Procedimento
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedHistoryId(isExpanded ? null : a.id)}
                              className="px-2 py-1 text-xs font-medium rounded bg-[#EFF6FF] text-[#1E3A5F] hover:bg-[#DBEAFE] border border-[#BFDBFE] flex items-center gap-1"
                              title="Ver detalhes"
                            >
                              <Eye size={12} />{isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            {canRevert && isRealized && (
                              <button
                                onClick={() => setRevertTarget(a)}
                                className="px-2 py-1 text-xs font-medium rounded bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 flex items-center gap-1"
                              >
                                <Undo2 size={12} />Desfazer realizado
                              </button>
                            )}
                            {canRevert && (
                              <button
                                onClick={() => setDeleteConfirmId(a.id)}
                                className="px-2 py-1 text-xs font-medium rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 flex items-center gap-1"
                                title="Excluir permanentemente"
                              >
                                <Trash2 size={12} />Excluir
                              </button>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded ${st.cls}`}>{st.icon} {st.label}</span>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-3">
                            {hasProcs && (
                              <div>
                                <p className="text-xs font-semibold text-slate-500 mb-1.5">Procedimentos TUSS</p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead><tr className="text-left text-slate-400 border-b border-slate-200">
                                      <th className="pb-1 pr-3">Codigo</th><th className="pb-1 pr-3">Descricao</th><th className="pb-1 pr-3">Tipo</th><th className="pb-1 pr-3">Valor</th><th className="pb-1 pr-3">Medico</th><th className="pb-1">Autorizacao</th>
                                    </tr></thead>
                                    <tbody>
                                      {a.procedures?.map((p) => (
                                        <tr key={p.id} className="border-b border-slate-100">
                                          <td className="py-1.5 pr-3 font-mono text-slate-700">{p.tussProcedure.code}</td>
                                          <td className="py-1.5 pr-3 text-slate-700">{p.tussProcedure.description}</td>
                                          <td className="py-1.5 pr-3"><span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{p.tussProcedure.type}</span></td>
                                          <td className="py-1.5 pr-3 text-slate-700">R$ {p.tussProcedure.value.toFixed(2)}</td>
                                          <td className="py-1.5 pr-3 text-slate-700">{p.doctor?.name || a.doctor?.name || '-'}</td>
                                          <td className="py-1.5 text-slate-700">{p.authorizationNumber || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {hasPrivProcs && (
                              <div>
                                <p className="text-xs font-semibold text-slate-500 mb-1.5">Procedimentos Particulares</p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead><tr className="text-left text-slate-400 border-b border-slate-200">
                                      <th className="pb-1 pr-3">Nome</th><th className="pb-1 pr-3">Tipo</th><th className="pb-1 pr-3">Valor</th><th className="pb-1 pr-3">Medico</th><th className="pb-1">Notas</th>
                                    </tr></thead>
                                    <tbody>
                                      {a.privateProcedureCalls?.map((p) => (
                                        <tr key={p.id} className="border-b border-slate-100">
                                          <td className="py-1.5 pr-3 text-slate-700">{p.privateProcedure.name}</td>
                                          <td className="py-1.5 pr-3"><span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{p.privateProcedure.type}</span></td>
                                          <td className="py-1.5 pr-3 text-slate-700">{p.privateProcedure.value != null ? `R$ ${p.privateProcedure.value.toFixed(2)}` : '-'}</td>
                                          <td className="py-1.5 pr-3 text-slate-700">{p.doctor?.name || a.doctor?.name || '-'}</td>
                                          <td className="py-1.5 text-slate-700">{p.notes || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {!hasProcs && !hasPrivProcs && (
                              <p className="text-xs text-slate-400 italic">Nenhum procedimento registrado neste agendamento.</p>
                            )}

                            {a.notes && (
                              <div>
                                <p className="text-xs font-semibold text-slate-500 mb-1">Observacoes</p>
                                <p className="text-xs text-slate-600">{a.notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Calendar View */}
          {view === 'calendar' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Monthly calendar — spans 2 cols */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"><ChevronLeft size={20} /></button>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-800 capitalize">
                      {format(calMonth, 'MMMM yyyy', { locale: ptBR })}
                    </h3>
                    {!isSameMonth(calMonth, new Date()) && (
                      <button onClick={() => setCalMonth(startOfMonth(new Date()))} className="text-xs px-2 py-1 rounded bg-[#EFF6FF] text-[#1E3A5F] font-medium hover:bg-[#DBEAFE]">
                        Hoje
                      </button>
                    )}
                  </div>
                  <button onClick={() => setCalMonth(addMonths(calMonth, 1))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"><ChevronRight size={20} /></button>
                </div>

                {/* Day of week headers */}
                <div className="grid grid-cols-7 mb-1">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
                    <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7">
                  {calendarDays.map((day) => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const inMonth = isSameMonth(day, calMonth);
                    const today = isToday(day);
                    const past = isBefore(day, new Date()) && !today;
                    const selected = selectedDate === dayStr;
                    const dayAppts = appointmentsByDay.get(dayStr) || [];
                    const activeAppts = dayAppts.filter(a => a.status !== 'cancelled');
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                    return (
                      <button
                        key={dayStr}
                        onClick={() => { if (!past && inMonth) handleDateClick(dayStr); }}
                        disabled={past || !inMonth}
                        className={`relative h-12 flex flex-col items-center justify-center rounded-lg text-sm transition-colors
                          ${!inMonth ? 'text-slate-300 cursor-default' : ''}
                          ${inMonth && past ? 'text-slate-300 cursor-not-allowed' : ''}
                          ${inMonth && !past && !selected ? 'text-slate-700 hover:bg-slate-50 cursor-pointer' : ''}
                          ${inMonth && !past && isWeekend && !selected ? 'text-slate-400' : ''}
                          ${selected ? 'bg-[#1E3A5F] text-white font-semibold' : ''}
                          ${today && !selected ? 'ring-2 ring-[#2563EB] ring-inset font-semibold' : ''}
                        `}
                      >
                        <span>{format(day, 'd')}</span>
                        {inMonth && activeAppts.length > 0 && (
                          <span className={`absolute bottom-1 flex items-center gap-0.5 ${selected ? 'text-white/80' : ''}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white/80' : 'bg-[#2563EB]'}`} />
                            {activeAppts.length > 1 && (
                              <span className={`text-[9px] font-medium ${selected ? 'text-white/80' : 'text-[#2563EB]'}`}>{activeAppts.length}</span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {loadingMonth && (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#1E3A5F]" />
                  </div>
                )}
              </div>

              {/* Right panel — Tabbed sidebar */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 max-h-[600px] overflow-y-auto">
                {!selectedDate ? (
                  <div className="text-center py-12">
                    <Calendar size={32} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-sm text-slate-500">Selecione um dia no calendario</p>
                  </div>
                ) : loadingSlots ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A5F]" /></div>
                ) : (
                  <>
                    <h3 className="font-semibold text-slate-800 mb-1">
                      {format(new Date(selectedDate + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </h3>

                    {/* Sidebar tabs */}
                    <div className="flex gap-1 mt-3 mb-4 border-b border-slate-200">
                      <button
                        onClick={() => setSidebarTab('agendamentos')}
                        className={`pb-2 px-3 text-xs font-medium border-b-2 transition-colors ${sidebarTab === 'agendamentos' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Agendamentos
                      </button>
                      <button
                        onClick={() => setSidebarTab('medicos')}
                        className={`pb-2 px-3 text-xs font-medium border-b-2 transition-colors ${sidebarTab === 'medicos' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Medicos do dia
                      </button>
                    </div>

                    {/* Tab: Agendamentos */}
                    {sidebarTab === 'agendamentos' && (
                      <>
                        {(() => {
                          const dayAppts = (appointmentsByDay.get(selectedDate) || []).filter(a => a.status !== 'cancelled');
                          if (dayAppts.length === 0) return null;
                          return (
                            <div className="mb-4">
                              <p className="text-xs text-slate-500 mb-2">Agendados ({dayAppts.length})</p>
                              <div className="space-y-1.5">
                                {dayAppts.map(a => {
                                  const st = statusMap[getDisplayStatus(a)];
                                  return (
                                    <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-[#1E3A5F] w-12">{format(new Date(a.date), 'HH:mm')}</span>
                                        {a.customerId ? (
                                          <button onClick={() => setPatientPanelId(a.customerId!)} className="text-sm text-[#2563EB] hover:underline truncate max-w-[120px] text-left">{a.customer?.name || a.name}</button>
                                        ) : (
                                          <span className="text-sm text-slate-700 truncate max-w-[120px]">{a.name}</span>
                                        )}
                                      </div>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${st?.cls || ''}`}>{st?.label || a.status}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        <p className="text-xs text-slate-500 mb-2">Horarios disponiveis</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {slots.map((s) => (
                            <button
                              key={s.time}
                              onClick={() => s.available && openBookWithSlot(selectedDate, s.time)}
                              disabled={!s.available}
                              className={`py-2 rounded-lg text-xs font-medium transition-colors ${s.available ? 'border border-green-200 text-green-700 hover:bg-green-50' : 'bg-slate-100 text-slate-400 cursor-not-allowed line-through'}`}
                            >
                              {s.time}
                            </button>
                          ))}
                        </div>
                        {slots.filter(s => s.available).length === 0 && (
                          <p className="text-xs text-red-500 mt-2 text-center">Sem vagas disponiveis</p>
                        )}
                      </>
                    )}

                    {/* Tab: Medicos do dia */}
                    {sidebarTab === 'medicos' && (() => {
                      const dayKeyMap: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
                      const dayOfWeek = new Date(selectedDate + 'T12:00:00').getDay();
                      const dayKey = dayKeyMap[dayOfWeek];

                      const doctorsToday = doctors.filter(d => {
                        if (!d.horarios) return false;
                        const h = d.horarios[dayKey];
                        return h && h.ativo;
                      });

                      if (doctorsToday.length === 0) {
                        return (
                          <div className="text-center py-8">
                            <Stethoscope size={28} className="mx-auto text-slate-300 mb-2" />
                            <p className="text-sm text-slate-500">Nenhum medico neste dia</p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3">
                          <p className="text-xs text-slate-500">{doctorsToday.length} medico{doctorsToday.length > 1 ? 's' : ''} neste dia</p>
                          {doctorsToday.map(d => {
                            const h = d.horarios![dayKey] as DoctorHorario;
                            const shifts: string[] = [];
                            if (h.manha) shifts.push(`${h.manha.inicio} - ${h.manha.fim}`);
                            if (h.tarde) shifts.push(`${h.tarde.inicio} - ${h.tarde.fim}`);
                            if (shifts.length === 0 && h.inicio && h.fim) shifts.push(`${h.inicio} - ${h.fim}`);
                            return (
                              <div key={d.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                                <div className="flex items-center gap-2 mb-1">
                                  <Stethoscope size={14} className="text-emerald-600" />
                                  <span className="text-sm font-semibold text-slate-800">{d.name}</span>
                                </div>
                                {d.especialidade && (
                                  <p className="text-xs text-slate-500 ml-5 mb-1">{d.especialidade}</p>
                                )}
                                {shifts.map((s, i) => (
                                  <div key={i} className="flex items-center gap-1.5 ml-5">
                                    <Clock size={12} className="text-slate-400" />
                                    <span className="text-xs text-slate-600">{s}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Patient Panel Modal */}
      {patientPanelId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl my-8">
            <PatientPanel
              customerId={patientPanelId}
              onClose={() => setPatientPanelId(null)}
              initialTab="info"
              onPatientUpdated={() => { fetchAppointments(); setAgendaRefresh(r => r + 1); }}
            />
          </div>
        </div>
      )}

      {/* Book Modal */}
      {showBookModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 pb-4 shrink-0">
              <h3 className="font-semibold text-slate-800">{editingCallId ? 'Editar agendamento' : 'Novo agendamento'}</h3>
              <button onClick={() => { setShowBookModal(false); setEditingCallId(null); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleBook} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1">
              {/* Customer Search */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{editingCallId ? 'Paciente' : 'Buscar paciente'}</label>
                {editingCallId && selectedBookCustomer ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-sm font-medium text-slate-800">{selectedBookCustomer.name}</p>
                    <p className="text-xs text-slate-500">{selectedBookCustomer.phone || selectedBookCustomer.email || ''}</p>
                  </div>
                ) : selectedBookCustomer ? (
                  <div className="flex items-center justify-between p-2.5 bg-[#EFF6FF]/50 border border-[#BFDBFE] rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{selectedBookCustomer.name}</p>
                      <p className="text-xs text-slate-500">{selectedBookCustomer.phone || selectedBookCustomer.email || ''}</p>
                    </div>
                    <button type="button" onClick={clearSelectedCustomer} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Nome ou telefone do paciente..."
                      className={inputCls + ' pl-9'}
                    />
                    {customerResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {customerResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectCustomerForBooking(c)}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                          >
                            <span className="font-medium text-slate-800">{c.name}</span>
                            {c.phone && <span className="text-slate-500 ml-2">{c.phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {searchingCustomer && <p className="text-xs text-slate-400 mt-1">Buscando...</p>}
                  </div>
                )}
              </div>

              {/* Tipo de pagamento */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de pagamento</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="paymentType"
                      value="PARTICULAR"
                      checked={bookPaymentType === 'PARTICULAR'}
                      onChange={() => {
                        setBookPaymentType('PARTICULAR');
                        setBookConvenioId('');
                      }}
                    />
                    <span>Particular</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="paymentType"
                      value="CONVENIO"
                      checked={bookPaymentType === 'CONVENIO'}
                      onChange={() => setBookPaymentType('CONVENIO')}
                    />
                    <span>Convenio</span>
                  </label>
                </div>
                {bookPaymentType === 'CONVENIO' && (
                  <div className="mt-2">
                    {Object.keys(conveniosLookup).length === 0 ? (
                      <p className="text-xs text-amber-600">Nenhum convenio cadastrado. Cadastre em Configuracoes.</p>
                    ) : (
                      <select
                        value={bookConvenioId}
                        onChange={(e) => setBookConvenioId(e.target.value)}
                        className={inputCls}
                        required
                      >
                        <option value="">Selecione o convenio</option>
                        {Object.values(conveniosLookup).filter(c => c.ativo).map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {bookPaymentType === 'PARTICULAR' && (
                  <div className="mt-2">
                    {bookPrivProcedures.length === 0 ? (
                      <p className="text-xs text-amber-600">Nenhum procedimento particular cadastrado. Cadastre em Configuracoes.</p>
                    ) : (
                      <select
                        value={bookProcedureId}
                        onChange={(e) => setBookProcedureId(e.target.value)}
                        className={inputCls}
                        required
                      >
                        <option value="">Selecione o procedimento</option>
                        {bookPrivProcedures.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.value != null ? ` — R$ ${Number(p.value).toFixed(2)}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {repasseWarning && bookPaymentType === 'PARTICULAR' && (
                  <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{repasseWarning}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Medico *</label>
                <select
                  value={bookForm.doctorId}
                  onChange={(e) => setBookForm({ ...bookForm, doctorId: e.target.value })}
                  className={inputCls}
                  required
                >
                  <option value="">Selecione o medico</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}{d.especialidade ? ` — ${d.especialidade}` : ''}
                    </option>
                  ))}
                </select>
                {doctors.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Nenhum medico cadastrado. Adicione medicos na pagina Equipe.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                <input type="text" value={bookForm.name} onChange={(e) => setBookForm({ ...bookForm, name: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefone *</label>
                <input type="tel" value={bookForm.phone} onChange={(e) => setBookForm({ ...bookForm, phone: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                <input type="email" value={bookForm.email} onChange={(e) => setBookForm({ ...bookForm, email: e.target.value })} className={inputCls} />
              </div>
              {/* Mini-calendar for date selection */}
              {bookForm.doctorId ? (() => {
                const selectedDoc = doctors.find(d => d.id === bookForm.doctorId);
                const docHorarios = selectedDoc?.horarios || null;
                const DAY_MAP: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
                const calStart = startOfWeek(startOfMonth(bookCalMonth), { weekStartsOn: 0 });
                const calEnd = endOfWeek(endOfMonth(bookCalMonth), { weekStartsOn: 0 });
                const calDays: Date[] = [];
                let d = calStart;
                while (d <= calEnd) { calDays.push(d); d = addDays(d, 1); }
                const today = new Date();

                return (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Data *</label>
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <button type="button" onClick={() => setBookCalMonth(m => subMonths(m, 1))} className="p-1 hover:bg-slate-100 rounded"><ChevronLeft size={16} /></button>
                        <span className="text-sm font-semibold text-slate-700 capitalize">{format(bookCalMonth, 'MMMM yyyy', { locale: ptBR })}</span>
                        <button type="button" onClick={() => setBookCalMonth(m => addMonths(m, 1))} className="p-1 hover:bg-slate-100 rounded"><ChevronRight size={16} /></button>
                      </div>
                      <div className="grid grid-cols-7 text-center text-xs text-slate-400 mb-1">
                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => <span key={i}>{l}</span>)}
                      </div>
                      <div className="grid grid-cols-7 gap-0.5">
                        {calDays.map((day, i) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const inMonth = isSameMonth(day, bookCalMonth);
                          const isPast = isBefore(day, today) && !isToday(day);
                          const isSelected = bookForm.date === dateStr;
                          const dayKey = DAY_MAP[day.getDay()];
                          const doctorWorksThisDay = docHorarios ? !!(docHorarios[dayKey] as DoctorHorario | undefined)?.ativo : false;

                          return (
                            <button
                              key={i}
                              type="button"
                              disabled={isPast}
                              onClick={() => setBookForm(prev => ({ ...prev, date: dateStr, time: '' }))}
                              className={`text-xs py-1.5 rounded transition-colors ${
                                !inMonth ? 'text-slate-300' :
                                isPast ? 'text-slate-300 cursor-not-allowed' :
                                isSelected ? 'bg-[#1E3A5F] text-white font-bold' :
                                doctorWorksThisDay ? 'bg-blue-100 text-blue-800 font-medium hover:bg-blue-200' :
                                'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {format(day, 'd')}
                            </button>
                          );
                        })}
                      </div>
                      {bookForm.date && (
                        <p className="text-xs text-slate-500 mt-2 text-center">
                          Selecionado: {format(new Date(bookForm.date + 'T12:00:00'), 'dd/MM/yyyy')}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 justify-center">
                        <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-200" /> Dia com expediente do medico
                      </p>
                    </div>

                    {/* Encaixe toggle + Slot picker */}
                    {bookForm.date && (
                      <div className="mt-3 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bookEncaixe}
                            onChange={(e) => { setBookEncaixe(e.target.checked); setBookForm(prev => ({ ...prev, time: '' })); }}
                            className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="text-sm font-medium text-orange-600">Encaixe</span>
                          <span className="text-xs text-slate-400">— horario livre, sem bloquear agenda</span>
                        </label>
                        {bookEncaixe ? (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Horario do encaixe *</label>
                            <input
                              type="time"
                              value={bookForm.time}
                              onChange={(e) => setBookForm(prev => ({ ...prev, time: e.target.value }))}
                              className={inputCls}
                              required
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Horario *</label>
                            {loadingBookSlots ? (
                              <p className="text-xs text-slate-500">Carregando horarios...</p>
                            ) : bookSlots.length === 0 ? (
                              <p className="text-xs text-amber-600">Nenhum horario disponivel neste dia para este medico.</p>
                            ) : (
                              <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
                                {bookSlots.map(slot => (
                                  <button
                                    key={slot.time}
                                    type="button"
                                    disabled={!slot.available}
                                    onClick={() => setBookForm(prev => ({ ...prev, time: slot.time }))}
                                    className={`text-xs py-1.5 px-1 rounded transition-colors ${
                                      !slot.available ? 'bg-slate-100 text-slate-400 line-through cursor-not-allowed' :
                                      bookForm.time === slot.time ? 'bg-[#1E3A5F] text-white font-bold' :
                                      'bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300'
                                    }`}
                                  >
                                    {slot.time}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                  <Calendar size={20} className="mx-auto text-slate-400 mb-1" />
                  <p className="text-xs text-slate-500">Selecione o medico para ver datas e horarios disponiveis</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Observacoes</label>
                <textarea value={bookForm.notes} onChange={(e) => setBookForm({ ...bookForm, notes: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Ex: Retorno, primeira consulta..." />
              </div>
              </div>
              <div className="shrink-0 flex gap-3 p-6 pt-4 border-t border-slate-200 shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
                <button type="button" onClick={() => { setShowBookModal(false); setEditingCallId(null); }} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">{saving ? (editingCallId ? 'Salvando...' : 'Agendando...') : (editingCallId ? 'Salvar alteracoes' : 'Agendar')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmar Realizacao Modal — triggered by "Realizado" button */}
      {tussModalCall && (() => {
        const totalMaterialCount = Object.values(tussAllMaterials).reduce((sum, { tpl, extra }) => sum + tpl.length + extra.length, 0);
        const validItems = tussItems.filter(it => it.procedureId);
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="shrink-0">
              <div className="flex items-center justify-between p-6 pb-2">
                <h3 className="font-semibold text-slate-800">
                  {tussEditMode ? 'Editar procedimentos TUSS' : 'Confirmar Realização'}
                </h3>
                <button onClick={() => setTussModalCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <p className="text-xs text-slate-500 px-6 pb-3">
                Paciente: <strong>{tussModalCall.customer?.name || tussModalCall.name}</strong> — {format(new Date(tussModalCall.date), 'dd/MM/yyyy HH:mm')}
                {tussModalCall.doctor && <> · Medico: <strong>{tussModalCall.doctor.name}</strong></>}
              </p>

              {tussModalError && (
                <div className="mx-6 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {tussModalError}
                </div>
              )}

              {tussHasMaterials && (
                <div className="flex border-b border-slate-200 px-6 shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
                  <button type="button" onClick={() => setTussTab('tuss')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${tussTab === 'tuss' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    TUSS
                  </button>
                  <button type="button" onClick={() => setTussTab('estoque')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${tussTab === 'estoque' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    Estoque ({totalMaterialCount})
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">

            {tussLoadingList ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1E3A5F]" />
              </div>
            ) : tussModalProcedures.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                Nenhum procedimento TUSS cadastrado.<br />
                Cadastre em Configuracoes &gt; Procedimentos TUSS.
              </div>
            ) : tussTab === 'tuss' ? (
              <>
                <div className="space-y-3 mb-4">
                  {tussItems.map((item, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-500">Procedimento {idx + 1}</span>
                        {tussItems.length > 1 && (
                          <button type="button" onClick={() => setTussItems(items => items.filter((_, i) => i !== idx))}
                            className="ml-auto text-slate-400 hover:text-red-500" title="Remover">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Procedimento TUSS <span className="text-red-500">*</span></label>
                          <select value={item.procedureId}
                            onChange={(e) => setTussItems(items => items.map((it, i) => i === idx ? { ...it, procedureId: e.target.value } : it))}
                            className={inputCls}>
                            <option value="">Selecione...</option>
                            {tussModalProcedures.map((p) => (
                              <option key={p.id} value={p.id}>{p.code} — {p.description} — R$ {Number(p.value).toFixed(2)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Medico responsavel</label>
                          <select value={item.doctorId}
                            onChange={(e) => setTussItems(items => items.map((it, i) => i === idx ? { ...it, doctorId: e.target.value } : it))}
                            className={inputCls}>
                            <option value="">Medico do agendamento</option>
                            {doctors.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Num. autorizacao (opcional)</label>
                        <input type="text" value={item.authNumber}
                          onChange={(e) => setTussItems(items => items.map((it, i) => i === idx ? { ...it, authNumber: e.target.value } : it))}
                          placeholder="Ex.: 123456" className={inputCls} />
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button"
                  onClick={() => setTussItems(items => [...items, { procedureId: '', authNumber: '', doctorId: tussModalCall?.doctorId || '' }])}
                  className="text-sm font-medium text-[#1E3A5F] hover:underline mb-4">
                  + Procedimento
                </button>
                {validItems.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total ({validItems.length} procedimento{validItems.length > 1 ? 's' : ''}):</span>
                      <span className="font-semibold text-slate-800">
                        R$ {validItems.reduce((sum, it) => {
                          const proc = tussModalProcedures.find(p => p.id === it.procedureId);
                          return sum + (proc ? Number(proc.value) : 0);
                        }, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {tussItems.map((item, idx) => {
                  if (!item.procedureId) return null;
                  const proc = tussModalProcedures.find(p => p.id === item.procedureId);
                  if (!proc) return null;
                  const mats = tussAllMaterials[idx] || { tpl: [], extra: [] };
                  if (mats.tpl.length === 0 && mats.extra.length === 0) return null;
                  const docName = item.doctorId ? doctors.find(d => d.id === item.doctorId)?.name : tussModalCall?.doctor?.name;
                  return (
                    <div key={idx} className="border border-slate-200 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">
                        {proc.description}{docName ? ` (${docName})` : ''}
                      </h4>
                      {mats.tpl.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {mats.tpl.map((m, mi) => {
                            const insufficient = m.available < m.quantity;
                            return (
                              <div key={`tpl-${idx}-${mi}`} className="flex items-center gap-2 text-sm">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-slate-800 truncate">{m.productName}</div>
                                  <div className={`text-xs ${insufficient ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                    Disponivel: {m.available} {m.unit}
                                  </div>
                                </div>
                                <input type="number" min={0} step="any" value={m.quantity}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setTussAllMaterials(prev => ({
                                      ...prev,
                                      [idx]: { ...prev[idx], tpl: prev[idx].tpl.map((r, ri) => ri === mi ? { ...r, quantity: isNaN(v) ? 0 : v } : r) },
                                    }));
                                  }}
                                  className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm" />
                                <span className="text-xs text-slate-500 w-10">{m.unit}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {mats.extra.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {mats.extra.map((m, mi) => (
                            <div key={`extra-${idx}-${mi}`} className="flex items-center gap-2 text-sm">
                              <select value={m.productId}
                                onChange={(e) => {
                                  const productId = e.target.value;
                                  const prod = (inventoryProducts || []).find(p => p.id === productId);
                                  setTussAllMaterials(prev => ({
                                    ...prev,
                                    [idx]: { ...prev[idx], extra: prev[idx].extra.map((r, ri) => ri === mi ? { ...r, productId, productName: prod?.name || '', unit: prod?.unit || 'un', available: prod?.quantity ?? 0 } : r) },
                                  }));
                                }}
                                className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm">
                                <option value="">Selecione...</option>
                                {(inventoryProducts || []).map(p => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.quantity} {p.unit})</option>
                                ))}
                              </select>
                              <input type="number" min={0} step="any" value={m.quantity}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  setTussAllMaterials(prev => ({
                                    ...prev,
                                    [idx]: { ...prev[idx], extra: prev[idx].extra.map((r, ri) => ri === mi ? { ...r, quantity: isNaN(v) ? 0 : v } : r) },
                                  }));
                                }}
                                className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm" />
                              <button type="button"
                                onClick={() => setTussAllMaterials(prev => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], extra: prev[idx].extra.filter((_, ri) => ri !== mi) },
                                }))}
                                className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button type="button"
                        onClick={() => setTussAllMaterials(prev => ({
                          ...prev,
                          [idx]: { ...prev[idx], extra: [...(prev[idx]?.extra || []), { productId: '', productName: '', unit: 'un', quantity: 1, available: 0 }] },
                        }))}
                        className="text-xs font-medium text-[#1E3A5F] hover:underline">
                        + Adicionar material
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            </div>
            <div className="shrink-0 flex gap-2 p-6 pt-4 border-t border-slate-200 shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
              <button onClick={() => setTussModalCall(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              {tussRetroMode && tussAlreadyCompleted && (tussModalCall.procedures?.length || 0) > 0 && tussTab === 'estoque' && (
                <button onClick={submitInventoryOnly}
                  disabled={tussSaving || totalMaterialCount === 0}
                  className="flex-1 py-2.5 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
                  title="Registrar somente a baixa de estoque (sem mexer no TUSS)">
                  {tussSaving ? 'Salvando...' : 'Registrar retro'}
                </button>
              )}
              <button onClick={submitTussModal}
                disabled={tussSaving || tussLoadingList || validItems.length === 0}
                className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                {tussSaving
                  ? 'Salvando...'
                  : tussTab === 'tuss' && tussHasMaterials
                    ? 'Proximo: Estoque'
                    : tussEditMode ? 'Salvar' : 'Registrar procedimentos'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* PARTICULAR procedure modal — separate from TUSS */}
      {partModalCall && (() => {
        const totalPartMaterialCount = Object.values(partAllMaterials).reduce((sum, { tpl, extra }) => sum + tpl.length + extra.length, 0);
        const validPartItems = partItems.filter(it => it.procedureId);
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="shrink-0">
              <div className="flex items-center justify-between p-6 pb-2">
                <h3 className="font-semibold text-slate-800">
                  {partRetro ? 'Registrar Procedimentos Particulares' : 'Confirmar Realizacao — Particular'}
                </h3>
                <button onClick={() => setPartModalCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <p className="text-xs text-slate-500 px-6 pb-3">
                Paciente: <strong>{partModalCall.customer?.name || partModalCall.name}</strong> — {format(new Date(partModalCall.date), 'dd/MM/yyyy HH:mm')}
                {partModalCall.doctor && <> · Medico: <strong>{partModalCall.doctor.name}</strong></>}
              </p>

              {partError && (
                <div className="mx-6 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{partError}</div>
              )}

              {partHasMaterials && (
                <div className="flex border-b border-slate-200 px-6 shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
                  <button type="button" onClick={() => setPartTab('procedimento')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${partTab === 'procedimento' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    Procedimentos
                  </button>
                  <button type="button" onClick={() => setPartTab('estoque')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${partTab === 'estoque' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    Estoque {totalPartMaterialCount > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs bg-[#1E3A5F] text-white rounded-full">
                        {totalPartMaterialCount}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">

            {partLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1E3A5F]" />
              </div>
            ) : partTab === 'procedimento' ? (
              <>
                {partProcedures.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500">
                    Nenhum procedimento particular cadastrado.<br />
                    Cadastre em Configuracoes &rarr; Procedimentos.
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {partItems.map((item, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-slate-500">Procedimento {idx + 1}</span>
                          {partItems.length > 1 && (
                            <button type="button" onClick={() => setPartItems(items => items.filter((_, i) => i !== idx))}
                              className="ml-auto text-slate-400 hover:text-red-500" title="Remover">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Procedimento <span className="text-red-500">*</span></label>
                            <select value={item.procedureId}
                              onChange={(e) => setPartItems(items => items.map((it, i) => i === idx ? { ...it, procedureId: e.target.value } : it))}
                              className={inputCls}>
                              <option value="">Selecione...</option>
                              {partProcedures.map(p => (
                                <option key={p.id} value={p.id}>{p.name}{p.value != null ? ` — R$ ${Number(p.value).toFixed(2)}` : ''}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Medico responsavel</label>
                            <select value={item.doctorId}
                              onChange={(e) => setPartItems(items => items.map((it, i) => i === idx ? { ...it, doctorId: e.target.value } : it))}
                              className={inputCls}>
                              <option value="">Medico do agendamento</option>
                              {doctors.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="mt-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes (opcional)</label>
                          <input type="text" value={item.notes}
                            onChange={(e) => setPartItems(items => items.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it))}
                            placeholder="Observacoes..." className={inputCls} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {partProcedures.length > 0 && (
                  <button type="button"
                    onClick={() => setPartItems(items => [...items, { procedureId: '', doctorId: partModalCall?.doctorId || '', notes: '' }])}
                    className="text-sm font-medium text-[#1E3A5F] hover:underline mb-4">
                    + Procedimento
                  </button>
                )}
                {validPartItems.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total ({validPartItems.length} procedimento{validPartItems.length > 1 ? 's' : ''}):</span>
                      <span className="font-semibold text-slate-800">
                        R$ {validPartItems.reduce((sum, it) => {
                          const proc = partProcedures.find(p => p.id === it.procedureId);
                          return sum + (proc ? Number(proc.value || 0) : 0);
                        }, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {partItems.map((item, idx) => {
                  if (!item.procedureId) return null;
                  const proc = partProcedures.find(p => p.id === item.procedureId);
                  if (!proc) return null;
                  const mats = partAllMaterials[idx] || { tpl: [], extra: [] };
                  if (mats.tpl.length === 0 && mats.extra.length === 0) return null;
                  const docName = item.doctorId ? doctors.find(d => d.id === item.doctorId)?.name : partModalCall?.doctor?.name;
                  return (
                    <div key={idx} className="border border-slate-200 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">
                        {proc.name}{docName ? ` (${docName})` : ''}
                      </h4>
                      {mats.tpl.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {mats.tpl.map((m, mi) => {
                            const insufficient = m.available < m.quantity;
                            return (
                              <div key={`pt-${idx}-${mi}`} className="flex items-center gap-2 text-sm">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-slate-800 truncate">{m.productName}</div>
                                  <div className={`text-xs ${insufficient ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                    Disponivel: {m.available} {m.unit}
                                  </div>
                                </div>
                                <input type="number" min={0} step="any" value={m.quantity}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setPartAllMaterials(prev => ({
                                      ...prev,
                                      [idx]: { ...prev[idx], tpl: prev[idx].tpl.map((r, ri) => ri === mi ? { ...r, quantity: isNaN(v) ? 0 : v } : r) },
                                    }));
                                  }}
                                  className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm" />
                                <span className="text-xs text-slate-500 w-10">{m.unit}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {mats.extra.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {mats.extra.map((m, mi) => (
                            <div key={`pe-${idx}-${mi}`} className="flex items-center gap-2 text-sm">
                              <select value={m.productId}
                                onChange={(e) => {
                                  const productId = e.target.value;
                                  const prod = (inventoryProducts || []).find(p => p.id === productId);
                                  setPartAllMaterials(prev => ({
                                    ...prev,
                                    [idx]: { ...prev[idx], extra: prev[idx].extra.map((r, ri) => ri === mi ? { ...r, productId, productName: prod?.name || '', unit: prod?.unit || 'un', available: prod?.quantity ?? 0 } : r) },
                                  }));
                                }}
                                className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm">
                                <option value="">Selecione...</option>
                                {(inventoryProducts || []).map(p => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.quantity} {p.unit})</option>
                                ))}
                              </select>
                              <input type="number" min={0} step="any" value={m.quantity}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  setPartAllMaterials(prev => ({
                                    ...prev,
                                    [idx]: { ...prev[idx], extra: prev[idx].extra.map((r, ri) => ri === mi ? { ...r, quantity: isNaN(v) ? 0 : v } : r) },
                                  }));
                                }}
                                className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm" />
                              <button type="button"
                                onClick={() => setPartAllMaterials(prev => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], extra: prev[idx].extra.filter((_, ri) => ri !== mi) },
                                }))}
                                className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button type="button"
                        onClick={() => setPartAllMaterials(prev => ({
                          ...prev,
                          [idx]: { ...prev[idx], extra: [...(prev[idx]?.extra || []), { productId: '', productName: '', unit: 'un', quantity: 1, available: 0 }] },
                        }))}
                        className="text-xs font-medium text-[#1E3A5F] hover:underline">
                        + Adicionar material
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            </div>
            <div className="shrink-0 flex gap-2 p-6 pt-4 border-t border-slate-200 shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
              <button onClick={() => setPartModalCall(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={submitPartModal}
                disabled={partSubmitting || partLoading || validPartItems.length === 0}
                className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                {partSubmitting
                  ? 'Salvando...'
                  : partTab === 'procedimento' && partHasMaterials
                    ? 'Proximo: Estoque'
                    : partRetro ? 'Registrar' : 'Confirmar Realizacao'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Doctor edit modal */}
      {doctorEditCall && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Alterar medico responsavel</h3>
              <button onClick={() => setDoctorEditCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Paciente: <strong>{doctorEditCall.customer?.name || doctorEditCall.name}</strong> — {format(new Date(doctorEditCall.date), 'dd/MM/yyyy HH:mm')}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Medico</label>
              <select
                value={doctorEditValue}
                onChange={(e) => setDoctorEditValue(e.target.value)}
                className={inputCls}
              >
                <option value="">— Sem medico —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.especialidade ? ` — ${d.especialidade}` : ''}
                  </option>
                ))}
              </select>
              {doctorEditCall.status === 'completed' && (
                <p className="text-xs text-amber-600 mt-2">
                  Esta consulta ja foi realizada. Ao salvar, os lancamentos financeiros serao recalculados com o repasse do novo medico.
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDoctorEditCall(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveDoctorEdit}
                disabled={savingDoctor}
                className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50"
              >
                {savingDoctor ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert Status Confirmation Modal */}
      {revertTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">Reverter status</h3>
            <p className="text-sm text-slate-600 mb-1">
              {revertTarget.status === 'completed'
                ? 'Deseja reverter este agendamento para Atendido?'
                : revertTarget.status === 'attended'
                ? 'Deseja reverter este agendamento para Em atendimento?'
                : revertTarget.status === 'present'
                ? 'Deseja remover este paciente da fila do medico?'
                : revertTarget.status === 'awaiting_payment'
                ? 'Deseja desfazer o pagamento? O paciente voltara para Confirmado.'
                : 'Deseja reverter este agendamento para Aguardando confirmação?'}
            </p>
            {revertTarget.status === 'completed' && (
              <p className="text-xs text-amber-600 mb-4">O estoque baixado não será estornado automaticamente.</p>
            )}
            {revertTarget.status === 'awaiting_payment' && (
              <p className="text-xs text-amber-600 mb-4">O pagamento registrado sera estornado.</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRevertTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleRevertStatus} disabled={reverting} className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                {reverting ? 'Revertendo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-red-700 mb-3">Excluir permanentemente</h3>
            <p className="text-sm text-slate-600 mb-1">
              Tem certeza que deseja excluir este agendamento permanentemente?
            </p>
            <p className="text-xs text-red-600 mb-4">Esta acao nao pode ser desfeita. O registro sera removido do sistema.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handlePermanentDelete} disabled={deleting} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock-only Modal (PARTICULAR "Realizado") */}
      {stockOnlyCall && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800">Confirmar materiais e finalizar</h3>
              <button onClick={() => setStockOnlyCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Paciente: <strong>{stockOnlyCall.customer?.name || stockOnlyCall.name}</strong> — {format(new Date(stockOnlyCall.date), 'dd/MM/yyyy HH:mm')}
            </p>

            {stockOnlyError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{stockOnlyError}</div>
            )}

            <div className="space-y-4 mb-6">
              {stockOnlyMaterials.map((group, gIdx) => {
                if (group.tpl.length === 0 && group.extra.length === 0) return null;
                return (
                  <div key={gIdx} className="bg-slate-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-slate-700 mb-3">{stockOnlyProcNames[gIdx]}</h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-200">
                          <th className="text-left pb-2">Material</th>
                          <th className="text-center pb-2 w-20">Qtd</th>
                          <th className="text-center pb-2 w-16">Un</th>
                          <th className="text-center pb-2 w-20">Disp.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.tpl.map((m, mIdx) => (
                          <tr key={`tpl-${mIdx}`} className="border-b border-slate-100">
                            <td className="py-2 text-slate-700">{m.productName}</td>
                            <td className="py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                value={m.quantity}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setStockOnlyMaterials(prev => prev.map((g, gi) => gi !== gIdx ? g : {
                                    ...g,
                                    tpl: g.tpl.map((mm, mi) => mi !== mIdx ? mm : { ...mm, quantity: val }),
                                  }));
                                }}
                                className="w-16 text-center px-1 py-0.5 border border-slate-300 rounded text-sm"
                              />
                            </td>
                            <td className="py-2 text-center text-slate-500">{m.unit}</td>
                            <td className={`py-2 text-center ${m.available < m.quantity ? 'text-red-600 font-medium' : 'text-slate-500'}`}>{m.available}</td>
                          </tr>
                        ))}
                        {group.extra.map((m, mIdx) => (
                          <tr key={`extra-${mIdx}`} className="border-b border-slate-100">
                            <td className="py-2">
                              <select
                                value={m.productId}
                                onChange={(e) => {
                                  const prod = (inventoryProducts || []).find(p => p.id === e.target.value);
                                  setStockOnlyMaterials(prev => prev.map((g, gi) => gi !== gIdx ? g : {
                                    ...g,
                                    extra: g.extra.map((mm, mi) => mi !== mIdx ? mm : {
                                      ...mm,
                                      productId: e.target.value,
                                      productName: prod?.name || '',
                                      unit: prod?.unit || 'un',
                                      available: prod?.quantity ?? 0,
                                    }),
                                  }));
                                }}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              >
                                <option value="">Selecione...</option>
                                {(inventoryProducts || []).map(p => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.quantity} {p.unit})</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                value={m.quantity}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setStockOnlyMaterials(prev => prev.map((g, gi) => gi !== gIdx ? g : {
                                    ...g,
                                    extra: g.extra.map((mm, mi) => mi !== mIdx ? mm : { ...mm, quantity: val }),
                                  }));
                                }}
                                className="w-16 text-center px-1 py-0.5 border border-slate-300 rounded text-sm"
                              />
                            </td>
                            <td className="py-2 text-center text-slate-500">{m.unit}</td>
                            <td className={`py-2 text-center ${m.available < m.quantity ? 'text-red-600 font-medium' : 'text-slate-500'}`}>{m.available}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      onClick={() => {
                        setStockOnlyMaterials(prev => prev.map((g, gi) => gi !== gIdx ? g : {
                          ...g,
                          extra: [...g.extra, { productId: '', productName: '', unit: 'un', quantity: 1, available: 0 }],
                        }));
                      }}
                      className="mt-2 text-xs text-[#2563EB] hover:underline"
                    >
                      + Adicionar material
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStockOnlyCall(null)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={submitStockOnly} disabled={stockOnlySubmitting} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {stockOnlySubmitting ? 'Finalizando...' : 'Confirmar e finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentCallId && (() => {
        const computedItems = paymentSummary?.items.map(item => {
          const discPct = item.paymentStatus === 'paid' ? item.discountPercent : (paymentDiscounts[item.id] ?? 0);
          const finalVal = item.paymentStatus === 'paid' ? item.finalAmount : item.value * (1 - discPct / 100);
          return { ...item, discPct, finalVal };
        }) || [];
        const computedPending = computedItems.filter(i => i.paymentStatus !== 'paid').reduce((s, i) => s + i.finalVal, 0);
        const hasUnpaid = computedItems.some(i => i.paymentStatus !== 'paid');
        const computedTotal = computedItems.reduce((s, i) => s + i.finalVal, 0);

        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 pb-4 shrink-0">
              <h3 className="font-semibold text-slate-800">Registrar pagamento</h3>
              <button onClick={() => { setPaymentCallId(null); setPaymentSummary(null); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            {!paymentSummary ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1E3A5F]" /></div>
            ) : (
              <>
              <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1">
                <div className="space-y-3">
                  {computedItems.map(item => (
                    <div key={item.id} className="p-3 bg-slate-50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.type}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${item.discPct > 0 ? 'text-slate-400 line-through' : 'text-slate-800'}`}>R$ {Number(item.value).toFixed(2)}</p>
                          {item.paymentStatus === 'paid' && <span className="text-xs text-emerald-600">Pago</span>}
                        </div>
                      </div>
                      {item.paymentStatus !== 'paid' ? (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500 whitespace-nowrap">Desconto:</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={paymentDiscounts[item.id] ?? 0}
                              onChange={(e) => {
                                const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                                setPaymentDiscounts(d => ({ ...d, [item.id]: v }));
                              }}
                              className="w-16 px-2 py-1 text-xs border border-slate-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                            />
                            <span className="text-xs text-slate-500">%</span>
                          </div>
                          {item.discPct > 0 && (
                            <div className="flex items-center gap-2 ml-auto text-xs">
                              <span className="text-red-500">- R$ {(item.value * item.discPct / 100).toFixed(2)}</span>
                              <span className="font-semibold text-emerald-700">R$ {item.finalVal.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      ) : item.discPct > 0 ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500">Desconto: {item.discPct}%</span>
                          <span className="text-red-500">- R$ {(item.value * item.discPct / 100).toFixed(2)}</span>
                          <span className="font-semibold text-emerald-700 ml-auto">R$ {item.finalVal.toFixed(2)}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 pt-3">
                  {paymentSummary.total !== computedTotal && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Subtotal:</span>
                      <span className="text-slate-400 line-through">R$ {paymentSummary.total.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Total:</span>
                    <span className="font-semibold">R$ {computedTotal.toFixed(2)}</span>
                  </div>
                  {paymentSummary.paid > 0 && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-emerald-600">Pago:</span>
                      <span className="font-semibold text-emerald-600">R$ {paymentSummary.paid.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-600">Pendente:</span>
                    <span className="font-semibold text-amber-600">R$ {computedPending.toFixed(2)}</span>
                  </div>
                </div>
                {hasUnpaid && computedPending > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Forma de pagamento</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]">
                      <option value="PIX">PIX</option>
                      <option value="CARTAO_CREDITO">Cartao de credito</option>
                      <option value="CARTAO_DEBITO">Cartao de debito</option>
                      <option value="DINHEIRO">Dinheiro</option>
                    </select>
                  </div>
                )}
                {!hasUnpaid && (
                  <div className="text-center py-2">
                    <p className="text-sm text-emerald-600 font-medium">Todos os procedimentos pagos!</p>
                  </div>
                )}
              </div>
              {hasUnpaid && (
                <div className="shrink-0 p-6 pt-4 border-t border-slate-200 shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
                  <button
                    onClick={handlePay}
                    disabled={payingIds}
                    className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {payingIds ? 'Processando...' : computedPending > 0 ? `Confirmar pagamento — R$ ${computedPending.toFixed(2)}` : 'Confirmar cortesia — R$ 0,00'}
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        </div>
        );
      })()}

      {/* Add Procedure Modal (post-attendance) — multiple procedures with doctor */}
      {addProcCallId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Adicionar procedimento(s)</h3>
              <button onClick={() => { setAddProcCallId(null); setAddProcRows([{ procedureId: '', doctorId: '' }]); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Apos confirmar, o paciente voltara para a fila de pagamento.</p>
            <div className="space-y-3 mb-4">
              {addProcRows.map((row, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">Procedimento {idx + 1}</span>
                    {addProcRows.length > 1 && (
                      <button type="button" onClick={() => setAddProcRows(rows => rows.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                    )}
                  </div>
                  <select
                    value={row.procedureId}
                    onChange={(e) => setAddProcRows(rows => rows.map((r, i) => i === idx ? { ...r, procedureId: e.target.value } : r))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="">Selecione o procedimento...</option>
                    {bookPrivProcedures.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.value != null ? ` — R$ ${Number(p.value).toFixed(2)}` : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    value={row.doctorId}
                    onChange={(e) => setAddProcRows(rows => rows.map((r, i) => i === idx ? { ...r, doctorId: e.target.value } : r))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="">Mesmo medico (padrao)</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}{d.especialidade ? ` — ${d.especialidade}` : ''}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddProcRows(rows => [...rows, { procedureId: '', doctorId: '' }])}
              className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 mb-4"
            >
              + Adicionar outro procedimento
            </button>
            <div className="flex gap-3">
              <button onClick={() => { setAddProcCallId(null); setAddProcRows([{ procedureId: '', doctorId: '' }]); }} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleAddProcedure} disabled={addProcSaving || !addProcRows.some(r => r.procedureId)} className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                {addProcSaving ? 'Salvando...' : `Confirmar (${addProcRows.filter(r => r.procedureId).length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return prompt dialog */}
      {returnPromptCall && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <Check size={24} className="text-emerald-600" />
            </div>
            <h3 className="font-semibold text-slate-800 text-lg">Consulta finalizada!</h3>
            <p className="text-sm text-slate-600">O paciente deseja agendar retorno?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setReturnPromptCall(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Nao
              </button>
              <button
                onClick={() => { openReturnModal(returnPromptCall); setReturnPromptCall(null); }}
                className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A]"
              >
                Sim, agendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return booking modal */}
      {returnModalCall && (() => {
        const selectedDoc = doctors.find(d => d.id === returnForm.doctorId);
        const docHorarios = selectedDoc?.horarios || null;
        const DAY_MAP: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
        const calStart = startOfWeek(startOfMonth(returnCalMonth), { weekStartsOn: 0 });
        const calEnd = endOfWeek(endOfMonth(returnCalMonth), { weekStartsOn: 0 });
        const calDays: Date[] = [];
        let d = calStart;
        while (d <= calEnd) { calDays.push(d); d = addDays(d, 1); }
        const today = new Date();
        const deadline = new Date(returnModalCall.date);
        deadline.setDate(deadline.getDate() + 30);

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-md flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-6 pb-4 shrink-0">
                <div>
                  <h3 className="font-semibold text-slate-800">Agendar Retorno</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Prazo ate {format(deadline, 'dd/MM/yyyy')}</p>
                </div>
                <button onClick={() => setReturnModalCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1">
                {/* Patient info (locked) */}
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <RotateCcw size={16} className="text-sky-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{returnModalCall.customer?.name || returnModalCall.name}</p>
                      <p className="text-xs text-slate-500">{returnModalCall.customer?.phone || returnModalCall.phone}</p>
                    </div>
                  </div>
                </div>

                {/* Doctor select */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Medico</label>
                  <select
                    value={returnForm.doctorId}
                    onChange={(e) => setReturnForm(prev => ({ ...prev, doctorId: e.target.value, date: '', time: '' }))}
                    className={inputCls}
                  >
                    <option value="">Selecione o medico</option>
                    {doctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name}{doc.especialidade ? ` — ${doc.especialidade}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Calendar */}
                {returnForm.doctorId ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Data *</label>
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <button type="button" onClick={() => setReturnCalMonth(m => subMonths(m, 1))} className="p-1 hover:bg-slate-100 rounded"><ChevronLeft size={16} /></button>
                        <span className="text-sm font-semibold text-slate-700 capitalize">{format(returnCalMonth, 'MMMM yyyy', { locale: ptBR })}</span>
                        <button type="button" onClick={() => setReturnCalMonth(m => addMonths(m, 1))} className="p-1 hover:bg-slate-100 rounded"><ChevronRight size={16} /></button>
                      </div>
                      <div className="grid grid-cols-7 text-center text-xs text-slate-400 mb-1">
                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => <span key={i}>{l}</span>)}
                      </div>
                      <div className="grid grid-cols-7 gap-0.5">
                        {calDays.map((day, i) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const inMonth = isSameMonth(day, returnCalMonth);
                          const isPast = isBefore(day, today) && !isToday(day);
                          const isAfterDeadline = day > deadline;
                          const isDisabled = isPast || isAfterDeadline;
                          const isSelected = returnForm.date === dateStr;
                          const dayKey = DAY_MAP[day.getDay()];
                          const doctorWorksThisDay = docHorarios ? !!(docHorarios[dayKey] as DoctorHorario | undefined)?.ativo : false;

                          return (
                            <button
                              key={i}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => setReturnForm(prev => ({ ...prev, date: dateStr, time: '' }))}
                              className={`text-xs py-1.5 rounded transition-colors ${
                                !inMonth ? 'text-slate-300' :
                                isDisabled ? 'text-slate-300 cursor-not-allowed' :
                                isSelected ? 'bg-[#1E3A5F] text-white font-bold' :
                                doctorWorksThisDay ? 'bg-blue-100 text-blue-800 font-medium hover:bg-blue-200' :
                                'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {format(day, 'd')}
                            </button>
                          );
                        })}
                      </div>
                      {returnForm.date && (
                        <p className="text-xs text-slate-500 mt-2 text-center">
                          Selecionado: {format(new Date(returnForm.date + 'T12:00:00'), 'dd/MM/yyyy')}
                        </p>
                      )}
                    </div>

                    {/* Slot picker */}
                    {returnForm.date && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Horario *</label>
                        {loadingReturnSlots ? (
                          <p className="text-xs text-slate-500">Carregando horarios...</p>
                        ) : returnSlots.length === 0 ? (
                          <p className="text-xs text-amber-600">Nenhum horario disponivel neste dia para este medico.</p>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
                            {returnSlots.map(slot => (
                              <button
                                key={slot.time}
                                type="button"
                                disabled={!slot.available}
                                onClick={() => setReturnForm(prev => ({ ...prev, time: slot.time }))}
                                className={`text-xs py-1.5 px-1 rounded transition-colors ${
                                  !slot.available ? 'bg-slate-100 text-slate-400 line-through cursor-not-allowed' :
                                  returnForm.time === slot.time ? 'bg-[#1E3A5F] text-white font-bold' :
                                  'bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300'
                                }`}
                              >
                                {slot.time}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                    <Calendar size={20} className="mx-auto text-slate-400 mb-1" />
                    <p className="text-xs text-slate-500">Selecione o medico para ver datas e horarios disponiveis</p>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Observacoes</label>
                  <textarea
                    value={returnForm.notes}
                    onChange={(e) => setReturnForm(prev => ({ ...prev, notes: e.target.value }))}
                    className={inputCls + ' h-16 resize-none'}
                    placeholder="Retorno"
                  />
                </div>
              </div>
              <div className="shrink-0 flex gap-3 p-6 pt-4 border-t border-slate-200 shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
                <button onClick={() => setReturnModalCall(null)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button
                  onClick={handleBookReturn}
                  disabled={savingReturn || !returnForm.date || !returnForm.time}
                  className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50"
                >
                  {savingReturn ? 'Agendando...' : 'Agendar Retorno'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-lg shadow-lg text-sm z-[9999] max-w-sm">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
