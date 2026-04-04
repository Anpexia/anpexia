import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, Eye, Pencil, Trash2, Calendar, MessageSquare, Heart, Clock, Send, User, Activity, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';
import { isOftalmologia } from '../utils/segment';
import { useAuth } from '../hooks/useAuth';

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
  const { user } = useAuth();
  const tenant = user?.tenant;

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

  // Prontuario sub-sections state
  const [prontuarioSection, setProntuarioSection] = useState<string>('dados');

  // Anamnese state
  const [anamneseData, setAnamneseData] = useState<any>({});
  const [loadingAnamnese, setLoadingAnamnese] = useState(false);
  const [savingAnamnese, setSavingAnamnese] = useState(false);
  const [anamneseOpen, setAnamneseOpen] = useState<Record<string, boolean>>({ queixa: true, historiaOftalmo: false, historiaMedica: false, sintomas: false, habitos: false });

  // Evolucao state
  const [evolucoes, setEvolucoes] = useState<any[]>([]);
  const [loadingEvolucoes, setLoadingEvolucoes] = useState(false);
  const [showNewEvolucao, setShowNewEvolucao] = useState(false);
  const [evolucaoForm, setEvolucaoForm] = useState({ subjective: '', objective: '', assessment: '', plan: '', iop_od: '', iop_oe: '', acuity_od: '', acuity_oe: '', notes: '' });
  const [savingEvolucao, setSavingEvolucao] = useState(false);

  // Prescricoes state
  const [prescricoes, setPrescricoes] = useState<any[]>([]);
  const [loadingPrescricoes, setLoadingPrescricoes] = useState(false);
  const [showNewPrescricao, setShowNewPrescricao] = useState(false);
  const [prescricaoType, setPrescricaoType] = useState('MEDICAMENTO');
  const [prescricaoItems, setPrescricaoItems] = useState<any[]>([]);
  const [prescricaoOculos, setPrescricaoOculos] = useState({ od_esferico: '', od_cilindrico: '', od_eixo: '', od_adicao: '', od_dnp: '', oe_esferico: '', oe_cilindrico: '', oe_eixo: '', oe_adicao: '', oe_dnp: '', tipoLente: '', validade: '', observacoes: '' });
  const [savingPrescricao, setSavingPrescricao] = useState(false);

  // Atestados state
  const [atestados, setAtestados] = useState<any[]>([]);
  const [loadingAtestados, setLoadingAtestados] = useState(false);
  const [showNewAtestado, setShowNewAtestado] = useState(false);
  const [atestadoForm, setAtestadoForm] = useState({ type: 'ATESTADO', reason: '', daysOff: '', startDate: '', endDate: '', observations: '' });
  const [savingAtestado, setSavingAtestado] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

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

  // Toast helper
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  // Fetch anamnese
  const fetchAnamnese = async (patientId: string) => {
    setLoadingAnamnese(true);
    try {
      const { data } = await api.get(`/anamnesis/${patientId}`);
      setAnamneseData(data.data || {});
    } catch { setAnamneseData({}); }
    finally { setLoadingAnamnese(false); }
  };

  const handleSaveAnamnese = async () => {
    if (!selectedCustomer) return;
    setSavingAnamnese(true);
    try {
      await api.post(`/anamnesis/${selectedCustomer.id}`, { data: anamneseData });
      showToast('Anamnese salva com sucesso!');
    } catch { showToast('Erro ao salvar anamnese'); }
    finally { setSavingAnamnese(false); }
  };

  // Fetch evolucoes
  const fetchEvolucoes = async (patientId: string) => {
    setLoadingEvolucoes(true);
    try {
      const { data } = await api.get(`/patient-evolution/${patientId}`);
      setEvolucoes(data.data || []);
    } catch { setEvolucoes([]); }
    finally { setLoadingEvolucoes(false); }
  };

  const handleAddEvolucao = async () => {
    if (!selectedCustomer) return;
    setSavingEvolucao(true);
    try {
      await api.post(`/patient-evolution/${selectedCustomer.id}`, evolucaoForm);
      setEvolucaoForm({ subjective: '', objective: '', assessment: '', plan: '', iop_od: '', iop_oe: '', acuity_od: '', acuity_oe: '', notes: '' });
      setShowNewEvolucao(false);
      await fetchEvolucoes(selectedCustomer.id);
      showToast('Evolucao registrada!');
    } catch { showToast('Erro ao salvar evolucao'); }
    finally { setSavingEvolucao(false); }
  };

  // Fetch prescricoes
  const fetchPrescricoes = async (patientId: string) => {
    setLoadingPrescricoes(true);
    try {
      const { data } = await api.get(`/prescriptions`, { params: { patientId } });
      setPrescricoes(data.data || []);
    } catch { setPrescricoes([]); }
    finally { setLoadingPrescricoes(false); }
  };

  const handleAddPrescricao = async () => {
    if (!selectedCustomer) return;
    setSavingPrescricao(true);
    try {
      const body: any = { patientId: selectedCustomer.id, type: prescricaoType };
      if (prescricaoType === 'OCULOS') {
        body.oculosData = prescricaoOculos;
      } else {
        body.items = prescricaoItems;
      }
      await api.post(`/prescriptions`, body);
      setShowNewPrescricao(false);
      setPrescricaoItems([]);
      setPrescricaoOculos({ od_esferico: '', od_cilindrico: '', od_eixo: '', od_adicao: '', od_dnp: '', oe_esferico: '', oe_cilindrico: '', oe_eixo: '', oe_adicao: '', oe_dnp: '', tipoLente: '', validade: '', observacoes: '' });
      await fetchPrescricoes(selectedCustomer.id);
      showToast('Prescricao criada!');
    } catch { showToast('Erro ao criar prescricao'); }
    finally { setSavingPrescricao(false); }
  };

  const handleDownloadPdf = async (type: 'prescriptions' | 'medical-certificates', id: string) => {
    try {
      const { data } = await api.get(`/${type}/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type === 'prescriptions' ? 'prescricao' : 'atestado'}_${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { showToast('Erro ao baixar PDF'); }
  };

  // Fetch atestados
  const fetchAtestados = async (patientId: string) => {
    setLoadingAtestados(true);
    try {
      const { data } = await api.get(`/medical-certificates`, { params: { patientId } });
      setAtestados(data.data || []);
    } catch { setAtestados([]); }
    finally { setLoadingAtestados(false); }
  };

  const handleAddAtestado = async () => {
    if (!selectedCustomer) return;
    setSavingAtestado(true);
    try {
      await api.post(`/medical-certificates`, { ...atestadoForm, patientId: selectedCustomer.id, daysOff: atestadoForm.daysOff ? Number(atestadoForm.daysOff) : undefined });
      setShowNewAtestado(false);
      setAtestadoForm({ type: 'ATESTADO', reason: '', daysOff: '', startDate: '', endDate: '', observations: '' });
      await fetchAtestados(selectedCustomer.id);
      showToast('Atestado emitido!');
    } catch { showToast('Erro ao emitir atestado'); }
    finally { setSavingAtestado(false); }
  };

  // Load prontuario sub-section data when switching
  useEffect(() => {
    if (!selectedCustomer || detailTab !== 'prontuario') return;
    if (prontuarioSection === 'anamnese') fetchAnamnese(selectedCustomer.id);
    if (prontuarioSection === 'evolucao') fetchEvolucoes(selectedCustomer.id);
    if (prontuarioSection === 'prescricoes') fetchPrescricoes(selectedCustomer.id);
    if (prontuarioSection === 'atestados') fetchAtestados(selectedCustomer.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prontuarioSection, selectedCustomer?.id, detailTab]);

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
                <div className="space-y-4">
                  {/* Sub-navigation pills */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'dados', label: 'Dados Clinicos', show: true },
                      { key: 'anamnese', label: 'Anamnese', show: isOftalmologia(tenant) },
                      { key: 'evolucao', label: 'Evolucao', show: isOftalmologia(tenant) },
                      { key: 'prescricoes', label: 'Prescricoes', show: true },
                      { key: 'atestados', label: 'Atestados', show: true },
                    ].filter(t => t.show).map(t => (
                      <button key={t.key} onClick={() => setProntuarioSection(t.key)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${prontuarioSection === t.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* DADOS CLINICOS SECTION */}
                  {prontuarioSection === 'dados' && (
                    <div className="space-y-6">
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

                  {/* ANAMNESE SECTION */}
                  {prontuarioSection === 'anamnese' && (
                    <div className="space-y-3">
                      {loadingAnamnese ? (
                        <p className="text-sm text-slate-500 text-center py-8">Carregando anamnese...</p>
                      ) : (
                        <>
                          {/* Queixa Principal */}
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <button onClick={() => setAnamneseOpen({ ...anamneseOpen, queixa: !anamneseOpen.queixa })} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                              <span className="text-sm font-medium text-slate-800">Queixa Principal</span>
                              {anamneseOpen.queixa ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                            </button>
                            {anamneseOpen.queixa && (
                              <div className="p-4 space-y-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Queixa principal</label>
                                  <textarea value={anamneseData.queixaPrincipal || ''} onChange={(e) => setAnamneseData({ ...anamneseData, queixaPrincipal: e.target.value })} className={inputCls + ' h-20 resize-none'} placeholder="Descreva a queixa do paciente..." />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Tempo de inicio</label>
                                    <input type="text" value={anamneseData.tempoInicio || ''} onChange={(e) => setAnamneseData({ ...anamneseData, tempoInicio: e.target.value })} className={inputCls} placeholder="Ex: 3 meses" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Olho afetado</label>
                                    <select value={anamneseData.olhoAfetado || ''} onChange={(e) => setAnamneseData({ ...anamneseData, olhoAfetado: e.target.value })} className={inputCls}>
                                      <option value="">Selecione</option>
                                      <option value="Direito">Direito</option>
                                      <option value="Esquerdo">Esquerdo</option>
                                      <option value="Ambos">Ambos</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Historia Oftalmologica */}
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <button onClick={() => setAnamneseOpen({ ...anamneseOpen, historiaOftalmo: !anamneseOpen.historiaOftalmo })} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                              <span className="text-sm font-medium text-slate-800">Historia Oftalmologica</span>
                              {anamneseOpen.historiaOftalmo ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                            </button>
                            {anamneseOpen.historiaOftalmo && (
                              <div className="p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.usaOculos || false} onChange={(e) => setAnamneseData({ ...anamneseData, usaOculos: e.target.checked })} className="rounded" />
                                    Usa oculos
                                  </label>
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.usaLenteContato || false} onChange={(e) => setAnamneseData({ ...anamneseData, usaLenteContato: e.target.checked })} className="rounded" />
                                    Usa lente de contato
                                  </label>
                                </div>
                                {anamneseData.usaOculos && (
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Tempo de uso</label>
                                      <input type="text" value={anamneseData.tempoOculos || ''} onChange={(e) => setAnamneseData({ ...anamneseData, tempoOculos: e.target.value })} className={inputCls} placeholder="Ex: 5 anos" />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Grau atual</label>
                                      <input type="text" value={anamneseData.grauAtual || ''} onChange={(e) => setAnamneseData({ ...anamneseData, grauAtual: e.target.value })} className={inputCls} />
                                    </div>
                                  </div>
                                )}
                                {anamneseData.usaLenteContato && (
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de lente</label>
                                      <input type="text" value={anamneseData.tipoLente || ''} onChange={(e) => setAnamneseData({ ...anamneseData, tipoLente: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Tempo de uso</label>
                                      <input type="text" value={anamneseData.tempoLente || ''} onChange={(e) => setAnamneseData({ ...anamneseData, tempoLente: e.target.value })} className={inputCls} />
                                    </div>
                                  </div>
                                )}
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.cirurgiasAnteriores || false} onChange={(e) => setAnamneseData({ ...anamneseData, cirurgiasAnteriores: e.target.checked })} className="rounded" />
                                    Cirurgias anteriores
                                  </label>
                                  {anamneseData.cirurgiasAnteriores && (
                                    <textarea value={anamneseData.cirurgiasDetalhes || ''} onChange={(e) => setAnamneseData({ ...anamneseData, cirurgiasDetalhes: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Descreva as cirurgias..." />
                                  )}
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.traumaOcular || false} onChange={(e) => setAnamneseData({ ...anamneseData, traumaOcular: e.target.checked })} className="rounded" />
                                    Trauma ocular
                                  </label>
                                  {anamneseData.traumaOcular && (
                                    <textarea value={anamneseData.traumaDetalhes || ''} onChange={(e) => setAnamneseData({ ...anamneseData, traumaDetalhes: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Descreva o trauma..." />
                                  )}
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Ultima consulta oftalmologica</label>
                                  <input type="date" value={anamneseData.ultimaConsulta || ''} onChange={(e) => setAnamneseData({ ...anamneseData, ultimaConsulta: e.target.value })} className={inputCls} />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Historia Medica */}
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <button onClick={() => setAnamneseOpen({ ...anamneseOpen, historiaMedica: !anamneseOpen.historiaMedica })} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                              <span className="text-sm font-medium text-slate-800">Historia Medica</span>
                              {anamneseOpen.historiaMedica ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                            </button>
                            {anamneseOpen.historiaMedica && (
                              <div className="p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.diabetes || false} onChange={(e) => setAnamneseData({ ...anamneseData, diabetes: e.target.checked })} className="rounded" />
                                    Diabetes
                                  </label>
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.hipertensao || false} onChange={(e) => setAnamneseData({ ...anamneseData, hipertensao: e.target.checked })} className="rounded" />
                                    Hipertensao
                                  </label>
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.doencasAutoimunes || false} onChange={(e) => setAnamneseData({ ...anamneseData, doencasAutoimunes: e.target.checked })} className="rounded" />
                                    Doencas autoimunes
                                  </label>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Outras doencas</label>
                                  <input type="text" value={anamneseData.outrasDoencas || ''} onChange={(e) => setAnamneseData({ ...anamneseData, outrasDoencas: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Medicamentos em uso</label>
                                  <textarea value={anamneseData.medicamentos || ''} onChange={(e) => setAnamneseData({ ...anamneseData, medicamentos: e.target.value })} className={inputCls + ' h-16 resize-none'} />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Alergias</label>
                                  <textarea value={anamneseData.alergias || ''} onChange={(e) => setAnamneseData({ ...anamneseData, alergias: e.target.value })} className={inputCls + ' h-16 resize-none'} />
                                </div>
                                <p className="text-xs font-medium text-slate-600 mt-2">Historico familiar</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.familiarGlaucoma || false} onChange={(e) => setAnamneseData({ ...anamneseData, familiarGlaucoma: e.target.checked })} className="rounded" />
                                    Glaucoma
                                  </label>
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.familiarCatarata || false} onChange={(e) => setAnamneseData({ ...anamneseData, familiarCatarata: e.target.checked })} className="rounded" />
                                    Catarata
                                  </label>
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.familiarDMRI || false} onChange={(e) => setAnamneseData({ ...anamneseData, familiarDMRI: e.target.checked })} className="rounded" />
                                    DMRI
                                  </label>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Outras (familiar)</label>
                                  <input type="text" value={anamneseData.familiarOutras || ''} onChange={(e) => setAnamneseData({ ...anamneseData, familiarOutras: e.target.value })} className={inputCls} />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Sintomas Atuais */}
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <button onClick={() => setAnamneseOpen({ ...anamneseOpen, sintomas: !anamneseOpen.sintomas })} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                              <span className="text-sm font-medium text-slate-800">Sintomas Atuais</span>
                              {anamneseOpen.sintomas ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                            </button>
                            {anamneseOpen.sintomas && (
                              <div className="p-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                  {[
                                    { key: 'baixaVisao', label: 'Baixa visao' },
                                    { key: 'visaoEmbacada', label: 'Visao embacada' },
                                    { key: 'visaoDupla', label: 'Visao dupla' },
                                    { key: 'moscasVolantes', label: 'Moscas volantes' },
                                    { key: 'flashesLuz', label: 'Flashes de luz' },
                                    { key: 'dorOcular', label: 'Dor ocular' },
                                    { key: 'olhoVermelho', label: 'Olho vermelho' },
                                    { key: 'lacrimejamento', label: 'Lacrimejamento' },
                                    { key: 'fotofobia', label: 'Fotofobia' },
                                    { key: 'ardencia', label: 'Ardencia' },
                                    { key: 'coceira', label: 'Coceira' },
                                    { key: 'secrecao', label: 'Secrecao' },
                                  ].map(s => (
                                    <label key={s.key} className="flex items-center gap-2 text-sm text-slate-700">
                                      <input type="checkbox" checked={anamneseData[s.key] || false} onChange={(e) => setAnamneseData({ ...anamneseData, [s.key]: e.target.checked })} className="rounded" />
                                      {s.label}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Habitos */}
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <button onClick={() => setAnamneseOpen({ ...anamneseOpen, habitos: !anamneseOpen.habitos })} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                              <span className="text-sm font-medium text-slate-800">Habitos</span>
                              {anamneseOpen.habitos ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                            </button>
                            {anamneseOpen.habitos && (
                              <div className="p-4 space-y-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Tempo de tela diario (horas)</label>
                                  <input type="number" value={anamneseData.tempoTela || ''} onChange={(e) => setAnamneseData({ ...anamneseData, tempoTela: e.target.value })} className={inputCls} min="0" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.tabagismo || false} onChange={(e) => setAnamneseData({ ...anamneseData, tabagismo: e.target.checked })} className="rounded" />
                                    Tabagismo
                                  </label>
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={anamneseData.atividadeFisica || false} onChange={(e) => setAnamneseData({ ...anamneseData, atividadeFisica: e.target.checked })} className="rounded" />
                                    Atividade fisica
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>

                          <button onClick={handleSaveAnamnese} disabled={savingAnamnese} className="w-full py-2.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
                            {savingAnamnese ? 'Salvando...' : 'Salvar anamnese'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* EVOLUCAO SECTION */}
                  {prontuarioSection === 'evolucao' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-slate-800">Evolucoes</h4>
                        <button onClick={() => setShowNewEvolucao(!showNewEvolucao)} className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                          <Plus size={16} /> Nova Evolucao
                        </button>
                      </div>

                      {showNewEvolucao && (
                        <div className="p-4 border border-indigo-200 bg-indigo-50/50 rounded-lg space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Subjetivo</label>
                              <textarea value={evolucaoForm.subjective} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, subjective: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Queixas do paciente..." />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Objetivo</label>
                              <textarea value={evolucaoForm.objective} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, objective: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Achados do exame..." />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Avaliacao</label>
                              <textarea value={evolucaoForm.assessment} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, assessment: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Diagnostico/impressao..." />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Plano</label>
                              <textarea value={evolucaoForm.plan} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, plan: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Conduta..." />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">PIO OD</label>
                              <input type="text" value={evolucaoForm.iop_od} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, iop_od: e.target.value })} className={inputCls} placeholder="mmHg" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">PIO OE</label>
                              <input type="text" value={evolucaoForm.iop_oe} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, iop_oe: e.target.value })} className={inputCls} placeholder="mmHg" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Acuidade OD</label>
                              <input type="text" value={evolucaoForm.acuity_od} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, acuity_od: e.target.value })} className={inputCls} placeholder="20/20" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Acuidade OE</label>
                              <input type="text" value={evolucaoForm.acuity_oe} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, acuity_oe: e.target.value })} className={inputCls} placeholder="20/20" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes</label>
                            <textarea value={evolucaoForm.notes} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, notes: e.target.value })} className={inputCls + ' h-16 resize-none'} />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setShowNewEvolucao(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button type="button" onClick={handleAddEvolucao} disabled={savingEvolucao} className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                              {savingEvolucao ? 'Salvando...' : 'Registrar'}
                            </button>
                          </div>
                        </div>
                      )}

                      {loadingEvolucoes ? (
                        <p className="text-sm text-slate-500 text-center py-8">Carregando evolucoes...</p>
                      ) : evolucoes.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">Nenhuma evolucao registrada.</p>
                      ) : (
                        <div className="space-y-3">
                          {evolucoes.map((ev: any) => (
                            <div key={ev.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50/50 transition-colors">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-indigo-600">{format(new Date(ev.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                {ev.subjective && <div><span className="font-medium text-slate-600">S: </span><span className="text-slate-700">{ev.subjective}</span></div>}
                                {ev.objective && <div><span className="font-medium text-slate-600">O: </span><span className="text-slate-700">{ev.objective}</span></div>}
                                {ev.assessment && <div><span className="font-medium text-slate-600">A: </span><span className="text-slate-700">{ev.assessment}</span></div>}
                                {ev.plan && <div><span className="font-medium text-slate-600">P: </span><span className="text-slate-700">{ev.plan}</span></div>}
                              </div>
                              {(ev.iop_od || ev.iop_oe || ev.acuity_od || ev.acuity_oe) && (
                                <div className="flex gap-4 mt-2 text-xs text-slate-500">
                                  {ev.iop_od && <span>PIO OD: {ev.iop_od}</span>}
                                  {ev.iop_oe && <span>PIO OE: {ev.iop_oe}</span>}
                                  {ev.acuity_od && <span>AV OD: {ev.acuity_od}</span>}
                                  {ev.acuity_oe && <span>AV OE: {ev.acuity_oe}</span>}
                                </div>
                              )}
                              {ev.notes && <p className="text-xs text-slate-400 mt-1">{ev.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PRESCRICOES SECTION */}
                  {prontuarioSection === 'prescricoes' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-slate-800">Prescricoes</h4>
                        <button onClick={() => { setShowNewPrescricao(!showNewPrescricao); setPrescricaoType('MEDICAMENTO'); setPrescricaoItems([]); }} className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                          <Plus size={16} /> Nova Prescricao
                        </button>
                      </div>

                      {showNewPrescricao && (
                        <div className="p-4 border border-indigo-200 bg-indigo-50/50 rounded-lg space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                            <select value={prescricaoType} onChange={(e) => { setPrescricaoType(e.target.value); setPrescricaoItems([]); }} className={inputCls}>
                              <option value="MEDICAMENTO">Medicamento</option>
                              <option value="EXAME_EXTERNO">Exame Externo</option>
                              {isOftalmologia(tenant) && <option value="OCULOS">Oculos</option>}
                              {isOftalmologia(tenant) && <option value="EXAME_INTERNO">Exame Interno</option>}
                            </select>
                          </div>

                          {/* MEDICAMENTO form */}
                          {prescricaoType === 'MEDICAMENTO' && (
                            <div className="space-y-3">
                              {prescricaoItems.map((item: any, idx: number) => (
                                <div key={idx} className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-500">Medicamento {idx + 1}</span>
                                    <button type="button" onClick={() => setPrescricaoItems(prescricaoItems.filter((_: any, i: number) => i !== idx))} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="text" placeholder="Nome" value={item.name || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, name: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />
                                    <input type="text" placeholder="Dosagem" value={item.dosage || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, dosage: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />
                                    <input type="text" placeholder="Posologia" value={item.posologia || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, posologia: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />
                                    <input type="text" placeholder="Duracao" value={item.duration || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, duration: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />
                                    <input type="text" placeholder="Via" value={item.via || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, via: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />
                                  </div>
                                </div>
                              ))}
                              <button type="button" onClick={() => setPrescricaoItems([...prescricaoItems, { name: '', dosage: '', posologia: '', duration: '', via: '' }])} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">+ Adicionar medicamento</button>
                            </div>
                          )}

                          {/* EXAME_EXTERNO / EXAME_INTERNO form */}
                          {(prescricaoType === 'EXAME_EXTERNO' || prescricaoType === 'EXAME_INTERNO') && (
                            <div className="space-y-3">
                              {prescricaoItems.map((item: any, idx: number) => (
                                <div key={idx} className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-500">Exame {idx + 1}</span>
                                    <button type="button" onClick={() => setPrescricaoItems(prescricaoItems.filter((_: any, i: number) => i !== idx))} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="text" placeholder="Nome do exame" value={item.name || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, name: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />
                                    {prescricaoType === 'EXAME_EXTERNO' && <input type="text" placeholder="Especialidade" value={item.specialty || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, specialty: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />}
                                    <input type="text" placeholder="Indicacao" value={item.indication || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, indication: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />
                                    <select value={item.urgency || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, urgency: e.target.value }; setPrescricaoItems(updated); }} className={inputCls}>
                                      <option value="">Urgencia</option>
                                      <option value="normal">Normal</option>
                                      <option value="urgente">Urgente</option>
                                    </select>
                                  </div>
                                </div>
                              ))}
                              <button type="button" onClick={() => setPrescricaoItems([...prescricaoItems, { name: '', specialty: '', indication: '', urgency: '' }])} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">+ Adicionar exame</button>
                            </div>
                          )}

                          {/* OCULOS form */}
                          {prescricaoType === 'OCULOS' && (
                            <div className="space-y-3">
                              <p className="text-xs font-medium text-slate-600">Olho Direito (OD)</p>
                              <div className="grid grid-cols-5 gap-2">
                                <div><label className="block text-xs text-slate-500 mb-1">Esferico</label><input type="text" value={prescricaoOculos.od_esferico} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, od_esferico: e.target.value })} className={inputCls} /></div>
                                <div><label className="block text-xs text-slate-500 mb-1">Cilindrico</label><input type="text" value={prescricaoOculos.od_cilindrico} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, od_cilindrico: e.target.value })} className={inputCls} /></div>
                                <div><label className="block text-xs text-slate-500 mb-1">Eixo</label><input type="text" value={prescricaoOculos.od_eixo} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, od_eixo: e.target.value })} className={inputCls} /></div>
                                <div><label className="block text-xs text-slate-500 mb-1">Adicao</label><input type="text" value={prescricaoOculos.od_adicao} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, od_adicao: e.target.value })} className={inputCls} /></div>
                                <div><label className="block text-xs text-slate-500 mb-1">DNP</label><input type="text" value={prescricaoOculos.od_dnp} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, od_dnp: e.target.value })} className={inputCls} /></div>
                              </div>
                              <p className="text-xs font-medium text-slate-600">Olho Esquerdo (OE)</p>
                              <div className="grid grid-cols-5 gap-2">
                                <div><label className="block text-xs text-slate-500 mb-1">Esferico</label><input type="text" value={prescricaoOculos.oe_esferico} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, oe_esferico: e.target.value })} className={inputCls} /></div>
                                <div><label className="block text-xs text-slate-500 mb-1">Cilindrico</label><input type="text" value={prescricaoOculos.oe_cilindrico} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, oe_cilindrico: e.target.value })} className={inputCls} /></div>
                                <div><label className="block text-xs text-slate-500 mb-1">Eixo</label><input type="text" value={prescricaoOculos.oe_eixo} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, oe_eixo: e.target.value })} className={inputCls} /></div>
                                <div><label className="block text-xs text-slate-500 mb-1">Adicao</label><input type="text" value={prescricaoOculos.oe_adicao} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, oe_adicao: e.target.value })} className={inputCls} /></div>
                                <div><label className="block text-xs text-slate-500 mb-1">DNP</label><input type="text" value={prescricaoOculos.oe_dnp} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, oe_dnp: e.target.value })} className={inputCls} /></div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de lente</label>
                                  <input type="text" value={prescricaoOculos.tipoLente} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, tipoLente: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Validade</label>
                                  <input type="text" value={prescricaoOculos.validade} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, validade: e.target.value })} className={inputCls} placeholder="Ex: 1 ano" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes</label>
                                <textarea value={prescricaoOculos.observacoes} onChange={(e) => setPrescricaoOculos({ ...prescricaoOculos, observacoes: e.target.value })} className={inputCls + ' h-16 resize-none'} />
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <button type="button" onClick={() => setShowNewPrescricao(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button type="button" onClick={handleAddPrescricao} disabled={savingPrescricao} className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                              {savingPrescricao ? 'Salvando...' : 'Criar prescricao'}
                            </button>
                          </div>
                        </div>
                      )}

                      {loadingPrescricoes ? (
                        <p className="text-sm text-slate-500 text-center py-8">Carregando prescricoes...</p>
                      ) : prescricoes.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">Nenhuma prescricao registrada.</p>
                      ) : (
                        <div className="space-y-3">
                          {prescricoes.map((p: any) => {
                            const typeLabels: Record<string, { label: string; cls: string }> = {
                              MEDICAMENTO: { label: 'Medicamento', cls: 'bg-blue-100 text-blue-700' },
                              EXAME_EXTERNO: { label: 'Exame Externo', cls: 'bg-amber-100 text-amber-700' },
                              OCULOS: { label: 'Oculos', cls: 'bg-violet-100 text-violet-700' },
                              EXAME_INTERNO: { label: 'Exame Interno', cls: 'bg-emerald-100 text-emerald-700' },
                            };
                            const tl = typeLabels[p.type] || { label: p.type, cls: 'bg-gray-100 text-gray-600' };
                            return (
                              <div key={p.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${tl.cls}`}>{tl.label}</span>
                                    <span className="text-xs text-slate-400">{format(new Date(p.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</span>
                                  </div>
                                  <button onClick={() => handleDownloadPdf('prescriptions', p.id)} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium" title="Baixar PDF">
                                    <Download size={14} /> PDF
                                  </button>
                                </div>
                                {p.items && p.items.length > 0 && (
                                  <div className="text-sm text-slate-700">
                                    {p.items.map((item: any, i: number) => (
                                      <p key={i}>{item.name}{item.dosage ? ` - ${item.dosage}` : ''}{item.posologia ? ` (${item.posologia})` : ''}</p>
                                    ))}
                                  </div>
                                )}
                                {p.oculosData && <p className="text-sm text-slate-700">Receita de oculos - {p.oculosData.tipoLente || 'Tipo nao especificado'}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ATESTADOS SECTION */}
                  {prontuarioSection === 'atestados' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-slate-800">Atestados e Declaracoes</h4>
                        <button onClick={() => setShowNewAtestado(!showNewAtestado)} className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                          <Plus size={16} /> Emitir Atestado
                        </button>
                      </div>

                      {showNewAtestado && (
                        <div className="p-4 border border-indigo-200 bg-indigo-50/50 rounded-lg space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                              <select value={atestadoForm.type} onChange={(e) => setAtestadoForm({ ...atestadoForm, type: e.target.value })} className={inputCls}>
                                <option value="ATESTADO">Atestado</option>
                                <option value="DECLARACAO">Declaracao</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Dias de afastamento</label>
                              <input type="number" value={atestadoForm.daysOff} onChange={(e) => setAtestadoForm({ ...atestadoForm, daysOff: e.target.value })} className={inputCls} min="0" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Motivo</label>
                            <textarea value={atestadoForm.reason} onChange={(e) => setAtestadoForm({ ...atestadoForm, reason: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Motivo do atestado..." />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Data inicio</label>
                              <input type="date" value={atestadoForm.startDate} onChange={(e) => setAtestadoForm({ ...atestadoForm, startDate: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Data fim</label>
                              <input type="date" value={atestadoForm.endDate} onChange={(e) => setAtestadoForm({ ...atestadoForm, endDate: e.target.value })} className={inputCls} />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes</label>
                            <textarea value={atestadoForm.observations} onChange={(e) => setAtestadoForm({ ...atestadoForm, observations: e.target.value })} className={inputCls + ' h-16 resize-none'} />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setShowNewAtestado(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button type="button" onClick={handleAddAtestado} disabled={savingAtestado} className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                              {savingAtestado ? 'Emitindo...' : 'Emitir'}
                            </button>
                          </div>
                        </div>
                      )}

                      {loadingAtestados ? (
                        <p className="text-sm text-slate-500 text-center py-8">Carregando atestados...</p>
                      ) : atestados.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">Nenhum atestado emitido.</p>
                      ) : (
                        <div className="space-y-3">
                          {atestados.map((a: any) => {
                            const atTypes: Record<string, { label: string; cls: string }> = {
                              ATESTADO: { label: 'Atestado', cls: 'bg-blue-100 text-blue-700' },
                              DECLARACAO: { label: 'Declaracao', cls: 'bg-emerald-100 text-emerald-700' },
                            };
                            const at = atTypes[a.type] || { label: a.type, cls: 'bg-gray-100 text-gray-600' };
                            return (
                              <div key={a.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${at.cls}`}>{at.label}</span>
                                    <span className="text-xs text-slate-400">{format(new Date(a.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</span>
                                  </div>
                                  <button onClick={() => handleDownloadPdf('medical-certificates', a.id)} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium" title="Baixar PDF">
                                    <Download size={14} /> PDF
                                  </button>
                                </div>
                                <p className="text-sm text-slate-700">{a.reason}</p>
                                {a.daysOff && <p className="text-xs text-slate-500 mt-1">{a.daysOff} dia(s) de afastamento</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
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

      {/* Toast notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[60] bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
