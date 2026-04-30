import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar, Clock, X, Check, XCircle, Phone, Search, AlertTriangle, ChevronLeft, ChevronRight, FileCheck2, AlertCircle, UserCog, Stethoscope, ShieldCheck, ShieldAlert, Undo2, Trash2, UserCheck } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isBefore, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

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
  doctor: { id: string; name: string } | null;
  convenio?: { id: string; nome: string } | null;
  procedures?: CallProcedure[];
  privateProcedureCalls?: CallPrivateProcedure[];
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
  present: { label: 'Presente', cls: 'bg-purple-100 text-purple-700', icon: '🏥', step: 3 },
  attended: { label: 'Atendido', cls: 'bg-emerald-100 text-emerald-700', icon: '🩺', step: 4 },
  completed: { label: 'Realizado', cls: 'bg-slate-100 text-slate-600', icon: '✅', step: 5 },
  cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700', icon: '❌', step: -1 },
  no_show: { label: 'Faltou', cls: 'bg-amber-100 text-amber-700', icon: '👻', step: -1 },
};

const timelineSteps = [
  { key: 'scheduled', label: 'Agendado', icon: '🔵' },
  { key: 'confirmed', label: 'Confirmado', icon: '✅' },
  { key: 'present', label: 'Presente', icon: '🏥' },
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

export function SchedulingPage() {
  const { user } = useAuth();
  const canRevert = user?.role === 'OWNER' || user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
  const [view, setView] = useState<View>('list');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [, setAvailableDates] = useState<AvailableDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'agendamentos' | 'medicos'>('agendamentos');

  // New appointment
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookForm, setBookForm] = useState({ name: '', phone: '', email: '', date: '', time: '', notes: '', customerId: '', doctorId: '' });
  const [saving, setSaving] = useState(false);
  // Payment type for new appointment
  const [bookPaymentType, setBookPaymentType] = useState<'PARTICULAR' | 'CONVENIO'>('PARTICULAR');
  const [bookConvenioId, setBookConvenioId] = useState<string>('');
  // Tenant-wide convenios lookup (for rendering badges and booking modal)
  const [conveniosLookup, setConveniosLookup] = useState<Record<string, ConvenioOption>>({});

  // Doctors
  const [doctors, setDoctors] = useState<Doctor[]>([]);

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

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

  const fetchAppointments = useCallback(async () => {
    try {
      const { data } = await api.get('/scheduling/calls');
      setAppointments(data.data);
    } catch {} finally { setLoading(false); }
  }, []);

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
      const { data } = await api.get('/scheduling/calls', { params: { from, to, limit: 200 } });
      setMonthAppointments(data.data || []);
    } catch {} finally { setLoadingMonth(false); }
  }, []);

  const fetchDoctors = useCallback(async () => {
    try {
      const { data } = await api.get('/team/doctors');
      setDoctors(data.data || []);
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

  useEffect(() => { fetchAppointments(); fetchDates(); fetchDoctors(); fetchConveniosLookup(); }, [fetchAppointments, fetchDates, fetchDoctors, fetchConveniosLookup]);

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
  };

  const openBookWithSlot = (date: string, time: string) => {
    setBookForm({ name: '', phone: '', email: '', date, time, notes: '', customerId: '', doctorId: '' });
    setSelectedBookCustomer(null);
    setCustomerSearch('');
    resetPaymentState();
    setShowBookModal(true);
  };

  const openBook = () => {
    setBookForm({ name: '', phone: '', email: '', date: '', time: '', notes: '', customerId: '', doctorId: '' });
    setSelectedBookCustomer(null);
    setCustomerSearch('');
    resetPaymentState();
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
    api.get(`/scheduling/available-slots/${bookForm.date}`, {
      params: { doctorId: bookForm.doctorId, tenantId: user?.tenant?.id },
    })
      .then(({ data }) => { if (!cancelled) setBookSlots(data.data || []); })
      .catch(() => { if (!cancelled) setBookSlots([]); })
      .finally(() => { if (!cancelled) setLoadingBookSlots(false); });
    return () => { cancelled = true; };
  }, [showBookModal, bookForm.doctorId, bookForm.date, user?.tenant?.id]);

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
    setSaving(true);
    try {
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
      };
      if (bookPaymentType === 'CONVENIO') {
        payload.convenioId = bookConvenioId;
      }
      await api.post('/scheduling/book', payload);
      setShowBookModal(false);
      fetchAppointments();
      fetchDates();
      showToast('Agendamento criado com sucesso!');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Erro ao criar agendamento. Tente novamente.';
      showToast(msg);
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await api.patch(`/scheduling/calls/${id}`, { status });
      fetchAppointments();
    } catch (err: any) { showToast(err?.response?.data?.error?.message || 'Erro ao atualizar status.'); } finally { setUpdatingId(null); }
  };

  // When clicking "Realizado": branch by paymentType.
  // PARTICULAR → open the new particular-procedure modal.
  // CONVENIO / null / undefined → open the existing TUSS modal (unchanged).
  const handleRealized = async (a: Appointment) => {
    if (a.paymentType === 'PARTICULAR') {
      await openPartModalForCall(a, false);
    } else {
      await openTussModalForCall(a, false);
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

  const openTussModalForCall = async (a: Appointment, editMode: boolean, retroMode = false) => {
    setTussModalCall(a);
    setTussEditMode(editMode);
    setTussAlreadyCompleted(a.status === 'completed');
    setTussRetroMode(retroMode);
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
        tussEditMode
          ? 'Procedimentos atualizados!'
          : tussAlreadyCompleted
            ? 'Procedimentos registrados!'
            : 'Realizacao confirmada!',
      );
      setTussModalCall(null);
      fetchAppointments();
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
      fetchAppointments();
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
      fetchAppointments();
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
      fetchAppointments();
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
      fetchAppointments();
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao salvar autorizacao');
    } finally {
      setSavingAuthId(null);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.delete(`/scheduling/calls/${id}`);
      fetchAppointments();
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
      fetchAppointments();
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
      fetchAppointments();
      showToast('Status revertido com sucesso.');
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao reverter status.');
    } finally {
      setReverting(false);
      setRevertTarget(null);
    }
  };

  const activeStatuses = new Set(['scheduled', 'confirmed', 'present', 'in_attendance', 'attended']);
  const upcomingAppointments = appointments.filter(a => activeStatuses.has(a.status));
  const pastAppointments = appointments.filter(a => !activeStatuses.has(a.status));

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

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
          Historico ({pastAppointments.length})
        </button>
        <button onClick={() => setView('calendar')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === 'calendar' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Calendario
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A5F]" /></div>
      ) : (
        <>
          {/* List View */}
          {view === 'list' && (
            <div className="space-y-6">
              {/* Upcoming */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Proximos ({upcomingAppointments.length})</h3>
                {upcomingAppointments.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                    <p className="text-sm text-slate-500">Nenhum agendamento proximo.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingAppointments.map((a) => (
                      <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="flex items-start gap-4">
                            <div className="bg-[#EFF6FF] rounded-lg p-3 text-center min-w-[60px]">
                              <p className="text-xs text-[#1E3A5F] font-medium">{format(new Date(a.date), 'MMM', { locale: ptBR }).toUpperCase()}</p>
                              <p className="text-xl font-bold text-[#1E3A5F]">{format(new Date(a.date), 'dd')}</p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-800">{a.customer?.name || a.name}</span>
                                {(() => {
                                  const pt = a.paymentType || 'PARTICULAR';
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
                                {a.customer && <span className="text-xs bg-[#EFF6FF] text-[#1E3A5F] px-1.5 py-0.5 rounded">Paciente vinculado</span>}
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
                                  <UserCog size={13} />
                                </button>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                                <span className="flex items-center gap-1"><Clock size={14} />{format(new Date(a.date), 'HH:mm')}</span>
                                <span className="flex items-center gap-1"><Phone size={14} />{a.phone}</span>
                              </div>
                              {/* Authorization badge — only for convenio appointments */}
                              {a.paymentType === 'CONVENIO' && a.customerId && convenioMap[a.customerId] && (
                                <div className="mt-2">
                                  {authEditingId === a.id ? (
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
                                      title="Clique para adicionar numero de autorizacao"
                                    >
                                      <ShieldAlert size={11} /> Sem autorizacao
                                    </button>
                                  )}
                                </div>
                              )}
                              {a.notes && <p className="text-xs text-slate-400 mt-1">{a.notes}</p>}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {a.status === 'scheduled' && (
                              <button onClick={() => handleStatusChange(a.id, 'confirmed')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 flex items-center gap-1">
                                <Check size={14} />Confirmar
                              </button>
                            )}
                            {a.status === 'confirmed' && (
                              <button onClick={() => handleStatusChange(a.id, 'present')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 flex items-center gap-1">
                                <UserCheck size={14} />Presente
                              </button>
                            )}
                            {canRevert && (a.status === 'confirmed' || a.status === 'present' || a.status === 'attended') && (
                              <button onClick={() => setRevertTarget(a)} className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 flex items-center gap-1">
                                <Undo2 size={14} />{a.status === 'present' ? 'Desfazer presente' : a.status === 'attended' ? 'Desfazer atendido' : 'Desconfirmar'}
                              </button>
                            )}
                            {a.status === 'in_attendance' && (
                              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium flex items-center gap-1">
                                Em atendimento...
                              </span>
                            )}
                            {a.status === 'attended' && (
                              <button onClick={() => handleRealized(a)} disabled={updatingId === a.id} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1 animate-pulse">
                                <Check size={14} />Realizado
                              </button>
                            )}
                            {a.status !== 'attended' && a.status !== 'in_attendance' && a.status !== 'completed' && (
                              <button onClick={() => handleRealized(a)} disabled={updatingId === a.id} className="px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-100">
                                Realizado
                              </button>
                            )}
                            {a.status !== 'in_attendance' && a.status !== 'attended' && (
                              <button onClick={() => handleStatusChange(a.id, 'no_show')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 flex items-center gap-1">
                                <AlertTriangle size={14} />Faltou
                              </button>
                            )}
                            {a.status !== 'in_attendance' && a.status !== 'attended' && (
                              <button onClick={() => handleCancel(a.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 flex items-center gap-1">
                                <XCircle size={14} />Cancelar
                              </button>
                            )}
                            {canRevert && (
                              <button onClick={() => setDeleteConfirmId(a.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 flex items-center gap-1" title="Excluir permanentemente">
                                <Trash2 size={14} />Excluir
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Status Timeline */}
                        <div className="pt-2 border-t border-slate-100">
                          <StatusTimeline status={a.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* History View */}
          {view === 'history' && (
            <div>
              {pastAppointments.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                  <p className="text-sm text-slate-500">Nenhum registro no historico.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pastAppointments.map((a) => {
                    const st = statusMap[a.status] || { label: a.status, cls: 'bg-gray-100 text-gray-600', icon: '⬜', step: 0 };
                    const isRealized = a.status === 'completed';
                    const hasProcs = (a.procedures?.length || 0) > 0;
                    return (
                      <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
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
                            <span className="text-sm font-medium text-slate-800 truncate">{a.customer?.name || a.name}</span>
                            {(() => {
                              const pt = a.paymentType || 'PARTICULAR';
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
                                  const st = statusMap[a.status];
                                  return (
                                    <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-[#1E3A5F] w-12">{format(new Date(a.date), 'HH:mm')}</span>
                                        <span className="text-sm text-slate-700 truncate max-w-[120px]">{a.customer?.name || a.name}</span>
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

      {/* Book Modal */}
      {showBookModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-md p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Novo agendamento</h3>
              <button onClick={() => setShowBookModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleBook} className="space-y-4">
              {/* Customer Search */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buscar paciente</label>
                {selectedBookCustomer ? (
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

                    {/* Slot picker */}
                    {bookForm.date && (
                      <div className="mt-3">
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
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowBookModal(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">{saving ? 'Agendando...' : 'Agendar'}</button>
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800">
                {tussEditMode ? 'Editar procedimentos TUSS' : 'Confirmar Realização'}
              </h3>
              <button onClick={() => setTussModalCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Paciente: <strong>{tussModalCall.customer?.name || tussModalCall.name}</strong> — {format(new Date(tussModalCall.date), 'dd/MM/yyyy HH:mm')}
              {tussModalCall.doctor && <> · Medico: <strong>{tussModalCall.doctor.name}</strong></>}
            </p>

            {tussModalError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {tussModalError}
              </div>
            )}

            {tussHasMaterials && (
              <div className="flex border-b border-slate-200 mb-4 -mx-1">
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

            <div className="flex gap-2 pt-4 mt-2 border-t border-slate-100">
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800">
                {partRetro ? 'Registrar Procedimentos Particulares' : 'Confirmar Realizacao — Particular'}
              </h3>
              <button onClick={() => setPartModalCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Paciente: <strong>{partModalCall.customer?.name || partModalCall.name}</strong> — {format(new Date(partModalCall.date), 'dd/MM/yyyy HH:mm')}
              {partModalCall.doctor && <> · Medico: <strong>{partModalCall.doctor.name}</strong></>}
            </p>

            {partError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{partError}</div>
            )}

            {partHasMaterials && (
              <div className="flex border-b border-slate-200 mb-4 -mx-1">
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

            <div className="flex gap-2 pt-4 mt-2 border-t border-slate-100">
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
                ? 'Deseja reverter este agendamento para Confirmado?'
                : 'Deseja reverter este agendamento para Aguardando confirmação?'}
            </p>
            {revertTarget.status === 'completed' && (
              <p className="text-xs text-amber-600 mb-4">O estoque baixado não será estornado automaticamente.</p>
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

      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-lg shadow-lg text-sm z-[9999] max-w-sm">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
