import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Clock, X, Check, XCircle, Phone, Search, AlertTriangle, ChevronLeft, ChevronRight, FileCheck2, AlertCircle } from 'lucide-react';
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
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  doctor: { id: string; name: string } | null;
  procedures?: CallProcedure[];
  createdAt: string;
}

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

  // Doctors
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  // Registrar TUSS (ao clicar em "Realizado")
  const [tussModalCall, setTussModalCall] = useState<Appointment | null>(null);
  const [tussModalProcedures, setTussModalProcedures] = useState<TussProc[]>([]);
  const [tussLoadingList, setTussLoadingList] = useState(false);
  const [tussSelected, setTussSelected] = useState<Record<string, { checked: boolean; authorizationNumber: string }>>({});
  const [tussSaving, setTussSaving] = useState(false);

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

  useEffect(() => { fetchAppointments(); fetchDates(); fetchDoctors(); }, [fetchAppointments, fetchDates, fetchDoctors]);

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

  const openBookWithSlot = (date: string, time: string) => {
    setBookForm({ name: '', phone: '', email: '', date, time, notes: '', customerId: '', doctorId: '' });
    setSelectedBookCustomer(null);
    setCustomerSearch('');
    setShowBookModal(true);
  };

  const openBook = () => {
    setBookForm({ name: '', phone: '', email: '', date: '', time: '', notes: '', customerId: '', doctorId: '' });
    setSelectedBookCustomer(null);
    setCustomerSearch('');
    setShowBookModal(true);
  };

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
  };

  const clearSelectedCustomer = () => {
    setSelectedBookCustomer(null);
    setBookForm(prev => ({ ...prev, customerId: '' }));
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookForm.doctorId) {
      showToast('Selecione o medico responsavel pela consulta');
      return;
    }
    setSaving(true);
    try {
      await api.post('/scheduling/book', {
        name: bookForm.name,
        phone: bookForm.phone,
        email: bookForm.email || undefined,
        date: bookForm.date,
        time: bookForm.time || undefined,
        notes: bookForm.notes || undefined,
        customerId: bookForm.customerId || undefined,
        doctorId: bookForm.doctorId,
      });
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

  // When clicking "Realizado":
  // - If patient has convenio: open TUSS modal to select procedures before marking completed.
  // - Otherwise: mark as completed directly.
  const handleRealized = async (a: Appointment) => {
    const hasConvenio = await patientHasConvenio(a);
    if (hasConvenio) {
      await openTussModalForCall(a);
    } else {
      await handleStatusChange(a.id, 'completed');
    }
  };

  const patientHasConvenio = async (a: Appointment): Promise<boolean> => {
    if (!a.customerId) return false;
    try {
      const { data } = await api.get(`/convenios/patients/${a.customerId}`);
      return !!data.data;
    } catch {
      return false;
    }
  };

  const openTussModalForCall = async (a: Appointment) => {
    setTussModalCall(a);
    setTussSelected({});
    setTussLoadingList(true);
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
      setTussModalProcedures(data.data || []);
    } catch {
      setTussModalProcedures([]);
    } finally {
      setTussLoadingList(false);
    }
  };

  const submitTussModal = async () => {
    if (!tussModalCall) return;
    const selected = Object.entries(tussSelected)
      .filter(([, v]) => v.checked)
      .map(([id, v]) => ({ tussProcedureId: id, authorizationNumber: v.authorizationNumber || null }));

    if (selected.length === 0) {
      showToast('Selecione ao menos um procedimento');
      return;
    }
    setTussSaving(true);
    try {
      await api.post(`/scheduling/calls/${tussModalCall.id}/procedures`, { procedures: selected });
      await api.patch(`/scheduling/calls/${tussModalCall.id}`, { status: 'completed' });
      showToast('Procedimentos registrados!');
      setTussModalCall(null);
      fetchAppointments();
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao registrar procedimentos');
    } finally {
      setTussSaving(false);
    }
  };

  const openRegistrarTussForExisting = async (a: Appointment) => {
    await openTussModalForCall(a);
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
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800">{a.customer?.name || a.name}</span>
                                {a.customer && <span className="text-xs bg-[#EFF6FF] text-[#1E3A5F] px-1.5 py-0.5 rounded">Paciente vinculado</span>}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                                <span className="flex items-center gap-1"><Clock size={14} />{format(new Date(a.date), 'HH:mm')}</span>
                                <span className="flex items-center gap-1"><Phone size={14} />{a.phone}</span>
                              </div>
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
                        <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-center justify-between opacity-90">
                          <div className="flex items-center gap-3">
                            {isRealized && hasProcs && (
                              <span title="TUSS vinculado" className="flex items-center text-emerald-600"><FileCheck2 size={16} /></span>
                            )}
                            {isRealized && !hasProcs && (
                              <span title="Sem TUSS vinculado" className="flex items-center text-amber-500"><AlertCircle size={16} /></span>
                            )}
                            <span className="text-sm text-slate-500">{format(new Date(a.date), 'dd/MM HH:mm')}</span>
                            <span className="text-sm font-medium text-slate-800">{a.customer?.name || a.name}</span>
                            <span className="text-sm text-slate-500">{a.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isRealized && !hasProcs && (
                              <button
                                onClick={() => openRegistrarTussForExisting(a)}
                                className="px-2 py-1 text-xs font-medium rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                              >
                                Registrar TUSS
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

      {/* TUSS Procedures Modal — triggered by "Realizado" when patient has convenio */}
      {tussModalCall && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Registrar procedimentos realizados</h3>
              <button onClick={() => setTussModalCall(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Paciente: <strong>{tussModalCall.customer?.name || tussModalCall.name}</strong> — {format(new Date(tussModalCall.date), 'dd/MM/yyyy HH:mm')}
            </p>

            {tussLoadingList ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1E3A5F]" />
              </div>
            ) : tussModalProcedures.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                Nenhum procedimento TUSS cadastrado para este convenio.
                <br />
                Cadastre em Configuracoes &gt; Procedimentos TUSS.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {tussModalProcedures.map((p) => {
                  const sel = tussSelected[p.id] || { checked: false, authorizationNumber: '' };
                  return (
                    <div key={p.id} className={`border rounded-lg p-3 ${sel.checked ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'}`}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sel.checked}
                          onChange={(e) => setTussSelected((s) => ({
                            ...s,
                            [p.id]: { checked: e.target.checked, authorizationNumber: s[p.id]?.authorizationNumber || '' },
                          }))}
                          className="mt-1 rounded border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-500">{p.code}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{p.type}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-800">{p.description}</p>
                          <p className="text-xs text-slate-500">R$ {Number(p.value).toFixed(2)}</p>
                          {sel.checked && (
                            <input
                              type="text"
                              placeholder="Numero de autorizacao (opcional)"
                              value={sel.authorizationNumber}
                              onChange={(e) => setTussSelected((s) => ({
                                ...s,
                                [p.id]: { checked: true, authorizationNumber: e.target.value },
                              }))}
                              className="mt-2 w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                            />
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 pt-4 mt-4 border-t border-slate-100">
              <button
                onClick={() => setTussModalCall(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitTussModal}
                disabled={tussSaving || tussLoadingList}
                className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50"
              >
                {tussSaving ? 'Registrando...' : 'Confirmar e registrar'}
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
