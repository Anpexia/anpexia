import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, UserCheck, Phone, Stethoscope, RefreshCw, Play, CheckCircle2, X, AlertTriangle, History } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { PatientPanel } from '../components/PatientPanel';

interface QueueItem {
  id: string;
  name: string;
  phone: string;
  status: string;
  date: string;
  checkinAt: string | null;
  calledAt: string | null;
  doctorId: string | null;
  customerId: string | null;
  customer: { id: string; name: string; phone: string } | null;
  doctor: { id: string; name: string } | null;
}

interface Doctor {
  id: string;
  name: string;
  especialidade?: string | null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return `${String(sp.getUTCHours()).padStart(2, '0')}:${String(sp.getUTCMinutes()).padStart(2, '0')}`;
}

function WaitTimer({ since }: { since: string }) {
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const calc = () => {
      const diff = Date.now() - new Date(since).getTime();
      setMinutes(Math.max(0, Math.floor(diff / 60000)));
    };
    calc();
    const interval = setInterval(calc, 10000);
    return () => clearInterval(interval);
  }, [since]);

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return (
    <span className={`text-sm font-bold tabular-nums ${minutes >= 30 ? 'text-red-600' : minutes >= 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
      {hours > 0 ? `${hours}h ${String(mins).padStart(2, '0')}min` : `${mins}min`}
    </span>
  );
}

export function FilaPage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [attendingItem, setAttendingItem] = useState<QueueItem | null>(null);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const isDoctor = user?.role === 'DOCTOR' || user?.role === 'HEALTH_PROFESSIONAL' || !!user?.isProvider;

  // Tabs & history
  const [activeTab, setActiveTab] = useState<'fila' | 'historico'>('fila');
  const [historyItems, setHistoryItems] = useState<QueueItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const todayStr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [historyFrom, setHistoryFrom] = useState(todayStr);
  const [historyTo, setHistoryTo] = useState(todayStr);

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

  const fetchDoctors = useCallback(async () => {
    try {
      const { data } = await api.get('/team/doctors');
      setDoctors(data.data || []);
    } catch {}
  }, []);

  const fetchQueue = useCallback(async (docId?: string) => {
    try {
      const params: any = {};
      const doctorFilter = docId || selectedDoctor;
      if (doctorFilter) params.doctorId = doctorFilter;
      const { data } = await api.get('/scheduling/queue', { params });
      setQueue(data.data || []);
    } catch {} finally { setLoading(false); }
  }, [selectedDoctor]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params: any = { from: historyFrom, to: historyTo };
      const doctorFilter = selectedDoctor;
      if (doctorFilter) params.doctorId = doctorFilter;
      const { data } = await api.get('/scheduling/queue/history', { params });
      setHistoryItems(data.data || []);
    } catch {} finally { setHistoryLoading(false); }
  }, [historyFrom, historyTo, selectedDoctor]);

  useEffect(() => {
    if (activeTab === 'historico') fetchHistory();
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  useEffect(() => {
    if (isDoctor && user?.id) {
      setSelectedDoctor(user.id);
      fetchQueue(user.id);
    } else {
      fetchQueue();
    }
  }, [isDoctor, user?.id, fetchQueue]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => fetchQueue(), 30000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [fetchQueue]);

  const handleDoctorFilter = (docId: string) => {
    setSelectedDoctor(docId);
    setLoading(true);
    fetchQueue(docId);
  };

  const handleCall = async (id: string) => {
    setActionId(id);
    try {
      await api.patch(`/scheduling/queue/${id}/call`);
      showToast('Paciente chamado!');
      fetchQueue();
    } catch { showToast('Erro ao chamar paciente'); }
    finally { setActionId(null); }
  };

  const handleUncall = async (id: string) => {
    setActionId(id);
    try {
      await api.patch(`/scheduling/queue/${id}/uncall`);
      showToast('Paciente retornou à fila');
      fetchQueue();
    } catch { showToast('Erro ao desfazer chamada'); }
    finally { setActionId(null); }
  };

  const handleStartAttendance = async (item: QueueItem) => {
    setActionId(item.id);
    try {
      await api.patch(`/scheduling/queue/${item.id}/start`);
      setAttendingItem({ ...item, status: 'in_attendance' });
      fetchQueue();
    } catch { showToast('Erro ao iniciar atendimento'); }
    finally { setActionId(null); }
  };

  const handleFinishAttendance = async () => {
    if (!attendingItem) return;
    setActionId(attendingItem.id);
    try {
      await api.patch(`/scheduling/queue/${attendingItem.id}/finish`);
      showToast('Atendimento finalizado!');
      setAttendingItem(null);
      fetchQueue();
    } catch { showToast('Erro ao finalizar atendimento'); }
    finally { setActionId(null); }
  };

  // Split queue into sections
  const waiting = queue.filter(q => q.status === 'present' && !q.calledAt);
  const called = queue.filter(q => q.status === 'present' && !!q.calledAt);
  const inAttendance = queue.filter(q => q.status === 'in_attendance');
  const attended = queue.filter(q => q.status === 'attended');

  waiting.sort((a, b) => {
    if (!a.checkinAt || !b.checkinAt) return 0;
    return new Date(a.checkinAt).getTime() - new Date(b.checkinAt).getTime();
  });

  const totalActive = waiting.length + called.length + inAttendance.length + attended.length;

  return (
    <div>
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-[#1E3A5F] text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in">
          {toastMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fila de Atendimento</h1>
          <p className="text-sm text-slate-500">
            {activeTab === 'fila'
              ? totalActive > 0 ? `${totalActive} paciente${totalActive !== 1 ? 's' : ''} em andamento` : 'Nenhum paciente na fila hoje'
              : `${historyItems.length} atendimento${historyItems.length !== 1 ? 's' : ''} no periodo`
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isDoctor && (
            <select
              value={selectedDoctor}
              onChange={e => handleDoctorFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
            >
              <option value="">Todos os medicos</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => { if (activeTab === 'fila') { setLoading(true); fetchQueue(); } else { fetchHistory(); } }}
            className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
            title="Atualizar"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-1 mb-6">
        <button onClick={() => setActiveTab('fila')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'fila' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Clock size={15} /> Fila
        </button>
        <button onClick={() => setActiveTab('historico')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'historico' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <History size={15} /> Historico
        </button>
      </div>

      {/* Tab: Fila */}
      {activeTab === 'fila' && (
        <>
          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-[#1E3A5F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Carregando fila...</p>
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Clock size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium">Nenhum paciente na fila</p>
              <p className="text-sm text-slate-400 mt-1">Pacientes aparecem aqui quando a recepcionista marca como "Presente"</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Waiting */}
              {waiting.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <Clock size={16} className="text-amber-500" />
                    Aguardando ({waiting.length})
                  </h2>
                  <div className="space-y-2">
                    {waiting.map((item, index) => (
                      <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{item.customer?.name || item.name}</p>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              <span className="flex items-center gap-1"><Clock size={11} /> Agendado: {formatTime(item.date)}</span>
                              {item.checkinAt && <span className="flex items-center gap-1"><UserCheck size={11} /> Chegou: {formatTime(item.checkinAt)}</span>}
                              {item.phone && <span className="items-center gap-1 hidden sm:flex"><Phone size={11} /> {item.phone}</span>}
                            </div>
                            {!isDoctor && item.doctor && (
                              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> {item.doctor.name}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-center">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Espera</p>
                            {item.checkinAt && <WaitTimer since={item.checkinAt} />}
                          </div>
                          <button
                            onClick={() => handleCall(item.id)}
                            disabled={actionId === item.id}
                            className="px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <UserCheck size={14} />
                            Chamar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Called — waiting to start attendance */}
              {called.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <UserCheck size={16} className="text-blue-500" />
                    Chamados ({called.length})
                  </h2>
                  <div className="space-y-2">
                    {called.map(item => (
                      <div key={item.id} className="bg-blue-50 rounded-xl border border-blue-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <UserCheck size={16} className="text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{item.customer?.name || item.name}</p>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              <span>Agendado: {formatTime(item.date)}</span>
                              {item.checkinAt && <span>Chegou: {formatTime(item.checkinAt)}</span>}
                              {item.calledAt && <span className="text-blue-600 font-medium">Chamado: {formatTime(item.calledAt)}</span>}
                            </div>
                            {!isDoctor && item.doctor && (
                              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> {item.doctor.name}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleUncall(item.id)}
                            disabled={actionId === item.id}
                            className="px-3 py-2 border border-slate-300 bg-white text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                          >
                            Voltar para fila
                          </button>
                          <button
                            onClick={() => handleStartAttendance(item)}
                            disabled={actionId === item.id}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <Play size={14} />
                            Iniciar Atendimento
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* In Attendance */}
              {inAttendance.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <Stethoscope size={16} className="text-emerald-500" />
                    Em Atendimento ({inAttendance.length})
                  </h2>
                  <div className="space-y-2">
                    {inAttendance.map(item => (
                      <div key={item.id} className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <Stethoscope size={16} className="text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{item.customer?.name || item.name}</p>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              <span>Agendado: {formatTime(item.date)}</span>
                              {item.calledAt && <span className="text-emerald-600 font-medium">Iniciado: {formatTime(item.calledAt)}</span>}
                            </div>
                            {!isDoctor && item.doctor && (
                              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> {item.doctor.name}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setAttendingItem(item)}
                          className="px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] flex items-center gap-1.5 shrink-0"
                        >
                          <Stethoscope size={14} />
                          Abrir Atendimento
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attended — doctor finished, waiting for secretary */}
              {attended.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    Atendidos ({attended.length})
                  </h2>
                  <div className="space-y-2">
                    {attended.map(item => (
                      <div key={item.id} className="bg-emerald-50/50 rounded-xl border border-emerald-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{item.customer?.name || item.name}</p>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              <span>Agendado: {formatTime(item.date)}</span>
                              {item.checkinAt && <span>Chegou: {formatTime(item.checkinAt)}</span>}
                            </div>
                            {!isDoctor && item.doctor && (
                              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> {item.doctor.name}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full shrink-0">Consulta finalizada</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Tab: Historico */}
      {activeTab === 'historico' && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">De:</label>
              <input type="date" value={historyFrom} onChange={e => setHistoryFrom(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Ate:</label>
              <input type="date" value={historyTo} onChange={e => setHistoryTo(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <button onClick={fetchHistory}
              className="px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A]">
              Filtrar
            </button>
          </div>

          {historyLoading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-[#1E3A5F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Carregando historico...</p>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <History size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium">Nenhum atendimento no periodo</p>
              <p className="text-sm text-slate-400 mt-1">Ajuste as datas para ver atendimentos concluidos</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-slate-600 font-medium">Paciente</th>
                      <th className="text-left px-4 py-3 text-slate-600 font-medium">Medico</th>
                      <th className="text-left px-4 py-3 text-slate-600 font-medium">Data Agendamento</th>
                      <th className="text-left px-4 py-3 text-slate-600 font-medium">Check-in</th>
                      <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{item.customer?.name || item.name}</td>
                        <td className="px-4 py-3 text-slate-600">{item.doctor?.name || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">{new Date(item.date).toLocaleDateString('pt-BR')} {formatTime(item.date)}</td>
                        <td className="px-4 py-3 text-slate-600">{item.checkinAt ? formatTime(item.checkinAt) : '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.status === 'completed' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                            {item.status === 'completed' ? 'Concluido' : 'Atendido'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Patient Panel Popup */}
      {attendingItem && attendingItem.customer?.id && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4 relative flex flex-col max-h-[calc(100vh-2rem)]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  Atendimento — {attendingItem.customer?.name || attendingItem.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Agendado: {formatTime(attendingItem.date)}
                  {attendingItem.calledAt && ` · Chamado: ${formatTime(attendingItem.calledAt)}`}
                  {attendingItem.doctor && ` · Dr(a). ${attendingItem.doctor.name}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {attendingItem.status === 'in_attendance' && (
                  <button
                    onClick={handleFinishAttendance}
                    disabled={actionId === attendingItem.id}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    Finalizar Atendimento
                  </button>
                )}
                <button
                  onClick={() => setAttendingItem(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            {/* PatientPanel */}
            <div className="overflow-y-auto flex-1 p-6">
              <PatientPanel
                customerId={attendingItem.customer.id}
                initialTab="prontuario"
                onPatientUpdated={() => fetchQueue()}
              />
            </div>
          </div>
        </div>
      )}

      {/* Warning popup when attending item has no customer linked */}
      {attendingItem && !attendingItem.customer?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-amber-500" />
              <h3 className="text-lg font-bold text-slate-800">Paciente não vinculado</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Este agendamento não está vinculado a nenhum paciente cadastrado.
              Para abrir o prontuário, vincule o paciente primeiro na página de Agendamentos.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAttendingItem(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
