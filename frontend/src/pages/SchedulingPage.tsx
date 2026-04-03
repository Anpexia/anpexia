import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, X, Check, XCircle, Phone, Search, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';

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
  customer: { id: string; name: string; phone: string; email: string | null } | null;
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
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${isActive ? 'bg-indigo-50 text-indigo-600 font-medium' : 'bg-slate-100 text-slate-400'} ${isCurrent ? 'ring-1 ring-indigo-500' : ''}`}>
              <span className="text-[10px]">{step.icon}</span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < timelineSteps.length - 1 && (
              <div className={`w-3 h-0.5 ${isActive ? 'bg-indigo-600' : 'bg-slate-200'}`} />
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
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // New appointment
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookForm, setBookForm] = useState({ name: '', phone: '', email: '', date: '', time: '', notes: '', customerId: '' });
  const [saving, setSaving] = useState(false);

  // Customer search in booking modal
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSearch[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [selectedBookCustomer, setSelectedBookCustomer] = useState<CustomerSearch | null>(null);

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  useEffect(() => { fetchAppointments(); fetchDates(); }, [fetchAppointments, fetchDates]);

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
      const { data } = await api.get(`/scheduling/available-slots/${date}`);
      setSlots(data.data);
    } catch {} finally { setLoadingSlots(false); }
  };

  const openBookWithSlot = (date: string, time: string) => {
    setBookForm({ name: '', phone: '', email: '', date, time, notes: '', customerId: '' });
    setSelectedBookCustomer(null);
    setCustomerSearch('');
    setShowBookModal(true);
  };

  const openBook = () => {
    setBookForm({ name: '', phone: '', email: '', date: '', time: '', notes: '', customerId: '' });
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
      });
      setShowBookModal(false);
      fetchAppointments();
      fetchDates();
    } catch {} finally { setSaving(false); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await api.patch(`/scheduling/calls/${id}`, { status });
      fetchAppointments();
    } catch {} finally { setUpdatingId(null); }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.delete(`/scheduling/calls/${id}`);
      fetchAppointments();
      fetchDates();
    } catch {}
  };

  const upcomingAppointments = appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed');
  const pastAppointments = appointments.filter(a => a.status !== 'scheduled' && a.status !== 'confirmed');

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Agendamentos</h2>
          <p className="text-slate-500 mt-1">Gerencie consultas e compromissos</p>
        </div>
        <button onClick={openBook} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Calendar size={18} />
          Novo agendamento
        </button>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <button onClick={() => setView('list')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === 'list' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Lista
        </button>
        <button onClick={() => setView('calendar')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === 'calendar' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Calendario
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
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
                            <div className="bg-indigo-50 rounded-lg p-3 text-center min-w-[60px]">
                              <p className="text-xs text-indigo-600 font-medium">{format(new Date(a.date), 'MMM', { locale: ptBR }).toUpperCase()}</p>
                              <p className="text-xl font-bold text-indigo-600">{format(new Date(a.date), 'dd')}</p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800">{a.customer?.name || a.name}</span>
                                {a.customer && <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">Paciente vinculado</span>}
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
                            <button onClick={() => handleStatusChange(a.id, 'completed')} disabled={updatingId === a.id} className="px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-100">
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
                      return (
                        <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-center justify-between opacity-75">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-slate-500">{format(new Date(a.date), 'dd/MM HH:mm')}</span>
                            <span className="text-sm font-medium text-slate-800">{a.customer?.name || a.name}</span>
                            <span className="text-sm text-slate-500">{a.phone}</span>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded ${st.cls}`}>{st.icon} {st.label}</span>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Available dates */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-semibold text-slate-800 mb-4">Datas disponiveis</h3>
                <div className="grid grid-cols-2 gap-2">
                  {availableDates.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => handleDateClick(d.date)}
                      className={`p-3 rounded-lg border text-left transition-colors ${selectedDate === d.date ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <p className="text-sm font-medium text-slate-800">{format(new Date(d.date + 'T12:00:00'), 'EEEE', { locale: ptBR })}</p>
                      <p className="text-xs text-slate-500">{format(new Date(d.date + 'T12:00:00'), 'dd/MM/yyyy')}</p>
                      <p className="text-xs text-indigo-600 mt-1">{d.availableSlots} vagas</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Slots for selected date */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                {!selectedDate ? (
                  <p className="text-sm text-slate-500 text-center py-12">Selecione uma data para ver os horarios.</p>
                ) : loadingSlots ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
                ) : (
                  <>
                    <h3 className="font-semibold text-slate-800 mb-4">
                      Horarios — {format(new Date(selectedDate + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })}
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((s) => (
                        <button
                          key={s.time}
                          onClick={() => s.available && openBookWithSlot(selectedDate, s.time)}
                          disabled={!s.available}
                          className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${s.available ? 'border border-green-200 text-green-700 hover:bg-green-50' : 'bg-slate-100 text-slate-400 cursor-not-allowed line-through'}`}
                        >
                          {s.time}
                        </button>
                      ))}
                    </div>
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
                  <div className="flex items-center justify-between p-2.5 bg-indigo-50/50 border border-indigo-200 rounded-lg">
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
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Agendando...' : 'Agendar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
