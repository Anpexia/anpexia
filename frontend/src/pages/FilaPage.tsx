import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, UserCheck, Phone, Stethoscope, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

interface QueueItem {
  id: string;
  name: string;
  phone: string;
  date: string;
  checkinAt: string | null;
  calledAt: string | null;
  doctorId: string | null;
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
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const isDoctor = user?.role === 'DOCTOR';

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

  // Auto-refresh every 30 seconds
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
      showToast('Paciente retornou a fila');
      fetchQueue();
    } catch { showToast('Erro ao desfazer chamada'); }
    finally { setActionId(null); }
  };

  const waiting = queue.filter(q => !q.calledAt);
  const inAttendance = queue.filter(q => !!q.calledAt);

  // Sort waiting by checkinAt (longest wait first)
  waiting.sort((a, b) => {
    if (!a.checkinAt || !b.checkinAt) return 0;
    return new Date(a.checkinAt).getTime() - new Date(b.checkinAt).getTime();
  });

  return (
    <div>
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-[#1E3A5F] text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in">
          {toastMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fila de Atendimento</h1>
          <p className="text-sm text-slate-500">Pacientes aguardando atendimento hoje</p>
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
            onClick={() => { setLoading(true); fetchQueue(); }}
            className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
            title="Atualizar fila"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

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
          <div>
            <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
              <Clock size={16} className="text-amber-500" />
              Aguardando ({waiting.length})
            </h2>
            {waiting.length === 0 ? (
              <p className="text-xs text-slate-400 bg-white rounded-lg border border-slate-200 p-4 text-center">Nenhum paciente aguardando</p>
            ) : (
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
                          {item.phone && <span className="flex items-center gap-1 hidden sm:flex"><Phone size={11} /> {item.phone}</span>}
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
            )}
          </div>

          {/* In attendance */}
          {inAttendance.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                <Stethoscope size={16} className="text-emerald-500" />
                Em atendimento ({inAttendance.length})
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
                          {item.checkinAt && <span>Chegou: {formatTime(item.checkinAt)}</span>}
                          {item.calledAt && <span className="text-emerald-600 font-medium">Chamado: {formatTime(item.calledAt)}</span>}
                        </div>
                        {!isDoctor && item.doctor && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Stethoscope size={11} /> {item.doctor.name}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUncall(item.id)}
                      disabled={actionId === item.id}
                      className="px-3 py-1.5 border border-slate-300 bg-white text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      Voltar para fila
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
