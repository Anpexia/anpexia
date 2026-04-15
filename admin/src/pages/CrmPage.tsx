import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Phone, Building, Mail, TrendingUp, Users, DollarSign, Target, List, LayoutGrid, Calendar, CheckCircle2, Clock, StickyNote, Link as LinkIcon, Trash2 } from 'lucide-react';
import api from '../services/api';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragOverlay,
} from '@dnd-kit/core';

const STAGES = [
  { key: 'NEW', label: 'Novo', color: 'bg-slate-100 text-slate-800 border-slate-300', accent: '#64748b' },
  { key: 'CONTACTED', label: 'Contatado', color: 'bg-blue-100 text-blue-800 border-blue-300', accent: '#2563eb' },
  { key: 'QUALIFIED', label: 'Qualificado', color: 'bg-indigo-100 text-indigo-800 border-indigo-300', accent: '#4f46e5' },
  { key: 'PROPOSAL_SENT', label: 'Proposta Enviada', color: 'bg-cyan-100 text-cyan-800 border-cyan-300', accent: '#0891b2' },
  { key: 'NEGOTIATION', label: 'Negociação', color: 'bg-amber-100 text-amber-800 border-amber-300', accent: '#d97706' },
  { key: 'WON', label: 'Fechado', color: 'bg-green-100 text-green-800 border-green-300', accent: '#16a34a' },
  { key: 'LOST', label: 'Perdido', color: 'bg-red-100 text-red-800 border-red-300', accent: '#dc2626' },
];

const SOURCES = ['landing_page', 'google_ads', 'facebook_ads', 'whatsapp', 'indicacao', 'manual'];

function fmtCurrency(v: any) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function LeadCard({ lead, onClick }: { lead: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { lead } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between mb-1">
        <h4 className="text-sm font-medium text-gray-900 truncate flex-1">{lead.name}</h4>
      </div>
      {(lead.companyName || lead.company) && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
          <Building size={12} />
          <span className="truncate">{lead.companyName || lead.company}</span>
        </div>
      )}
      {lead.phone && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
          <Phone size={12} />
          <span>{lead.phone}</span>
        </div>
      )}
      {lead.estimatedValue != null && Number(lead.estimatedValue) > 0 && (
        <div className="flex items-center gap-1 text-xs text-green-700 font-medium mb-1">
          <DollarSign size={12} />
          <span>{fmtCurrency(lead.estimatedValue)}</span>
        </div>
      )}
      <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
        <Clock size={12} />
        <span>{formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true, locale: ptBR })}</span>
      </div>
    </div>
  );
}

function StageColumn({ stage, leads, onOpen }: { stage: typeof STAGES[0]; leads: any[]; onOpen: (l: any) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <div ref={setNodeRef} className={`flex-shrink-0 w-[260px] bg-gray-100 rounded-xl ${isOver ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="px-3 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold px-2 py-1 rounded border ${stage.color}`}>{stage.label}</span>
          <span className="text-xs text-gray-500 font-medium">{leads.length}</span>
        </div>
      </div>
      <div className="p-2 space-y-2 max-h-[65vh] overflow-y-auto">
        {leads.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhum lead</p>}
        {leads.map((l) => <LeadCard key={l.id} lead={l} onClick={() => onOpen(l)} />)}
      </div>
    </div>
  );
}

function LeadSlideOver({ lead, onClose, onChanged }: { lead: any; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<'info' | 'history' | 'tasks'>('info');
  const [activities, setActivities] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [form, setForm] = useState<any>(lead);
  const [newActivity, setNewActivity] = useState({ type: 'NOTE', content: '' });
  const [newTask, setNewTask] = useState({ type: 'FOLLOWUP', dueAt: '', responsible: '' });
  const [showTaskForm, setShowTaskForm] = useState(false);

  useEffect(() => {
    setForm(lead);
    api.get(`/admin/leads/${lead.id}/activities`).then((r) => setActivities(r.data.data || []));
    api.get(`/admin/leads/${lead.id}/tasks`).then((r) => setTasks(r.data.data || []));
  }, [lead.id]);

  const save = async () => {
    const body: any = {
      name: form.name, phone: form.phone, email: form.email,
      companyName: form.companyName || form.company,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
      responsible: form.responsible, tags: form.tags || [], notes: form.notes,
      zoomLink: form.zoomLink, source: form.source,
    };
    await api.patch(`/admin/leads/${lead.id}`, body);
    onChanged();
  };

  const changeStage = async (stage: string) => {
    await api.patch(`/admin/leads/${lead.id}/stage`, { stage });
    onChanged();
  };

  const addActivity = async () => {
    if (!newActivity.content.trim()) return;
    await api.post(`/admin/leads/${lead.id}/activities`, newActivity);
    setNewActivity({ type: 'NOTE', content: '' });
    const r = await api.get(`/admin/leads/${lead.id}/activities`);
    setActivities(r.data.data || []);
  };

  const addTask = async () => {
    if (!newTask.dueAt) return;
    await api.post(`/admin/leads/${lead.id}/tasks`, newTask);
    setNewTask({ type: 'FOLLOWUP', dueAt: '', responsible: '' });
    setShowTaskForm(false);
    const r = await api.get(`/admin/leads/${lead.id}/tasks`);
    setTasks(r.data.data || []);
  };

  const completeTask = async (id: string) => {
    await api.patch(`/admin/leads/tasks/${id}`, { status: 'DONE' });
    const r = await api.get(`/admin/leads/${lead.id}/tasks`);
    setTasks(r.data.data || []);
  };

  const deleteTask = async (id: string) => {
    await api.delete(`/admin/leads/tasks/${id}`);
    const r = await api.get(`/admin/leads/${lead.id}/tasks`);
    setTasks(r.data.data || []);
  };

  const deleteLead = async () => {
    if (!confirm('Excluir este lead?')) return;
    await api.delete(`/admin/leads/${lead.id}`);
    onChanged();
    onClose();
  };

  const iconFor = (t: string) => {
    const up = (t || '').toUpperCase();
    if (up === 'CALL') return <Phone size={14} />;
    if (up === 'EMAIL') return <Mail size={14} />;
    if (up === 'WHATSAPP') return <Phone size={14} />;
    if (up === 'MEETING') return <Calendar size={14} />;
    return <StickyNote size={14} />;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl">
        <div className="p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-lg text-gray-900">{form.name}</h3>
              <p className="text-sm text-gray-500">{form.companyName || form.company || '—'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={deleteLead} className="text-red-600 hover:bg-red-50 p-2 rounded"><Trash2 size={18} /></button>
              <button onClick={onClose} className="text-gray-500 hover:bg-gray-100 p-2 rounded"><X size={18} /></button>
            </div>
          </div>
          <div className="mt-3">
            <select value={form.stage} onChange={(e) => changeStage(e.target.value)} className="text-sm border border-gray-300 rounded px-3 py-1.5">
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex gap-1 mt-4 border-b border-gray-200 -mb-5">
            {[['info', 'Informações'], ['history', 'Histórico'], ['tasks', 'Tarefas']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-medium ${tab === k ? 'text-[#1E3A5F] border-b-2 border-[#1E3A5F]' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {tab === 'info' && (
            <div className="space-y-3">
              {[
                ['name', 'Nome', 'text'],
                ['phone', 'Telefone', 'tel'],
                ['email', 'Email', 'email'],
                ['companyName', 'Empresa', 'text'],
                ['estimatedValue', 'Valor estimado (R$)', 'number'],
                ['responsible', 'Responsável', 'text'],
                ['zoomLink', 'Link Zoom', 'text'],
                ['source', 'Origem', 'text'],
              ].map(([k, l, t]) => (
                <div key={k}>
                  <label className="text-xs text-gray-600">{l}</label>
                  <input type={t} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-600">Observações</label>
                <textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <button onClick={save} className="bg-[#1E3A5F] text-white px-4 py-2 rounded text-sm font-medium">Salvar</button>
            </div>
          )}

          {tab === 'history' && (
            <div>
              <div className="mb-4 flex gap-2">
                <select value={newActivity.type} onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                  {['NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={newActivity.content} onChange={(e) => setNewActivity({ ...newActivity, content: e.target.value })} placeholder="Anotação..." className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm" />
                <button onClick={addActivity} className="bg-[#1E3A5F] text-white px-3 py-1.5 rounded text-sm">Adicionar</button>
              </div>
              <div className="space-y-2">
                {activities.length === 0 && <p className="text-sm text-gray-400">Nenhuma atividade ainda</p>}
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-2 border-l-2 border-gray-200 pl-3 py-1">
                    <span className="text-gray-500 mt-1">{iconFor(a.type)}</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{a.content || a.description}</p>
                      <p className="text-xs text-gray-400">{format(new Date(a.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div>
              <div className="mb-4">
                {!showTaskForm ? (
                  <button onClick={() => setShowTaskForm(true)} className="text-sm text-[#1E3A5F] font-medium">+ Nova Tarefa</button>
                ) : (
                  <div className="space-y-2 bg-gray-50 p-3 rounded">
                    <select value={newTask.type} onChange={(e) => setNewTask({ ...newTask, type: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                      {['CALL', 'FOLLOWUP', 'PROPOSAL', 'MEETING', 'OTHER'].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="datetime-local" value={newTask.dueAt} onChange={(e) => setNewTask({ ...newTask, dueAt: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                    <input placeholder="Responsável" value={newTask.responsible} onChange={(e) => setNewTask({ ...newTask, responsible: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                    <div className="flex gap-2">
                      <button onClick={addTask} className="bg-[#1E3A5F] text-white px-3 py-1.5 rounded text-sm">Criar</button>
                      <button onClick={() => setShowTaskForm(false)} className="border border-gray-300 px-3 py-1.5 rounded text-sm">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {tasks.length === 0 && <p className="text-sm text-gray-400">Nenhuma tarefa</p>}
                {tasks.map((t) => {
                  const overdue = t.status === 'PENDING' && new Date(t.dueAt) < new Date();
                  return (
                    <div key={t.id} className={`flex items-center gap-3 p-3 rounded border ${overdue ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} ${t.status === 'DONE' ? 'opacity-50' : ''}`}>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{t.type}</p>
                        <p className="text-xs text-gray-500">{format(new Date(t.dueAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}{t.responsible ? ` • ${t.responsible}` : ''}</p>
                      </div>
                      {t.status === 'PENDING' && <button onClick={() => completeTask(t.id)} className="text-green-600 text-xs font-medium">Concluir</button>}
                      <button onClick={() => deleteTask(t.id)} className="text-red-500"><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CrmPage() {
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ byStage: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterResponsible, setFilterResponsible] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [activeDrag, setActiveDrag] = useState<any>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', companyName: '', source: 'manual', notes: '', estimatedValue: '', responsible: '' });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchData = useCallback(async () => {
    try {
      const params: any = { limit: 200 };
      if (search) params.search = search;
      if (filterResponsible) params.responsible = filterResponsible;
      if (filterStage) params.stage = filterStage;
      const [lr, sr] = await Promise.all([
        api.get('/admin/leads', { params }),
        api.get('/admin/leads/stats'),
      ]);
      setLeads(lr.data.data || []);
      setStats(sr.data.data || {});
    } finally {
      setLoading(false);
    }
  }, [search, filterResponsible, filterStage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pipeline = useMemo(() => {
    const p: Record<string, any[]> = {};
    for (const s of STAGES) p[s.key] = [];
    for (const l of leads) {
      if (p[l.stage]) p[l.stage].push(l);
    }
    return p;
  }, [leads]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: any = { ...form, estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null };
    await api.post('/admin/leads', body);
    setShowModal(false);
    setForm({ name: '', phone: '', email: '', companyName: '', source: 'manual', notes: '', estimatedValue: '', responsible: '' });
    fetchData();
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDrag(null);
    const leadId = e.active.id as string;
    const newStage = e.over?.id as string;
    if (!newStage) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === newStage) return;
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, stage: newStage } : l));
    try {
      await api.patch(`/admin/leads/${leadId}/stage`, { stage: newStage });
    } catch {
      fetchData();
    }
  };

  const totalValue = leads.reduce((acc, l) => acc + Number(l.estimatedValue || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leads / CRM</h2>
          <p className="text-gray-600 mt-1">Pipeline de vendas e gestão de leads</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={18} /> Novo lead
          </button>
        </div>
      </div>

      {/* Mini dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MiniCard icon={<Users size={20} />} label="Total" value={stats.total ?? leads.length} />
        <MiniCard icon={<TrendingUp size={20} />} label="Taxa de conversão" value={`${stats.conversionRate ?? 0}%`} />
        <MiniCard icon={<DollarSign size={20} />} label="Em negociação" value={fmtCurrency(stats.negotiationValue ?? 0)} />
        <MiniCard icon={<Target size={20} />} label="Ticket médio" value={fmtCurrency(stats.avgTicket ?? 0)} />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="border border-gray-300 rounded px-3 py-2 text-sm" />
        <input value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)} placeholder="Responsável" className="border border-gray-300 rounded px-3 py-2 text-sm" />
        <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">Todos estágios</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setView('kanban')} className={`p-2 rounded ${view === 'kanban' ? 'bg-[#1E3A5F] text-white' : 'border border-gray-300'}`}><LayoutGrid size={16} /></button>
          <button onClick={() => setView('list')} className={`p-2 rounded ${view === 'list' ? 'bg-[#1E3A5F] text-white' : 'border border-gray-300'}`}><List size={16} /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : view === 'kanban' ? (
        <DndContext sensors={sensors} onDragStart={(e) => setActiveDrag(leads.find((l) => l.id === e.active.id))} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3" style={{ minWidth: `${STAGES.length * 270}px` }}>
              {STAGES.map((s) => <StageColumn key={s.key} stage={s} leads={pipeline[s.key]} onOpen={setSelectedLead} />)}
            </div>
          </div>
          <DragOverlay>{activeDrag ? <LeadCard lead={activeDrag} onClick={() => {}} /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Telefone</th>
                <th className="px-4 py-3 text-left">Estágio</th>
                <th className="px-4 py-3 text-left">Valor</th>
                <th className="px-4 py-3 text-left">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedLead(l)}>
                  <td className="px-4 py-3 font-medium">{l.name}</td>
                  <td className="px-4 py-3 text-gray-600">{l.companyName || l.company || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{l.phone}</td>
                  <td className="px-4 py-3">{STAGES.find((s) => s.key === l.stage)?.label || l.stage}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtCurrency(l.estimatedValue)}</td>
                  <td className="px-4 py-3 text-gray-600">{l.responsible || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leads.length === 0 && <p className="text-center text-gray-400 py-8">Nenhum lead</p>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex justify-between mb-4"><h3 className="font-semibold">Novo lead</h3><button onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <form onSubmit={handleCreate} className="space-y-3">
              <input required placeholder="Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <input placeholder="Telefone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <input placeholder="Empresa" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <input placeholder="Valor estimado" type="number" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <input placeholder="Responsável" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <textarea placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" rows={3} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 py-2 rounded text-sm">Cancelar</button>
                <button type="submit" className="flex-1 bg-[#1E3A5F] text-white py-2 rounded text-sm">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedLead && <LeadSlideOver lead={selectedLead} onClose={() => setSelectedLead(null)} onChanged={() => { fetchData(); }} />}
    </div>
  );
}

function MiniCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">{icon}</div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
