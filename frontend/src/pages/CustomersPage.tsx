import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, Eye, Pencil, Trash2, Calendar, MessageSquare, Heart, Clock, Send, User, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';

interface ScheduledCall {
  id: string;
  date: string;
  status: string;
  name: string;
  notes: string | null;
  duration: number;
}

interface MedicalEntry {
  id: string;
  authorName: string;
  type: string;
  content: string;
  createdAt: string;
}

interface MedicalRecord {
  id: string;
  bloodType: string | null;
  allergies: string | null;
  medications: string | null;
  chronicDiseases: string | null;
  clinicalNotes: string | null;
  entries: MedicalEntry[];
}

interface ChatMsg {
  id: string;
  phone: string;
  senderName: string;
  direction: 'INCOMING' | 'OUTGOING';
  body: string;
  metadata: any;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpfCnpj: string | null;
  birthDate: string | null;
  insurance: string | null;
  notes: string | null;
  origin: string | null;
  address: { cep?: string; street?: string; number?: string; neighborhood?: string; city?: string; state?: string } | null;
  optInWhatsApp: boolean;
  isActive: boolean;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  messagesSent?: Array<{ id: string; body: string; status: string; sentAt: string | null; createdAt: string }>;
  scheduledCalls?: ScheduledCall[];
  medicalRecord?: MedicalRecord | null;
  chatMessages?: ChatMsg[];
  lastAppointment?: string | null;
  nextAppointment?: string | null;
  totalAppointments?: number;
  daysSinceLastContact?: number | null;
  whatsappStatus?: string;
  createdAt: string;
  updatedAt: string;
}

type ModalMode = 'closed' | 'create' | 'detail';
type DetailTab = 'info' | 'prontuario' | 'appointments' | 'whatsapp';

const emptyForm = { name: '', phone: '', email: '', cpfCnpj: '', birthDate: '', insurance: '', notes: '', origin: '', optInWhatsApp: false, address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '' } };

const apptStatusMap: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Agendado', cls: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'Confirmado', cls: 'bg-green-100 text-green-700' },
  completed: { label: 'Realizado', cls: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
  no_show: { label: 'Faltou', cls: 'bg-amber-100 text-amber-700' },
};

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const entryTypeLabels: Record<string, { label: string; cls: string }> = {
  note: { label: 'Anotacao', cls: 'bg-blue-100 text-blue-700' },
  procedure: { label: 'Procedimento', cls: 'bg-emerald-100 text-emerald-700' },
  prescription: { label: 'Prescricao', cls: 'bg-violet-100 text-violet-700' },
  exam: { label: 'Exame', cls: 'bg-amber-100 text-amber-700' },
};

const msgStatusMap: Record<string, { label: string; cls: string }> = {
  SENT: { label: 'Enviada', cls: 'bg-green-100 text-green-700' },
  DELIVERED: { label: 'Entregue', cls: 'bg-emerald-100 text-emerald-700' },
  READ: { label: 'Lida', cls: 'bg-blue-100 text-blue-700' },
  FAILED: { label: 'Falhou', cls: 'bg-red-100 text-red-700' },
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-700' },
};

function populateForm(c: Customer) {
  return {
    name: c.name, phone: c.phone || '', email: c.email || '',
    cpfCnpj: c.cpfCnpj || '', birthDate: c.birthDate ? c.birthDate.split('T')[0] : '',
    insurance: c.insurance || '', notes: c.notes || '', origin: c.origin || '', optInWhatsApp: c.optInWhatsApp,
    address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', ...(c.address as any || {}) },
  };
}

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');

  // Medical record state
  const [medForm, setMedForm] = useState({ bloodType: '', allergies: '', medications: '', chronicDiseases: '', clinicalNotes: '' });
  const [savingMed, setSavingMed] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [entryForm, setEntryForm] = useState({ content: '', type: 'note' });
  const [savingEntry, setSavingEntry] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const { data } = await api.get('/customers', { params });
      setCustomers(data.data);
    } catch {} finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchCustomers, 300);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  const openCreate = () => { setFormData(emptyForm); setSelectedCustomer(null); setModalMode('create'); };

  const openDetail = async (c: Customer, tab: DetailTab = 'info') => {
    try {
      const { data } = await api.get(`/customers/${c.id}`);
      const cust = data.data;
      setSelectedCustomer(cust);
      setFormData(populateForm(cust));
      const mr = cust.medicalRecord;
      setMedForm({
        bloodType: mr?.bloodType || '', allergies: mr?.allergies || '',
        medications: mr?.medications || '', chronicDiseases: mr?.chronicDiseases || '',
        clinicalNotes: mr?.clinicalNotes || '',
      });
    } catch {
      setSelectedCustomer(c);
      setFormData(populateForm(c));
    }
    setDetailTab(tab);
    setShowNewEntry(false);
    setModalMode('detail');
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        birthDate: formData.birthDate || undefined, cpfCnpj: formData.cpfCnpj || undefined,
        insurance: formData.insurance || undefined, notes: formData.notes || undefined, origin: formData.origin || undefined,
        address: formData.address.cep || formData.address.street ? formData.address : undefined,
      };
      await api.put(`/customers/${selectedCustomer.id}`, payload);
      // Refresh customer data in modal
      const { data } = await api.get(`/customers/${selectedCustomer.id}`);
      setSelectedCustomer(data.data);
      setFormData(populateForm(data.data));
      fetchCustomers();
    } catch {} finally { setSaving(false); }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        birthDate: formData.birthDate || undefined, cpfCnpj: formData.cpfCnpj || undefined,
        notes: formData.notes || undefined, origin: formData.origin || undefined,
        address: formData.address.cep || formData.address.street ? formData.address : undefined,
      };
      await api.post('/customers', payload);
      setModalMode('closed'); setFormData(emptyForm); fetchCustomers();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await api.delete(`/customers/${id}`); setDeleteConfirm(null); setModalMode('closed'); fetchCustomers(); } catch {}
  };

  const handleSaveMedical = async () => {
    if (!selectedCustomer) return;
    setSavingMed(true);
    try {
      const { data } = await api.put(`/customers/${selectedCustomer.id}/medical-record`, medForm);
      setSelectedCustomer({ ...selectedCustomer, medicalRecord: data.data });
    } catch {} finally { setSavingMed(false); }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !entryForm.content.trim()) return;
    setSavingEntry(true);
    try {
      await api.post(`/customers/${selectedCustomer.id}/medical-entries`, entryForm);
      const { data } = await api.get(`/customers/${selectedCustomer.id}`);
      setSelectedCustomer(data.data);
      setEntryForm({ content: '', type: 'note' });
      setShowNewEntry(false);
    } catch {} finally { setSavingEntry(false); }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!selectedCustomer) return;
    try {
      await api.delete(`/customers/${selectedCustomer.id}/medical-entries/${entryId}`);
      const { data } = await api.get(`/customers/${selectedCustomer.id}`);
      setSelectedCustomer(data.data);
    } catch {}
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  // Compute summary from real scheduled calls
  const computeSummary = (c: Customer) => {
    const calls = c.scheduledCalls || [];
    const now = new Date();
    const past = calls.filter((a) => new Date(a.date) < now && a.status !== 'cancelled').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const future = calls.filter((a) => new Date(a.date) >= now && (a.status === 'scheduled' || a.status === 'confirmed')).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const completed = calls.filter((a) => a.status === 'completed');
    return {
      lastAppt: past[0]?.date || c.lastAppointment || null,
      nextAppt: future[0]?.date || c.nextAppointment || null,
      total: completed.length || c.totalAppointments || 0,
    };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Clientes</h2>
          <p className="text-slate-500 mt-1">Gerencie seus clientes e contatos</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Plus size={18} /> Novo cliente
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail..." className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Telefone</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Ultima consulta</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Proxima</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Consultas</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">Carregando...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">Nenhum cliente cadastrado ainda.</td></tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-blue-50/50 even:bg-slate-50/50 cursor-pointer" onClick={() => openDetail(c)}>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-800 font-medium">{c.name}</span>
                    {c.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {c.tags.slice(0, 2).map((t) => (
                          <span key={t.tag.id} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>{t.tag.name}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">{c.phone || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">
                    {c.lastAppointment ? format(new Date(c.lastAppointment), 'dd/MM/yy') : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-6 py-4 text-sm hidden lg:table-cell">
                    {c.nextAppointment ? <span className="text-indigo-600 font-medium">{format(new Date(c.nextAppointment), 'dd/MM/yy')}</span> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">{c.totalAppointments || 0}</td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openDetail(c)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Ver perfil"><Eye size={16} /></button>
                      <button onClick={() => openDetail(c, 'info')} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Editar"><Pencil size={16} /></button>
                      <button onClick={() => setDeleteConfirm(c.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600" title="Excluir"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-slate-800 mb-2">Excluir cliente?</h3>
            <p className="text-sm text-slate-500 mb-6">Esta acao nao pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {modalMode === 'create' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Novo cliente</h3>
              <button onClick={() => setModalMode('closed')} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputCls} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CPF/CNPJ</label>
                  <input type="text" value={formData.cpfCnpj} onChange={(e) => setFormData({ ...formData, cpfCnpj: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data de nascimento</label>
                  <input type="date" value={formData.birthDate} onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Origem</label>
                  <select value={formData.origin} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} className={inputCls}>
                    <option value="">Selecione</option>
                    <option value="indicacao">Indicacao</option>
                    <option value="redes_sociais">Redes sociais</option>
                    <option value="google">Google</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="presencial">Presencial</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mt-6">
                    <input type="checkbox" checked={formData.optInWhatsApp} onChange={(e) => setFormData({ ...formData, optInWhatsApp: e.target.checked })} className="rounded" />
                    Aceita WhatsApp
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Endereco</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <input type="text" placeholder="CEP" value={formData.address.cep} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, cep: e.target.value } })} className={inputCls} />
                  <input type="text" placeholder="Rua" value={formData.address.street} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} className={inputCls + ' col-span-2'} />
                  <input type="text" placeholder="Numero" value={formData.address.number} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, number: e.target.value } })} className={inputCls} />
                  <input type="text" placeholder="Bairro" value={formData.address.neighborhood} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, neighborhood: e.target.value } })} className={inputCls} />
                  <input type="text" placeholder="Cidade" value={formData.address.city} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })} className={inputCls} />
                  <input type="text" placeholder="Estado" value={formData.address.state} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })} className={inputCls} maxLength={2} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Observacoes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={inputCls + ' h-20 resize-none'} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalMode('closed')} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Salvando...' : 'Criar cliente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Detail Modal (view + edit all in one) */}
      {modalMode === 'detail' && selectedCustomer && (() => {
        const summary = computeSummary(selectedCustomer);
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-3xl my-8">
            {/* Header */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-slate-800 text-lg">{selectedCustomer.name}</h3>
                  <div className="flex gap-1 mt-1">
                    {selectedCustomer.tags?.map((t) => (
                      <span key={t.tag.id} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>{t.tag.name}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setModalMode('closed')} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Calendar size={16} className="mx-auto text-indigo-600 mb-1" />
                  <p className="text-xs text-slate-500">Proxima</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {summary.nextAppt ? format(new Date(summary.nextAppt), 'dd/MM') : '-'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Clock size={16} className="mx-auto text-slate-500 mb-1" />
                  <p className="text-xs text-slate-500">Ultima</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {summary.lastAppt ? format(new Date(summary.lastAppt), 'dd/MM') : '-'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Activity size={16} className="mx-auto text-emerald-600 mb-1" />
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-sm font-semibold text-slate-800">{summary.total}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <MessageSquare size={16} className="mx-auto text-green-600 mb-1" />
                  <p className="text-xs text-slate-500">WhatsApp</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {selectedCustomer.whatsappStatus === 'active' ? 'Ativo' : selectedCustomer.whatsappStatus === 'none' ? '-' : selectedCustomer.whatsappStatus || '-'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Send size={16} className="mx-auto text-amber-500 mb-1" />
                  <p className="text-xs text-slate-500">Ult. contato</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {selectedCustomer.daysSinceLastContact != null ? `${selectedCustomer.daysSinceLastContact}d` : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 border-b border-slate-200">
              {([
                { key: 'info', label: 'Informacoes', icon: User },
                { key: 'prontuario', label: 'Prontuario', icon: Heart },
                { key: 'appointments', label: 'Consultas', icon: Calendar },
                { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
              ] as const).map((tab) => (
                <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${detailTab === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  <tab.icon size={14} />{tab.label}
                  {tab.key === 'appointments' && selectedCustomer.scheduledCalls && selectedCustomer.scheduledCalls.length > 0 && (
                    <span className="bg-indigo-50 text-indigo-600 text-xs px-1.5 py-0.5 rounded">{selectedCustomer.scheduledCalls.length}</span>
                  )}
                  {tab.key === 'whatsapp' && selectedCustomer.chatMessages && selectedCustomer.chatMessages.length > 0 && (
                    <span className="bg-green-50 text-green-600 text-xs px-1.5 py-0.5 rounded">{selectedCustomer.chatMessages.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {/* INFO TAB — Editable form */}
              {detailTab === 'info' && (
                <form onSubmit={handleSaveInfo} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                      <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                      <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputCls} placeholder="(00) 00000-0000" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                      <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">CPF/CNPJ</label>
                      <input type="text" value={formData.cpfCnpj} onChange={(e) => setFormData({ ...formData, cpfCnpj: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Data de nascimento</label>
                      <input type="date" value={formData.birthDate} onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Convenio / Plano de Saude</label>
                      <input type="text" value={formData.insurance} onChange={(e) => setFormData({ ...formData, insurance: e.target.value })} placeholder="Particular ou nome do plano" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Origem</label>
                      <select value={formData.origin} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} className={inputCls}>
                        <option value="">Selecione</option>
                        <option value="indicacao">Indicacao</option>
                        <option value="redes_sociais">Redes sociais</option>
                        <option value="google">Google</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="presencial">Presencial</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mt-6">
                        <input type="checkbox" checked={formData.optInWhatsApp} onChange={(e) => setFormData({ ...formData, optInWhatsApp: e.target.checked })} className="rounded" />
                        Aceita WhatsApp
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Endereco</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <input type="text" placeholder="CEP" value={formData.address.cep} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, cep: e.target.value } })} className={inputCls} />
                      <input type="text" placeholder="Rua" value={formData.address.street} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} className={inputCls + ' col-span-2'} />
                      <input type="text" placeholder="Numero" value={formData.address.number} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, number: e.target.value } })} className={inputCls} />
                      <input type="text" placeholder="Bairro" value={formData.address.neighborhood} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, neighborhood: e.target.value } })} className={inputCls} />
                      <input type="text" placeholder="Cidade" value={formData.address.city} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })} className={inputCls} />
                      <input type="text" placeholder="Estado" value={formData.address.state} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })} className={inputCls} maxLength={2} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Observacoes</label>
                    <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={inputCls + ' h-20 resize-none'} />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-slate-400">Cadastrado em {format(new Date(selectedCustomer.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</p>
                    <button type="submit" disabled={saving} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                      {saving ? 'Salvando...' : 'Salvar alteracoes'}
                    </button>
                  </div>
                </form>
              )}

              {/* PRONTUARIO TAB */}
              {detailTab === 'prontuario' && (
                <div className="space-y-6">
                  {/* Clinical data form */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="font-medium text-slate-800 mb-3">Dados clinicos</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Tipo sanguineo</label>
                        <select value={medForm.bloodType} onChange={(e) => setMedForm({ ...medForm, bloodType: e.target.value })} className={inputCls}>
                          <option value="">Nao informado</option>
                          {bloodTypes.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Alergias</label>
                        <input type="text" value={medForm.allergies} onChange={(e) => setMedForm({ ...medForm, allergies: e.target.value })} className={inputCls} placeholder="Ex: Dipirona, Latex..." />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Medicamentos em uso</label>
                        <input type="text" value={medForm.medications} onChange={(e) => setMedForm({ ...medForm, medications: e.target.value })} className={inputCls} placeholder="Ex: Losartana 50mg..." />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Doencas cronicas</label>
                        <input type="text" value={medForm.chronicDiseases} onChange={(e) => setMedForm({ ...medForm, chronicDiseases: e.target.value })} className={inputCls} placeholder="Ex: Hipertensao, Diabetes..." />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes clinicas</label>
                        <textarea value={medForm.clinicalNotes} onChange={(e) => setMedForm({ ...medForm, clinicalNotes: e.target.value })} className={inputCls + ' h-20 resize-none'} placeholder="Anotacoes gerais do medico..." />
                      </div>
                    </div>
                    <button onClick={handleSaveMedical} disabled={savingMed} className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {savingMed ? 'Salvando...' : 'Salvar dados clinicos'}
                    </button>
                  </div>

                  {/* Entries timeline */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-slate-800">Historico de anotacoes</h4>
                      <button onClick={() => setShowNewEntry(!showNewEntry)} className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                        <Plus size={16} /> Nova anotacao
                      </button>
                    </div>

                    {showNewEntry && (
                      <form onSubmit={handleAddEntry} className="mb-4 p-4 border border-indigo-200 bg-indigo-50/50 rounded-lg">
                        <div className="flex gap-3 mb-3">
                          <select value={entryForm.type} onChange={(e) => setEntryForm({ ...entryForm, type: e.target.value })} className={inputCls + ' w-auto'}>
                            <option value="note">Anotacao</option>
                            <option value="procedure">Procedimento</option>
                            <option value="prescription">Prescricao</option>
                            <option value="exam">Exame</option>
                          </select>
                        </div>
                        <textarea value={entryForm.content} onChange={(e) => setEntryForm({ ...entryForm, content: e.target.value })} className={inputCls + ' h-24 resize-none mb-3'} placeholder="Descreva o procedimento, anotacao ou observacao..." required />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setShowNewEntry(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                          <button type="submit" disabled={savingEntry} className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                            {savingEntry ? 'Salvando...' : 'Adicionar'}
                          </button>
                        </div>
                      </form>
                    )}

                    {(!selectedCustomer.medicalRecord?.entries || selectedCustomer.medicalRecord.entries.length === 0) ? (
                      <p className="text-sm text-slate-500 text-center py-8">Nenhuma anotacao registrada. Clique em "Nova anotacao" para comecar.</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedCustomer.medicalRecord.entries.map((entry) => {
                          const et = entryTypeLabels[entry.type] || entryTypeLabels.note;
                          return (
                            <div key={entry.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50/50 transition-colors">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${et.cls}`}>{et.label}</span>
                                  <span className="text-xs text-slate-500">{entry.authorName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-400">{format(new Date(entry.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</span>
                                  <button onClick={() => handleDeleteEntry(entry.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"><X size={14} /></button>
                                </div>
                              </div>
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{entry.content}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* APPOINTMENTS TAB */}
              {detailTab === 'appointments' && (
                <div>
                  {!selectedCustomer.scheduledCalls || selectedCustomer.scheduledCalls.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">Nenhuma consulta registrada para este paciente.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedCustomer.scheduledCalls.map((a) => {
                        const st = apptStatusMap[a.status] || { label: a.status, cls: 'bg-gray-100 text-gray-600' };
                        const isPast = new Date(a.date) < new Date();
                        return (
                          <div key={a.id} className={`p-4 border rounded-lg transition-colors ${isPast ? 'border-slate-200 opacity-70' : 'border-indigo-200 bg-indigo-50/30'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="bg-indigo-50 rounded-lg p-2 text-center min-w-[50px]">
                                  <p className="text-xs text-indigo-600 font-medium">{format(new Date(a.date), 'MMM', { locale: ptBR }).toUpperCase()}</p>
                                  <p className="text-lg font-bold text-indigo-600">{format(new Date(a.date), 'dd')}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-slate-800">
                                    {format(new Date(a.date), "EEEE", { locale: ptBR })} - {format(new Date(a.date), 'HH:mm')}
                                  </p>
                                  <p className="text-xs text-slate-500">{a.duration} minutos</p>
                                  {a.notes && <p className="text-xs text-slate-400 mt-0.5">{a.notes}</p>}
                                </div>
                              </div>
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* WHATSAPP TAB */}
              {detailTab === 'whatsapp' && (
                <div>
                  {(!selectedCustomer.chatMessages || selectedCustomer.chatMessages.length === 0) && (!selectedCustomer.messagesSent || selectedCustomer.messagesSent.length === 0) ? (
                    <p className="text-sm text-slate-500 text-center py-8">Nenhuma mensagem registrada para este paciente.</p>
                  ) : (
                    <div className="space-y-6">
                      {selectedCustomer.chatMessages && selectedCustomer.chatMessages.length > 0 && (
                        <div>
                          <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                            <MessageSquare size={16} className="text-green-600" /> Conversas WhatsApp
                          </h4>
                          <div className="space-y-2 max-h-80 overflow-y-auto bg-slate-50 rounded-lg p-4">
                            {[...selectedCustomer.chatMessages].reverse().map((msg) => (
                              <div key={msg.id} className={`flex ${msg.direction === 'OUTGOING' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] rounded-lg p-3 ${msg.direction === 'OUTGOING' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                                  <p className={`text-xs mb-1 font-medium ${msg.direction === 'OUTGOING' ? 'text-indigo-200' : 'text-slate-500'}`}>
                                    {msg.direction === 'OUTGOING' ? 'Bot' : msg.senderName}
                                  </p>
                                  <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                                  {msg.metadata?.buttonResponseId && (
                                    <p className={`text-xs mt-1 italic ${msg.direction === 'OUTGOING' ? 'text-indigo-200' : 'text-slate-400'}`}>
                                      Botao: {msg.metadata.buttonResponseText || msg.metadata.buttonResponseId}
                                    </p>
                                  )}
                                  <p className={`text-xs mt-1 ${msg.direction === 'OUTGOING' ? 'text-indigo-300' : 'text-slate-400'}`}>
                                    {format(new Date(msg.createdAt), 'dd/MM HH:mm')}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedCustomer.messagesSent && selectedCustomer.messagesSent.length > 0 && (
                        <div>
                          <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                            <Send size={16} className="text-indigo-600" /> Mensagens enviadas
                          </h4>
                          <div className="space-y-2">
                            {selectedCustomer.messagesSent.map((m) => {
                              const st = msgStatusMap[m.status] || { label: m.status, cls: 'bg-gray-100 text-gray-600' };
                              return (
                                <div key={m.id} className="p-3 border border-slate-200 rounded-lg">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                                    <span className="text-xs text-slate-400">{m.sentAt ? format(new Date(m.sentAt), 'dd/MM HH:mm') : format(new Date(m.createdAt), 'dd/MM HH:mm')}</span>
                                  </div>
                                  <p className="text-sm text-slate-700">{m.body}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
