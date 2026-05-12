import { useEffect, useState } from 'react';
import { Calendar, Clock, Building2, Phone, CheckCircle, AlertTriangle, Filter, Settings, Mail, Plus, X, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface LeadInfo {
  id: string;
  name: string;
  companyName?: string | null;
  company?: string | null;
  phone?: string | null;
  stage?: string;
}

interface MeetingTask {
  id: string;
  leadId: string;
  type: string;
  dueAt: string;
  responsible: string | null;
  status: string;
  googleEventId: string | null;
  createdAt: string;
  lead: LeadInfo;
}

interface ReminderSettings {
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
  emailEnabled: boolean;
  emailRecipients: string[];
}

type FilterStatus = 'ALL' | 'PENDING' | 'DONE';
type TabId = 'reunioes' | 'configuracoes';

function classifyDate(dueAt: string): { label: string; group: string; isOverdue: boolean } {
  const now = new Date();
  const due = new Date(dueAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (due < now && dueDay < today) return { label: 'Atrasada', group: 'OVERDUE', isOverdue: true };
  if (dueDay.getTime() === today.getTime()) return { label: 'Hoje', group: 'TODAY', isOverdue: due < now };
  if (dueDay.getTime() === tomorrow.getTime()) return { label: 'Amanha', group: 'TOMORROW', isOverdue: false };

  const weekday = due.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const dateStr = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return { label: `${dateStr} (${weekday})`, group: dateStr, isOverdue: false };
}

function formatTime(dueAt: string): string {
  return new Date(dueAt).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TYPE_LABEL: Record<string, string> = {
  MEETING: 'Reuniao',
  FOLLOWUP: 'Follow-up',
  CALL: 'Ligacao',
  PROPOSAL: 'Proposta',
  OTHER: 'Outro',
};

export default function ReunioesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('reunioes');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reunioes</h2>
        <p className="text-sm text-gray-500 mt-1">Agenda comercial — reunioes, follow-ups e configuracoes</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('reunioes')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'reunioes'
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar size={16} className="inline mr-1.5 -mt-0.5" />
          Reunioes
        </button>
        <button
          onClick={() => setActiveTab('configuracoes')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'configuracoes'
              ? 'border-[#1E3A5F] text-[#1E3A5F]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings size={16} className="inline mr-1.5 -mt-0.5" />
          Configuracoes
        </button>
      </div>

      {activeTab === 'reunioes' ? <MeetingsTab /> : <ConfigTab />}
    </div>
  );
}

// ================================================================
// Tab 1: Reunioes (existing functionality)
// ================================================================

function MeetingsTab() {
  const [meetings, setMeetings] = useState<MeetingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchMeetings = async () => {
    try {
      const { data } = await api.get('/admin/meetings');
      setMeetings(data.data || []);
    } catch {
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMeetings(); }, []);

  const toggleStatus = async (task: MeetingTask) => {
    const newStatus = task.status === 'DONE' ? 'PENDING' : 'DONE';
    setUpdatingId(task.id);
    try {
      await api.patch(`/admin/meetings/${task.id}`, { status: newStatus });
      setMeetings(prev => prev.map(m => m.id === task.id ? { ...m, status: newStatus } : m));
    } catch { /* ignore */ }
    finally { setUpdatingId(null); }
  };

  const filtered = meetings.filter(m => {
    if (filter === 'PENDING') return m.status === 'PENDING';
    if (filter === 'DONE') return m.status === 'DONE';
    return true;
  });

  const meetingTasks = filtered.filter(m => m.type === 'MEETING');
  const followupTasks = filtered.filter(m => m.type === 'FOLLOWUP' || m.type === 'CALL');

  const groupTasks = (tasks: MeetingTask[]) => {
    const groups: { key: string; label: string; isOverdue: boolean; tasks: MeetingTask[] }[] = [];
    const overdue: MeetingTask[] = [];
    const groupMap = new Map<string, { label: string; tasks: MeetingTask[] }>();

    for (const task of tasks) {
      const cls = classifyDate(task.dueAt);
      if (cls.group === 'OVERDUE' && task.status === 'PENDING') {
        overdue.push(task);
      } else {
        const existing = groupMap.get(cls.group);
        if (existing) {
          existing.tasks.push(task);
        } else {
          groupMap.set(cls.group, { label: cls.label, tasks: [task] });
        }
      }
    }

    if (overdue.length > 0) {
      groups.push({ key: 'OVERDUE', label: 'Atrasadas', isOverdue: true, tasks: overdue });
    }

    for (const [key, val] of groupMap) {
      groups.push({ key, label: val.label, isOverdue: false, tasks: val.tasks });
    }

    return groups;
  };

  const meetingGroups = groupTasks(meetingTasks);
  const followupGroups = groupTasks(followupTasks);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  const renderTaskCard = (task: MeetingTask) => {
    const cls = classifyDate(task.dueAt);
    const isDone = task.status === 'DONE';
    const isOverdue = cls.isOverdue && !isDone;
    const companyName = task.lead.companyName || task.lead.company || '';

    return (
      <div
        key={task.id}
        className={`bg-white rounded-lg shadow-sm border-l-4 p-4 flex items-center gap-4 transition-all ${
          isDone ? 'border-l-green-400 opacity-60' : isOverdue ? 'border-l-red-400' : 'border-l-amber-400'
        }`}
      >
        <button
          onClick={() => toggleStatus(task)}
          disabled={updatingId === task.id}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            isDone
              ? 'bg-green-100 text-green-600 hover:bg-green-200'
              : isOverdue
              ? 'bg-red-50 text-red-400 hover:bg-red-100'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
          title={isDone ? 'Marcar como pendente' : 'Marcar como realizada'}
        >
          {isDone ? <CheckCircle size={18} /> : isOverdue ? <AlertTriangle size={16} /> : <Clock size={16} />}
        </button>

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => navigate(`/crm/${task.leadId}`)}
        >
          <div className="flex items-center gap-2">
            <span className={`font-medium truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.lead.name}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0">
              {TYPE_LABEL[task.type] || task.type}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Clock size={13} /> {formatTime(task.dueAt)}
            </span>
            {companyName && (
              <span className="flex items-center gap-1 truncate">
                <Building2 size={13} /> {companyName}
              </span>
            )}
            {task.lead.phone && (
              <span className="flex items-center gap-1">
                <Phone size={13} /> {task.lead.phone}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            isDone ? 'bg-green-100 text-green-700' : isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {isDone ? 'Realizada' : isOverdue ? 'Atrasada' : 'Agendada'}
          </span>
        </div>
      </div>
    );
  };

  const renderGroups = (groups: ReturnType<typeof groupTasks>) => {
    if (groups.length === 0) return null;
    return groups.map(group => (
      <div key={group.key} className="space-y-2">
        <div className="flex items-center gap-2 pt-2">
          <div className={`h-px flex-1 ${group.isOverdue ? 'bg-red-200' : 'bg-gray-200'}`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${group.isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
            {group.label}
          </span>
          <div className={`h-px flex-1 ${group.isOverdue ? 'bg-red-200' : 'bg-gray-200'}`} />
        </div>
        {group.tasks.map(renderTaskCard)}
      </div>
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as FilterStatus)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          >
            <option value="ALL">Todas</option>
            <option value="PENDING">Pendentes</option>
            <option value="DONE">Realizadas</option>
          </select>
        </div>
      </div>

      {/* Reunioes section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Calendar size={20} className="text-[#1E3A5F]" /> Reunioes
          <span className="text-sm font-normal text-gray-400">({meetingTasks.length})</span>
        </h3>
        {meetingTasks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <Calendar size={40} className="mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">Nenhuma reuniao {filter === 'PENDING' ? 'pendente' : filter === 'DONE' ? 'realizada' : 'encontrada'}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {renderGroups(meetingGroups)}
          </div>
        )}
      </div>

      {/* Follow-ups section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Phone size={20} className="text-[#1E3A5F]" /> Follow-ups e Ligacoes
          <span className="text-sm font-normal text-gray-400">({followupTasks.length})</span>
        </h3>
        {followupTasks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <Phone size={40} className="mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">Nenhum follow-up {filter === 'PENDING' ? 'pendente' : filter === 'DONE' ? 'realizado' : 'encontrado'}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {renderGroups(followupGroups)}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// Tab 2: Configuracoes de lembretes
// ================================================================

function ConfigTab() {
  const [settings, setSettings] = useState<ReminderSettings>({
    reminder24hEnabled: true,
    reminder1hEnabled: true,
    emailEnabled: true,
    emailRecipients: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    api.get('/admin/settings/meeting-reminders')
      .then(({ data }) => setSettings(data.data || data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const { data } = await api.put('/admin/settings/meeting-reminders', settings);
      setSettings(data.data || data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    if (settings.emailRecipients.includes(email)) return;
    setSettings(s => ({ ...s, emailRecipients: [...s.emailRecipients, email] }));
    setNewEmail('');
  };

  const removeEmail = (email: string) => {
    setSettings(s => ({ ...s, emailRecipients: s.emailRecipients.filter(e => e !== email) }));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Email notification settings */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Mail size={20} className="text-[#1E3A5F]" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Lembretes por Email</h3>
            <p className="text-sm text-gray-500">Receba emails antes de reunioes e follow-ups</p>
          </div>
        </div>

        {/* Master toggle */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-800">Ativar lembretes por email</p>
            <p className="text-xs text-gray-500">Envia emails para os destinatarios configurados</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.emailEnabled}
              onChange={e => setSettings(s => ({ ...s, emailEnabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1E3A5F]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1E3A5F]"></div>
          </label>
        </div>

        {settings.emailEnabled && (
          <>
            {/* Reminder windows */}
            <div className="space-y-3 py-3 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-800">Horarios dos lembretes</p>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.reminder24hEnabled}
                  onChange={e => setSettings(s => ({ ...s, reminder24hEnabled: e.target.checked }))}
                  className="w-4 h-4 text-[#1E3A5F] border-gray-300 rounded focus:ring-[#1E3A5F]"
                />
                <div>
                  <span className="text-sm text-gray-700">24 horas antes</span>
                  <p className="text-xs text-gray-400">Lembrete enviado 1 dia antes da reuniao</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.reminder1hEnabled}
                  onChange={e => setSettings(s => ({ ...s, reminder1hEnabled: e.target.checked }))}
                  className="w-4 h-4 text-[#1E3A5F] border-gray-300 rounded focus:ring-[#1E3A5F]"
                />
                <div>
                  <span className="text-sm text-gray-700">1 hora antes</span>
                  <p className="text-xs text-gray-400">Lembrete enviado 1 hora antes da reuniao</p>
                </div>
              </label>
            </div>

            {/* Email recipients */}
            <div className="space-y-3 py-3 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-800">Destinatarios</p>
              <p className="text-xs text-gray-500">Adicione os emails que devem receber os lembretes</p>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                  placeholder="email@exemplo.com"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
                />
                <button
                  onClick={addEmail}
                  disabled={!newEmail.includes('@')}
                  className="px-3 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#15304F] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Plus size={16} /> Adicionar
                </button>
              </div>

              {settings.emailRecipients.length > 0 ? (
                <div className="space-y-2">
                  {settings.emailRecipients.map(email => (
                    <div key={email} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Mail size={14} className="text-gray-400" />
                        {email}
                      </div>
                      <button
                        onClick={() => removeEmail(email)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Nenhum destinatario configurado. Adicione pelo menos um email.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#15304F] disabled:opacity-50 flex items-center gap-2"
        >
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle size={16} /> Salvo com sucesso!
          </span>
        )}
      </div>
    </div>
  );
}
