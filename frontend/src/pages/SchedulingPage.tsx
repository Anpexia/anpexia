import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Clock, X, Check, XCircle, Phone, Search, AlertTriangle, ChevronLeft, ChevronRight, FileCheck2, AlertCircle, UserCog, Stethoscope, ShieldCheck, ShieldAlert } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isBefore, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';

interface Doctor {
  id: string;
  name: string;
  especialidade?: string | null;
}

interface CallProcedure {
  id: string;
  authorizationNumber: string | null;
  tussProcedure: {
    id: string;
    code: string;
    description: string;
    type: string;
    value: number;
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
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  doctor: { id: string; name: string } | null;
  convenio?: { id: string; nome: string } | null;
  procedures?: CallProcedure[];
  createdAt: string;
}

interface ConvenioOption { id: string; nome: string; ativo: boolean }

interface CustomerSearch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

type View = 'calendar' | 'list';

const statusMap: Record<string, { label: string; cls: string; icon: string; step: number }> = {
  scheduled: { label: 'Agendado', cls: 'bg-blue-100 text-blue-700', icon: '🔵', step: 1 },
  confirmed: { label: 'Confirmado', cls: 'bg-green-100 text-green-700', icon: '✅', step: 2 },
  completed: { label: 'Realizado', cls: 'bg-slate-100 text-slate-600', icon: '✅', step: 4 },
  cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700', icon: '❌', step: -1 },
  no_show: { label: 'Faltou', cls: 'bg-amber-100 text-amber-700', icon: '👻', step: -1 },
};

const timelineSteps = [
  { key: 'scheduled', label: 'Agendado', icon: '🔵' },
  { key: 'confirmed', label: 'Confirmado', icon: '✅' },
  { key: 'reminder', label: 'Lembrete', icon: '⏰' },
  { key: 'completed', label: 'Concluido', icon: '🏥' },
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
  const [view, setView] = useState<View>('list');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [, setAvailableDates] = useState<AvailableDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // New appointment
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookForm, setBookForm] = useState({ name: '', phone: '', email: '', date: '', time: '', notes: '', customerId: '', doctorId: '' });
  const [saving, setSaving] = useState(false);
  // Payment type for new appointment
  const [bookPaymentType, setBookPaymentType] = useState<'PARTICULAR' | 'CONVENIO'>('PARTICULAR');
  const [bookConvenioId, setBookConvenioId] = useState<string>('');
  const [patientConvenios, setPatientConvenios] = useState<ConvenioOption[]>([]);
  const [loadingPatientConvenios, setLoadingPatientConvenios] = useState(false);
  // Tenant-wide convenios lookup (for rendering badges in the list)
  const [conveniosLookup, setConveniosLookup] = useState<Record<string, ConvenioOption>>({});

  // Doctors
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  // Confirmar Realizacao (ao clicar em "Realizado")
  const [tussModalCall, setTussModalCall] = useState<Appointment | null>(null);
  const [tussModalProcedures, setTussModalProcedures] = useState<TussProc[]>([]);
  const [tussLoadingList, setTussLoadingList] = useState(false);
  // Single-select: id of chosen TUSS procedure
  const [tussChosenId, setTussChosenId] = useState<string>('');
  const [tussAuthNumber, setTussAuthNumber] = useState<string>('');
  const [tussSaving, setTussSaving] = useState(false);
  // Doctor repasse percentages keyed by procedureType
  const [tussDoctorRepasse, setTussDoctorRepasse] = useState<Record<string, number> | null>(null);
  // When true, saving the TUSS modal REPLACES procedures (edit mode) instead of
  // registering + marking completed.
  const [tussEditMode, setTussEditMode] = useState(false);
  // When true, the call is already completed (legacy "Registrar TUSS") — skip status change.
  const [tussAlreadyCompleted, setTussAlreadyCompleted] = useState(false);

  // ---- Stock withdrawal extension (procedure templates + materials) ----
  interface TplMaterial { productId: string; productName: string; unit: string; quantity: number }
  interface ProcedureTpl { id: string; name: string; description: string | null; materials: TplMaterial[] }
  interface InventoryProduct { id: string; name: string; quantity: number; unit: string }
  interface MaterialRow { productId: string; productName: string; unit: string; quantity: number; available: number }
  const [procedureTemplates, setProcedureTemplates] = useState<ProcedureTpl[] | null>(null);
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[] | null>(null);
  const [tussTab, setTussTab] = useState<'tuss' | 'estoque'>('tuss');
  const [tplMaterials, setTplMaterials] = useState<MaterialRow[]>([]);
  const [extraMaterials, setExtraMaterials] = useState<MaterialRow[]>([]);
  const [matchedTemplate, setMatchedTemplate] = useState<ProcedureTpl | null>(null);
  const [tussModalError, setTussModalError] = useState<string>('');
  // Tracks whether the modal was opened via the "Registrar TUSS" badge (retro flow)
  const [tussRetroMode, setTussRetroMode] = useState(false);

  // ---- PARTICULAR procedure modal (completely separate from TUSS) ----
  interface PrivProc { id: string; name: string; description: string | null; value: number | null; duration: number | null; isActive: boolean }
  const [partModalCall, setPartModalCall] = useState<Appointment | null>(null);
  const [partProcedures, setPartProcedures] = useState<PrivProc[]>([]);
  const [partSelectedId, setPartSelectedId] = useState<string>('');
  const [partNotes, setPartNotes] = useState<string>('');
  const [partTab, setPartTab] = useState<'procedimento' | 'estoque'>('procedimento');
  const [partTplMaterials, setPartTplMaterials] = useState<MaterialRow[]>([]);
  const [partExtraMaterials, setPartExtraMaterials] = useState<MaterialRow[]>([]);
  const [partError, setPartError] = useState<string>('');
  const [partSubmitting, setPartSubmitting] = useState(false);
  const [partRetro, setPartRetro] = useState(false);
  const [partLoading, setPartLoading] = useState(false);
  const [partTussSelectedId, setPartTussSelectedId] = useState<string>('');
  const [partTussTplMaterials, setPartTussTplMaterials] = useState<MaterialRow[]>([]);
  const [partTussList, setPartTussList] = useState<TussProc[]>([]);

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
    setPatientConvenios([]);
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

  // Load the patient's active convenio(s) when entering CONVENIO mode or switching patient.
  // The backend stores a single patient-convenio link (see convenios.service.getPatientConvenio),
  // so we fetch that and expose it as a single-option dropdown when active.
  const loadPatientConvenios = useCallback(async (customerId: string) => {
    setLoadingPatientConvenios(true);
    try {
      const { data } = await api.get(`/convenios/patients/${customerId}`);
      const pc = data.data;
      if (pc && pc.convenio && pc.convenio.id) {
        // Enrich with the `ativo` flag from the tenant-wide lookup
        const tenantConv = conveniosLookup[pc.convenio.id];
        setPatientConvenios([{
          id: pc.convenio.id,
          nome: pc.convenio.nome,
          ativo: tenantConv ? tenantConv.ativo : true,
        }].filter((c) => c.ativo));
      } else {
        setPatientConvenios([]);
      }
    } catch {
      setPatientConvenios([]);
    } finally {
      setLoadingPatientConvenios(false);
    }
  }, [conveniosLookup]);

  // Whenever the user switches to CONVENIO and has a patient selected, load the list
  useEffect(() => {
    if (!showBookModal) return;
    if (bookPaymentType !== 'CONVENIO') return;
    if (!bookForm.customerId) {
      setPatientConvenios([]);
      return;
    }
    loadPatientConvenios(bookForm.customerId);
  }, [showBookModal, bookPaymentType, bookForm.customerId, loadPatientConvenios]);

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
    // Reset convenio selection whenever patient changes
    setBookConvenioId('');
    setPatientConvenios([]);
  };

  const clearSelectedCustomer = () => {
    setSelectedBookCustomer(null);
    setBookForm(prev => ({ ...prev, customerId: '' }));
    // Reset convenio selection whenever patient is cleared
    setBookConvenioId('');
    setPatientConvenios([]);
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookForm.doctorId) {
      showToast('Selecione o medico responsavel pela consulta');
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
    if (!tussModalCall) return;
    if (!tussChosenId || procedureTemplates === null) {
      setMatchedTemplate(null);
      setTplMaterials([]);
      return;
    }
    const chosen = tussModalProcedures.find((p) => p.id === tussChosenId);
    if (!chosen) {
      setMatchedTemplate(null);
      setTplMaterials([]);
      return;
    }
    const target = chosen.description.trim().toLowerCase();
    const tpl = (procedureTemplates || []).find(
      (t) => t.name.trim().toLowerCase() === target,
    ) || null;
    setMatchedTemplate(tpl);
    if (tpl) {
      const products = inventoryProducts || [];
      const rows: MaterialRow[] = tpl.materials.map((m) => {
        const prod = products.find((p) => p.id === m.productId);
        return {
          productId: m.productId,
          productName: m.productName || prod?.name || '',
          unit: m.unit || prod?.unit || 'un',
          quantity: m.quantity,
          available: prod?.quantity ?? 0,
        };
      });
      setTplMaterials(rows);
    } else {
      setTplMaterials([]);
    }
  }, [tussChosenId, tussModalCall, tussModalProcedures, procedureTemplates, inventoryProducts]);

  const openTussModalForCall = async (a: Appointment, editMode: boolean, retroMode = false) => {
    setTussModalCall(a);
    setTussEditMode(editMode);
    setTussAlreadyCompleted(a.status === 'completed');
    setTussRetroMode(retroMode);
    setTussChosenId('');
    setTussAuthNumber('');
    setTussDoctorRepasse(null);
    setTussLoadingList(true);
    setTussTab('tuss');
    setTplMaterials([]);
    setExtraMaterials([]);
    setMatchedTemplate(null);
    setTussModalError('');
    // Kick off templates + products fetch in parallel (non-blocking for the TUSS list)
    ensureTemplatesAndProducts();
    try {
      // Load procedures for the patient's convenio (if known), otherwise all
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

      // In edit mode, ensure pre-existing procedures are visible in the list
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
        // Pre-select first existing procedure
        const first = a.procedures[0];
        setTussChosenId(first.tussProcedure.id);
        setTussAuthNumber(first.authorizationNumber || '');
      } else {
        setTussModalProcedures(list);
      }

      // Fetch doctor repasse percentages (one row per type)
      if (a.doctorId) {
        try {
          const { data: repasseData } = await api.get(`/doctors/${a.doctorId}/repasse`);
          const rows: Array<{ procedureType: string; percentage: number }> = repasseData.data || [];
          const map: Record<string, number> = {};
          for (const r of rows) map[r.procedureType] = Number(r.percentage) || 0;
          setTussDoctorRepasse(map);
        } catch {
          setTussDoctorRepasse({});
        }
      }
    } catch {
      setTussModalProcedures([]);
    } finally {
      setTussLoadingList(false);
    }
  };

  // Combined materials (template rows + extras), filtered by valid productId + qty > 0
  const combinedMaterials = (): { productId: string; quantity: number }[] => {
    const all = [...tplMaterials, ...extraMaterials];
    return all
      .filter((m) => m.productId && Number(m.quantity) > 0)
      .map((m) => ({ productId: m.productId, quantity: Number(m.quantity) }));
  };

  const submitTussModal = async () => {
    if (!tussModalCall) return;

    // If we are on the TUSS tab and a template match exists, "Próximo: Estoque" navigates instead of saving
    if (tussTab === 'tuss' && matchedTemplate && tplMaterials.length > 0) {
      if (!tussChosenId) {
        showToast('Selecione um procedimento TUSS');
        return;
      }
      setTussTab('estoque');
      return;
    }

    if (!tussChosenId) {
      showToast('Selecione um procedimento TUSS');
      return;
    }
    const selected = [{ tussProcedureId: tussChosenId, authorizationNumber: tussAuthNumber.trim() || null }];
    const materials = combinedMaterials();

    setTussSaving(true);
    setTussModalError('');
    try {
      if (tussEditMode) {
        // Replace-all endpoint re-syncs financials automatically for completed calls
        await api.put(`/scheduling/calls/${tussModalCall.id}/procedures`, { procedures: selected });
      } else if (tussAlreadyCompleted) {
        // Legacy "Registrar TUSS" flow: call is already completed, just attach procedure.
        // PUT replaces and re-syncs financials (idempotent — dedup by call tag in notes).
        await api.put(`/scheduling/calls/${tussModalCall.id}/procedures`, { procedures: selected });
      } else {
        await api.post(`/scheduling/calls/${tussModalCall.id}/procedures`, { procedures: selected });
        await api.patch(`/scheduling/calls/${tussModalCall.id}`, { status: 'completed' });
      }

      // Stock withdrawal — only if we collected materials
      if (materials.length > 0) {
        try {
          await api.post(`/scheduling/calls/${tussModalCall.id}/inventory`, { materials });
        } catch (invErr: any) {
          const code = invErr?.response?.data?.error?.code;
          const msg = invErr?.response?.data?.error?.message || 'Erro ao baixar estoque';
          if (code === 'INSUFFICIENT_STOCK') {
            setTussModalError(msg);
            setTussTab('estoque');
            // Keep modal open + refresh available stock view
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
          ? 'Procedimento atualizado!'
          : tussAlreadyCompleted
            ? 'Procedimento registrado!'
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

  // Retro-only inventory submission (used when TUSS is already attached)
  const submitInventoryOnly = async () => {
    if (!tussModalCall) return;
    const materials = combinedMaterials();
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
    setPartSelectedId('');
    setPartNotes('');
    setPartTab('procedimento');
    setPartTplMaterials([]);
    setPartExtraMaterials([]);
    setPartError('');
    setPartSubmitting(false);
    setPartTussSelectedId('');
    setPartTussTplMaterials([]);
    setPartLoading(true);
    // Fetch private procedures + templates + products + TUSS list in parallel
    const tasks: Promise<unknown>[] = [];
    tasks.push(
      api.get('/tuss/procedures')
        .then(({ data }) => setPartTussList(data.data || []))
        .catch(() => setPartTussList([])),
    );
    tasks.push(
      api.get('/private-procedures')
        .then(({ data }) => setPartProcedures((data.data || []).filter((p: PrivProc) => p.isActive)))
        .catch(() => setPartProcedures([])),
    );
    // Reuse cached templates/products from TUSS flow or fetch fresh
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

  // Match selected private procedure against templates to prefill materials
  useEffect(() => {
    if (!partModalCall || !partSelectedId) {
      setPartTplMaterials([]);
      return;
    }
    const proc = partProcedures.find((p) => p.id === partSelectedId);
    if (!proc || !procedureTemplates) {
      setPartTplMaterials([]);
      return;
    }
    const target = proc.name.trim().toLowerCase();
    const tpl = (procedureTemplates || []).find((t) => t.name.trim().toLowerCase() === target) || null;
    if (tpl) {
      const products = inventoryProducts || [];
      setPartTplMaterials(
        tpl.materials.map((m) => {
          const prod = products.find((p) => p.id === m.productId);
          return {
            productId: m.productId,
            productName: m.productName || prod?.name || '',
            unit: m.unit || prod?.unit || 'un',
            quantity: m.quantity,
            available: prod?.quantity ?? 0,
          };
        }),
      );
    } else {
      setPartTplMaterials([]);
    }
  }, [partSelectedId, partModalCall, partProcedures, procedureTemplates, inventoryProducts]);

  // Match TUSS selection against templates (independent of particular procedure)
  useEffect(() => {
    if (!partModalCall || !partTussSelectedId) {
      setPartTussTplMaterials([]);
      return;
    }
    const tussItem = partTussList.find((t) => t.id === partTussSelectedId);
    if (!tussItem) { setPartTussTplMaterials([]); return; }
    const target = (tussItem.description || '').trim().toLowerCase();
    const tpl = (procedureTemplates || []).find((t: any) => t.name.trim().toLowerCase() === target) || null;
    if (tpl) {
      const products = inventoryProducts || [];
      setPartTussTplMaterials(
        tpl.materials.map((m: any) => {
          const prod = products.find((p: any) => p.id === m.productId);
          return { productId: m.productId, productName: m.productName || prod?.name || '', unit: m.unit || prod?.unit || 'un', quantity: m.quantity, available: prod?.quantity ?? 0 };
        }),
      );
    } else {
      setPartTussTplMaterials([]);
    }
  }, [partTussSelectedId, partModalCall, partTussList, procedureTemplates, inventoryProducts]);

  const partCombinedMaterials = (): { productId: string; quantity: number }[] => {
    return [...partTplMaterials, ...partTussTplMaterials, ...partExtraMaterials]
      .filter((m) => m.productId && Number(m.quantity) > 0)
      .map((m) => ({ productId: m.productId, quantity: Number(m.quantity) }));
  };

  const submitPartModal = async () => {
    if (!partModalCall) return;

    // If on procedimento tab and template materials exist, navigate to estoque first
    if (partTab === 'procedimento' && (partTplMaterials.length > 0 || partExtraMaterials.length > 0)) {
      if (!partSelectedId) {
        showToast('Selecione um procedimento');
        return;
      }
      setPartTab('estoque');
      return;
    }

    if (!partSelectedId) {
      showToast('Selecione um procedimento');
      return;
    }

    setPartSubmitting(true);
    setPartError('');
    try {
      // 1. Attach private procedure
      await api.post(`/scheduling/calls/${partModalCall.id}/private-procedure`, {
        privateProcedureId: partSelectedId,
        notes: partNotes.trim() || null,
      });

      // 2. Inventory withdrawal
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

      // 3. Mark as completed (unless retro — already completed)
      if (!partRetro) {
        await api.patch(`/scheduling/calls/${partModalCall.id}`, { status: 'completed' });
      }

      showToast(partRetro ? 'Procedimento registrado!' : 'Realizacao confirmada!');
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

  const upcomingAppointments = appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed');
  const pastAppointments = appointments.filter(a => a.status !== 'scheduled' && a.status !== 'confirmed');

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
          Lista
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
                              {/* Authorization badge — only when patient has convenio */}
                              {a.customerId && convenioMap[a.customerId] && (
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
                            <button onClick={() => handleRealized(a)} disabled={updatingId === a.id} className="px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-100">
                              Realizado
                            </button>
                            <button onClick={() => handleStatusChange(a.id, 'no_show')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 flex items-center gap-1">
                              <AlertTriangle size={14} />Faltou
                            </button>
                            <button onClick={() => handleCancel(a.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 flex items-center gap-1">
                              <XCircle size={14} />Cancelar
                            </button>
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

              {/* Past */}
              {pastAppointments.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-800 mb-3">Historico ({pastAppointments.length})</h3>
                  <div className="space-y-2">
                    {pastAppointments.map((a) => {
                      const st = statusMap[a.status] || { label: a.status, cls: 'bg-gray-100 text-gray-600', icon: '⬜', step: 0 };
                      const isRealized = a.status === 'completed';
                      const hasProcs = (a.procedures?.length || 0) > 0;
                      return (
                        <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 opacity-90">
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
                              {a.customerId && convenioMap[a.customerId] && (
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
                            {isRealized && a.paymentType === 'PARTICULAR' && !(a as any)._count?.privateProcedureCalls && (
                              <button
                                onClick={() => openPartModalForCall(a, true)}
                                className="px-2 py-1 text-xs font-medium rounded bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200"
                              >
                                Registrar Procedimento
                              </button>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded ${st.cls}`}>{st.icon} {st.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calendar View */}
          {view === 'calendar' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Monthly calendar — spans 2 cols */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
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
                        className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors
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

              {/* Right panel — Slots & day appointments */}
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

                    {/* Day's existing appointments */}
                    {(() => {
                      const dayAppts = (appointmentsByDay.get(selectedDate) || []).filter(a => a.status !== 'cancelled');
                      if (dayAppts.length === 0) return null;
                      return (
                        <div className="mb-4">
                          <p className="text-xs text-slate-500 mb-2 mt-3">Agendados ({dayAppts.length})</p>
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

                    {/* Available slots */}
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
                    {!bookForm.customerId ? (
                      <p className="text-xs text-amber-600">Selecione um paciente para ver os convenios.</p>
                    ) : loadingPatientConvenios ? (
                      <p className="text-xs text-slate-500">Carregando convenios...</p>
                    ) : patientConvenios.length === 0 ? (
                      <p className="text-xs text-amber-600">Paciente sem convenios cadastrados</p>
                    ) : (
                      <select
                        value={bookConvenioId}
                        onChange={(e) => setBookConvenioId(e.target.value)}
                        className={inputCls}
                        required
                      >
                        <option value="">Selecione o convenio</option>
                        {patientConvenios.map((c) => (
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data *</label>
                  <input type="date" value={bookForm.date} onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Horario</label>
                  <input type="time" value={bookForm.time} onChange={(e) => setBookForm({ ...bookForm, time: e.target.value })} className={inputCls} />
                </div>
              </div>
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
        const chosen = tussModalProcedures.find((p) => p.id === tussChosenId) || null;
        const valorTotal = chosen ? Number(chosen.value) : 0;
        // Pick repasse pct by TUSS type (fallback OUTROS)
        let pct = 0;
        if (chosen && tussDoctorRepasse) {
          pct = tussDoctorRepasse[chosen.type] ?? tussDoctorRepasse['OUTROS'] ?? 0;
        }
        const repasse = (valorTotal * pct) / 100;
        const receitaClinica = valorTotal - repasse;
        const hasDoctor = !!tussModalCall.doctorId;
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 my-8">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800">
                {tussEditMode ? 'Editar procedimento TUSS' : 'Confirmar Realização'}
              </h3>
              <button onClick={() => setTussModalCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {tussEditMode
                ? 'Altere o procedimento TUSS vinculado a esta consulta.'
                : 'Selecione o procedimento TUSS realizado para registrar o financeiro automaticamente.'}
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Paciente: <strong>{tussModalCall.customer?.name || tussModalCall.name}</strong> — {format(new Date(tussModalCall.date), 'dd/MM/yyyy HH:mm')}
              {tussModalCall.doctor && <> · Medico: <strong>{tussModalCall.doctor.name}</strong></>}
            </p>

            {tussModalError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {tussModalError}
              </div>
            )}

            {/* Tabs — second tab only visible when a template matched */}
            {(matchedTemplate || tplMaterials.length > 0 || extraMaterials.length > 0) && (
              <div className="flex border-b border-slate-200 mb-4 -mx-1">
                <button
                  type="button"
                  onClick={() => setTussTab('tuss')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ${tussTab === 'tuss' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  TUSS
                </button>
                <button
                  type="button"
                  onClick={() => setTussTab('estoque')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ${tussTab === 'estoque' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  Estoque ({tplMaterials.length + extraMaterials.length})
                </button>
              </div>
            )}

            {tussLoadingList ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1E3A5F]" />
              </div>
            ) : tussModalProcedures.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                Nenhum procedimento TUSS cadastrado.
                <br />
                Cadastre em Configuracoes &gt; Procedimentos TUSS.
              </div>
            ) : tussTab === 'tuss' ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Procedimento TUSS <span className="text-red-500">*</span></label>
                  <select
                    value={tussChosenId}
                    onChange={(e) => setTussChosenId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Selecione um procedimento...</option>
                    {tussModalProcedures.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.description} — R$ {Number(p.value).toFixed(2)}
                      </option>
                    ))}
                  </select>
                  {matchedTemplate && (
                    <p className="text-xs text-emerald-700 mt-1.5">
                      Template encontrado: <strong>{matchedTemplate.name}</strong> · {matchedTemplate.materials.length} material(is) sera(ao) baixado(s) do estoque.
                    </p>
                  )}
                </div>

                {chosen && (
                  <>
                    <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Valor total:</span>
                        <span className="font-semibold text-slate-800">R$ {valorTotal.toFixed(2)}</span>
                      </div>
                      {hasDoctor && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Repasse médico:</span>
                            <span className="font-semibold text-indigo-700">
                              R$ {repasse.toFixed(2)} <span className="text-xs text-slate-500">({pct}%)</span>
                            </span>
                          </div>
                          <div className="flex justify-between pt-1.5 border-t border-slate-200">
                            <span className="text-slate-600">Receita clínica:</span>
                            <span className="font-semibold text-emerald-700">R$ {receitaClinica.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      {!hasDoctor && (
                        <p className="text-xs text-amber-600 pt-1">
                          Sem medico vinculado — nenhum repasse sera lancado.
                        </p>
                      )}
                    </div>

                    <div className="mb-4">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Numero de autorizacao (opcional)</label>
                      <input
                        type="text"
                        value={tussAuthNumber}
                        onChange={(e) => setTussAuthNumber(e.target.value)}
                        placeholder="Ex.: 123456"
                        className={inputCls}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Estoque tab content */}
                {tplMaterials.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Materiais do template</h4>
                    <div className="space-y-2">
                      {tplMaterials.map((m, i) => {
                        const insufficient = m.available < m.quantity;
                        return (
                          <div key={`tpl-${m.productId}-${i}`} className="flex items-center gap-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-800 truncate">{m.productName}</div>
                              <div className={`text-xs ${insufficient ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                Disponivel: {m.available} {m.unit}
                              </div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.quantity}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setTplMaterials((rows) => rows.map((r, idx) => idx === i ? { ...r, quantity: isNaN(v) ? 0 : v } : r));
                              }}
                              className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm"
                            />
                            <span className="text-xs text-slate-500 w-10">{m.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Materiais extras</h4>
                  {extraMaterials.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {extraMaterials.map((m, i) => (
                        <div key={`extra-${i}`} className="flex items-center gap-2 text-sm">
                          <select
                            value={m.productId}
                            onChange={(e) => {
                              const productId = e.target.value;
                              const prod = (inventoryProducts || []).find((p) => p.id === productId);
                              setExtraMaterials((rows) => rows.map((r, idx) => idx === i ? {
                                ...r,
                                productId,
                                productName: prod?.name || '',
                                unit: prod?.unit || 'un',
                                available: prod?.quantity ?? 0,
                              } : r));
                            }}
                            className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm"
                          >
                            <option value="">Selecione um produto...</option>
                            {(inventoryProducts || []).map((p) => (
                              <option key={p.id} value={p.id}>{p.name} (estoque: {p.quantity} {p.unit})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={m.quantity}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setExtraMaterials((rows) => rows.map((r, idx) => idx === i ? { ...r, quantity: isNaN(v) ? 0 : v } : r));
                            }}
                            className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setExtraMaterials((rows) => rows.filter((_, idx) => idx !== i))}
                            className="text-slate-400 hover:text-red-500"
                            title="Remover"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setExtraMaterials((rows) => [...rows, { productId: '', productName: '', unit: 'un', quantity: 1, available: 0 }])}
                    className="text-xs font-medium text-[#1E3A5F] hover:underline"
                  >
                    + Adicionar material
                  </button>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-4 mt-2 border-t border-slate-100">
              <button
                onClick={() => setTussModalCall(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              {tussRetroMode && tussAlreadyCompleted && (tussModalCall.procedures?.length || 0) > 0 && tussTab === 'estoque' && (
                <button
                  onClick={submitInventoryOnly}
                  disabled={tussSaving || (tplMaterials.length + extraMaterials.length) === 0}
                  className="flex-1 py-2.5 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
                  title="Registrar somente a baixa de estoque (sem mexer no TUSS)"
                >
                  {tussSaving ? 'Salvando...' : 'Registrar retro'}
                </button>
              )}
              <button
                onClick={submitTussModal}
                disabled={tussSaving || tussLoadingList || !tussChosenId}
                className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50"
              >
                {tussSaving
                  ? 'Salvando...'
                  : tussTab === 'tuss' && matchedTemplate && tplMaterials.length > 0
                    ? 'Próximo: Estoque'
                    : tussEditMode ? 'Salvar' : 'Registrar procedimentos'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* PARTICULAR procedure modal — separate from TUSS */}
      {partModalCall && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 my-8">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800">
                {partRetro ? 'Registrar Procedimento Particular' : 'Confirmar Realizacao — Particular'}
              </h3>
              <button onClick={() => setPartModalCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Paciente: <strong>{partModalCall.customer?.name || partModalCall.name}</strong> — {format(new Date(partModalCall.date), 'dd/MM/yyyy HH:mm')}
              {partModalCall.doctor && <> · Medico: <strong>{partModalCall.doctor.name}</strong></>}
            </p>

            {partError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {partError}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-4 -mx-1">
              <button
                type="button"
                onClick={() => setPartTab('procedimento')}
                className={`px-4 py-2 text-sm font-medium border-b-2 ${partTab === 'procedimento' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Procedimento
              </button>
              <button
                type="button"
                onClick={() => setPartTab('estoque')}
                className={`px-4 py-2 text-sm font-medium border-b-2 ${partTab === 'estoque' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Estoque {(partTplMaterials.length + partTussTplMaterials.length + partExtraMaterials.length) > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs bg-[#1E3A5F] text-white rounded-full">
                    {partTplMaterials.length + partTussTplMaterials.length + partExtraMaterials.length}
                  </span>
                )}
              </button>
            </div>

            {partLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1E3A5F]" />
              </div>
            ) : partTab === 'procedimento' ? (
              <>
                {partProcedures.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500">
                    Nenhum procedimento particular cadastrado.
                    <br />
                    Cadastre em Configuracoes &rarr; Procedimentos.
                  </div>
                ) : (
                  <div className="mb-4 space-y-2 max-h-60 overflow-y-auto">
                    {partProcedures.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${partSelectedId === p.id ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <input
                          type="radio"
                          name="partProc"
                          value={p.id}
                          checked={partSelectedId === p.id}
                          onChange={() => setPartSelectedId(p.id)}
                          className="mt-0.5 accent-[#1E3A5F]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{p.name}</div>
                          {p.description && <div className="text-xs text-slate-500 mt-0.5">{p.description}</div>}
                          <div className="flex gap-3 mt-1 text-xs text-slate-500">
                            {p.value != null && <span>R$ {Number(p.value).toFixed(2)}</span>}
                            {p.duration != null && <span>{p.duration} min</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes (opcional)</label>
                  <textarea
                    value={partNotes}
                    onChange={(e) => setPartNotes(e.target.value)}
                    rows={2}
                    placeholder="Observacoes sobre o procedimento..."
                    className={inputCls}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Estoque tab */}
                {partTplMaterials.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Materiais do template</h4>
                    <div className="space-y-2">
                      {partTplMaterials.map((m, i) => {
                        const insufficient = m.available < m.quantity;
                        return (
                          <div key={`part-tpl-${m.productId}-${i}`} className="flex items-center gap-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-800 truncate">{m.productName}</div>
                              <div className={`text-xs ${insufficient ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                Disponivel: {m.available} {m.unit}
                              </div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.quantity}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setPartTplMaterials((rows) => rows.map((r, idx) => idx === i ? { ...r, quantity: isNaN(v) ? 0 : v } : r));
                              }}
                              className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm"
                            />
                            <span className="text-xs text-slate-500 w-10">{m.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TUSS selection (independent of particular procedure) */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Procedimento TUSS (opcional)</h4>
                  <select
                    value={partTussSelectedId}
                    onChange={(e) => setPartTussSelectedId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="">Selecione um procedimento TUSS...</option>
                    {partTussList.map((t) => (
                      <option key={t.id} value={t.id}>[{t.code}] {t.description} {t.value != null ? `— R$ ${Number(t.value).toFixed(2)}` : ''}</option>
                    ))}
                  </select>
                </div>

                {partTussTplMaterials.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Materiais do TUSS</h4>
                    <div className="space-y-2">
                      {partTussTplMaterials.map((m, i) => {
                        const insufficient = m.available < m.quantity;
                        return (
                          <div key={`part-tuss-tpl-${m.productId}-${i}`} className="flex items-center gap-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-800 truncate">{m.productName}</div>
                              <div className={`text-xs ${insufficient ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                Disponivel: {m.available} {m.unit}
                              </div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.quantity}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setPartTussTplMaterials((rows) => rows.map((r, idx) => idx === i ? { ...r, quantity: isNaN(v) ? 0 : v } : r));
                              }}
                              className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm"
                            />
                            <span className="text-xs text-slate-500 w-10">{m.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Materiais extras</h4>
                  {partExtraMaterials.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {partExtraMaterials.map((m, i) => (
                        <div key={`part-extra-${i}`} className="flex items-center gap-2 text-sm">
                          <select
                            value={m.productId}
                            onChange={(e) => {
                              const productId = e.target.value;
                              const prod = (inventoryProducts || []).find((p) => p.id === productId);
                              setPartExtraMaterials((rows) => rows.map((r, idx) => idx === i ? {
                                ...r,
                                productId,
                                productName: prod?.name || '',
                                unit: prod?.unit || 'un',
                                available: prod?.quantity ?? 0,
                              } : r));
                            }}
                            className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm"
                          >
                            <option value="">Selecione um produto...</option>
                            {(inventoryProducts || []).map((p) => (
                              <option key={p.id} value={p.id}>{p.name} (estoque: {p.quantity} {p.unit})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={m.quantity}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setPartExtraMaterials((rows) => rows.map((r, idx) => idx === i ? { ...r, quantity: isNaN(v) ? 0 : v } : r));
                            }}
                            className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setPartExtraMaterials((rows) => rows.filter((_, idx) => idx !== i))}
                            className="text-slate-400 hover:text-red-500"
                            title="Remover"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setPartExtraMaterials((rows) => [...rows, { productId: '', productName: '', unit: 'un', quantity: 1, available: 0 }])}
                    className="text-xs font-medium text-[#1E3A5F] hover:underline"
                  >
                    + Adicionar material
                  </button>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-4 mt-2 border-t border-slate-100">
              <button
                onClick={() => setPartModalCall(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitPartModal}
                disabled={partSubmitting || partLoading || !partSelectedId}
                className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50"
              >
                {partSubmitting
                  ? 'Salvando...'
                  : partTab === 'procedimento' && (partTplMaterials.length > 0 || partExtraMaterials.length > 0)
                    ? 'Proximo: Estoque'
                    : partRetro ? 'Registrar' : 'Confirmar Realizacao'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-lg shadow-lg text-sm z-[9999] max-w-sm">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
