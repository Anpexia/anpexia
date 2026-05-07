import { useEffect, useState } from 'react';
import { Calendar, Clock, Building2, Phone, User, ChevronDown, CheckCircle, AlertTriangle, Filter } from 'lucide-react';
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

type FilterStatus = 'ALL' | 'PENDING' | 'DONE';

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
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reunioes</h2>
          <p className="text-sm text-gray-500 mt-1">Agenda comercial com leads</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-gray-500">Carregando...</p>
        </div>
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reunioes</h2>
          <p className="text-sm text-gray-500 mt-1">Agenda comercial — reunioes, follow-ups e ligacoes com leads</p>
        </div>
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
