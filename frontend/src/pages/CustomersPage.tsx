import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, Eye, Pencil, Trash2, Upload, ChevronRight, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import Papa from 'papaparse';
import api from '../services/api';
import { PatientPanel, type DetailTab } from '../components/PatientPanel';
import { useCepLookup, formatarCep } from '../hooks/useCepLookup';
import { maskPhone, whatsappIndicator } from '../utils/phone';

interface ScheduledCall {
  id: string;
  date: string;
  status: string;
  name: string;
  notes: string | null;
  duration: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  cellPhone: string | null;
  landlinePhone: string | null;
  email: string | null;
  cpfCnpj: string | null;
  birthDate: string | null;
  insurance: string | null;
  notes: string | null;
  origin: string | null;
  address: { cep?: string; street?: string; number?: string; neighborhood?: string; city?: string; state?: string } | null;
  optInWhatsApp: boolean;
  isActive: boolean;
  responsavelId?: string | null;
  parentesco?: string | null;
  usarTelResponsavel?: boolean;
  responsavel?: { id: string; name: string; phone: string | null } | null;
  dependentes?: Array<{ id: string; name: string; birthDate: string | null; parentesco: string | null }>;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  messagesSent?: Array<{ id: string; body: string; status: string; sentAt: string | null; createdAt: string }>;
  scheduledCalls?: ScheduledCall[];
  lastAppointment?: string | null;
  nextAppointment?: string | null;
  totalAppointments?: number;
  daysSinceLastContact?: number | null;
  whatsappStatus?: string;
  createdAt: string;
  updatedAt: string;
}

type ModalMode = 'closed' | 'create' | 'detail';

const emptyForm = { name: '', phone: '', cellPhone: '', landlinePhone: '', email: '', cpfCnpj: '', birthDate: '', insurance: '', notes: '', origin: '', optInWhatsApp: false, address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '' }, responsavelId: '', parentesco: '', usarTelResponsavel: false };

export function CustomersPage() {
  const { buscarCep, loading: cepLoading, erro: cepErro } = useCepLookup();
  const numberInputRef = useCallback((node: HTMLInputElement | null) => { if (node) node.dataset.numberInput = 'true'; }, []);

  const handleCepBlur = async (cepValue: string) => {
    const endereco = await buscarCep(cepValue);
    if (endereco) {
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          cep: formatarCep(cepValue),
          street: endereco.logradouro,
          neighborhood: endereco.bairro,
          city: endereco.localidade,
          state: endereco.uf,
        },
      }));
      // Focus number field after auto-fill
      const numInput = document.querySelector<HTMLInputElement>('input[data-number-input="true"]');
      if (numInput) numInput.focus();
    }
  };

  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');

  const [toastMsg, setToastMsg] = useState('');

  // Responsavel search
  const [respSearch, setRespSearch] = useState('');
  const [respResults, setRespResults] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);
  const [respSelected, setRespSelected] = useState<{ id: string; name: string; phone: string | null } | null>(null);

  // Import CSV state
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

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

  const openCreate = () => { setFormData(emptyForm); setSelectedCustomer(null); setRespSelected(null); setRespSearch(''); setRespResults([]); setModalMode('create'); };

  const searchResponsavel = async (q: string) => {
    setRespSearch(q);
    if (q.length < 2) { setRespResults([]); return; }
    try {
      const { data } = await api.get('/customers', { params: { search: q } });
      setRespResults((data.data || []).slice(0, 8).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })));
    } catch { setRespResults([]); }
  };

  const selectResponsavel = (r: { id: string; name: string; phone: string | null }) => {
    setRespSelected(r);
    setFormData(prev => ({ ...prev, responsavelId: r.id, usarTelResponsavel: true }));
    setRespSearch('');
    setRespResults([]);
  };

  const clearResponsavel = () => {
    setRespSelected(null);
    setFormData(prev => ({ ...prev, responsavelId: '', parentesco: '', usarTelResponsavel: false }));
  };

  const openDetail = (c: Customer, tab: DetailTab = 'info') => {
    setSelectedCustomer(c);
    setDetailTab(tab);
    setModalMode('detail');
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        ...formData,
        birthDate: formData.birthDate || undefined, cpfCnpj: formData.cpfCnpj || undefined,
        notes: formData.notes || undefined, origin: formData.origin || undefined,
        address: formData.address.cep || formData.address.street ? formData.address : undefined,
        responsavelId: formData.responsavelId || undefined,
        parentesco: formData.parentesco || undefined,
        usarTelResponsavel: formData.usarTelResponsavel || undefined,
      };
      await api.post('/customers', payload);
      setModalMode('closed'); setFormData(emptyForm); setRespSelected(null); fetchCustomers();
      showToast('Paciente criado com sucesso!');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Erro ao criar paciente. Tente novamente.';
      showToast(msg);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await api.delete(`/customers/${id}`); setDeleteConfirm(null); setModalMode('closed'); fetchCustomers(); showToast('Paciente removido.'); } catch (err: any) { showToast(err?.response?.data?.error?.message || 'Erro ao remover paciente.'); }
  };

  // Toast helper
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

  const IMPORT_FIELDS = [
    { key: '_skip', label: '— Ignorar —' },
    { key: 'name', label: 'Nome' },
    { key: 'cellPhone', label: 'Telefone Celular' },
    { key: 'landlinePhone', label: 'Telefone Fixo' },
    { key: 'phone', label: 'Telefone (classifica automático)' },
    { key: 'email', label: 'Email' },
    { key: 'cpfCnpj', label: 'CPF/CNPJ' },
    { key: 'birthDate', label: 'Data de Nascimento' },
    { key: 'insurance', label: 'Convênio' },
    { key: 'notes', label: 'Observações' },
    { key: 'origin', label: 'Origem' },
    { key: 'cep', label: 'CEP' },
    { key: 'street', label: 'Endereço' },
    { key: 'number', label: 'Número' },
    { key: 'neighborhood', label: 'Bairro' },
    { key: 'city', label: 'Cidade' },
    { key: 'state', label: 'Estado/UF' },
  ];

  const AUTO_MAP: Record<string, string> = {
    nome: 'name', name: 'name', 'nome completo': 'name', paciente: 'name',
    telefone: 'phone', phone: 'phone', fone: 'phone', tel: 'phone',
    celular: 'cellPhone', whatsapp: 'cellPhone', cel: 'cellPhone', movel: 'cellPhone', 'telefone celular': 'cellPhone',
    fixo: 'landlinePhone', 'telefone fixo': 'landlinePhone', residencial: 'landlinePhone',
    email: 'email', 'e-mail': 'email',
    cpf: 'cpfCnpj', cnpj: 'cpfCnpj', cpfcnpj: 'cpfCnpj', 'cpf/cnpj': 'cpfCnpj', documento: 'cpfCnpj',
    nascimento: 'birthDate', 'data de nascimento': 'birthDate', 'data nascimento': 'birthDate', birthdate: 'birthDate', 'dt nascimento': 'birthDate', 'dt nasc': 'birthDate',
    convenio: 'insurance', plano: 'insurance', insurance: 'insurance', 'plano de saude': 'insurance',
    observacoes: 'notes', notas: 'notes', notes: 'notes', obs: 'notes', observacao: 'notes',
    origem: 'origin', origin: 'origin',
    cep: 'cep', endereco: 'street', rua: 'street', street: 'street', logradouro: 'street',
    numero: 'number', number: 'number', num: 'number', 'nº': 'number',
    bairro: 'neighborhood', neighborhood: 'neighborhood',
    cidade: 'city', city: 'city', municipio: 'city',
    estado: 'state', uf: 'state', state: 'state',
  };

  const normalizePhone = (v: string) => {
    const digits = v.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) return '55' + digits;
    if (digits.length === 12 || digits.length === 13) return digits;
    return digits;
  };

  const normalizeCpf = (v: string) => v.replace(/\D/g, '');

  const normalizeDate = (v: string): string | null => {
    if (!v || !v.trim()) return null;
    const s = v.trim();
    // DD/MM/YYYY or DD-MM-YYYY
    const brMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (brMatch) return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
    // YYYY-MM-DD
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return null;
  };

  const handleFileParsed = (file: File) => {
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string || '').replace(/^﻿/, '');
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim() });
      if (!parsed.data || parsed.data.length === 0) return;
      const headers = parsed.meta.fields || [];
      setCsvHeaders(headers);
      setCsvRows(parsed.data as Record<string, string>[]);
      const mapping: Record<string, string> = {};
      for (const h of headers) {
        const key = h.toLowerCase().trim();
        mapping[h] = AUTO_MAP[key] || '_skip';
      }
      setColumnMapping(mapping);
      setImportStep('preview');
    };
    reader.readAsText(file, 'utf-8');
  };

  const getMappedPreviewRows = () => {
    return csvRows.slice(0, 5).map(row => {
      const mapped: Record<string, string> = {};
      for (const [csvCol, field] of Object.entries(columnMapping)) {
        if (field === '_skip' || !row[csvCol]) continue;
        let val = (row[csvCol] || '').trim();
        if (field === 'phone') val = normalizePhone(val);
        if (field === 'cpfCnpj') val = normalizeCpf(val);
        if (field === 'birthDate') val = normalizeDate(val) || val;
        mapped[field] = val;
      }
      return mapped;
    });
  };

  const handleImportConfirm = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const rows = csvRows.map(row => {
        const mapped: Record<string, any> = {};
        for (const [csvCol, field] of Object.entries(columnMapping)) {
          if (field === '_skip' || !row[csvCol]) continue;
          let val = (row[csvCol] || '').trim();
          if (!val) continue;
          if (field === 'phone') val = normalizePhone(val);
          if (field === 'cpfCnpj') val = normalizeCpf(val);
          if (field === 'birthDate') val = normalizeDate(val) || val;
          mapped[field] = val;
        }
        return mapped;
      }).filter(r => r.name);

      const { data } = await api.post('/customers/import-batch', { rows });
      setImportResult(data.data);
      setImportStep('result');
      fetchCustomers();
    } catch (err: any) {
      setImportResult({ imported: 0, skipped: 0, errors: [err.response?.data?.error?.message || 'Erro ao importar'] });
      setImportStep('result');
    } finally {
      setImporting(false);
    }
  };

  const mappedFieldCount = Object.values(columnMapping).filter(v => v !== '_skip').length;
  const hasNameMapped = Object.values(columnMapping).includes('name');

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pacientes</h2>
          <p className="text-slate-500 mt-1">Gerencie seus pacientes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowImport(true); setImportStep('upload'); setImportFile(null); setCsvHeaders([]); setCsvRows([]); setColumnMapping({}); setImportResult(null); }} className="flex items-center gap-2 border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            <Upload size={18} /> Importar CSV
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors">
            <Plus size={18} /> Novo paciente
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail..." className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent" />
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
              <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">Nenhum paciente cadastrado ainda.</td></tr>
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
                  <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">
                    {(() => {
                      const cell = c.cellPhone ? maskPhone(c.cellPhone) : '';
                      const land = c.landlinePhone ? maskPhone(c.landlinePhone) : '';
                      const ind = whatsappIndicator(c.cellPhone, c.landlinePhone);
                      if (!cell && !land) return <span className="text-slate-400">{c.phone ? maskPhone(c.phone) : '-'}</span>;
                      return (
                        <span title={ind.label}>
                          {cell && <span>{ind.icon} {cell}</span>}
                          {cell && land && <br />}
                          {land && <span className="text-slate-400">☎ {land}</span>}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">
                    {c.lastAppointment ? format(new Date(c.lastAppointment), 'dd/MM/yy') : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-6 py-4 text-sm hidden lg:table-cell">
                    {c.nextAppointment ? <span className="text-[#1E3A5F] font-medium">{format(new Date(c.nextAppointment), 'dd/MM/yy')}</span> : <span className="text-slate-400">-</span>}
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
            <h3 className="font-semibold text-slate-800 mb-2">Excluir paciente?</h3>
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
              <h3 className="font-semibold text-slate-800">Novo paciente</h3>
              <button onClick={() => setModalMode('closed')} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefone Celular <span className="text-[11px] text-slate-400">(WhatsApp)</span></label>
                  <input type="tel" value={formData.cellPhone} onChange={(e) => setFormData({ ...formData, cellPhone: maskPhone(e.target.value) })} className={inputCls} placeholder="(00) 00000-0000" maxLength={16} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefone Fixo</label>
                  <input type="tel" value={formData.landlinePhone} onChange={(e) => setFormData({ ...formData, landlinePhone: maskPhone(e.target.value) })} className={inputCls} placeholder="(00) 0000-0000" maxLength={15} />
                  {(() => { const ind = whatsappIndicator(formData.cellPhone, formData.landlinePhone); return <p className={`mt-1 text-xs ${ind.cls}`}>{ind.icon} {ind.label}</p>; })()}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data de nascimento{formData.birthDate && (() => { const b = new Date(formData.birthDate + 'T00:00:00'); const now = new Date(); let y = now.getFullYear() - b.getFullYear(); let m = now.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && now.getDate() < b.getDate())) { y--; m += 12; } if (now.getDate() < b.getDate()) m--; if (m < 0) m += 12; return y >= 2 ? <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">{y} anos</span> : <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">{y * 12 + m} meses</span>; })()}</label>
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

              {/* Responsavel / Dependente */}
              <div className="border-t border-slate-200 pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Responsavel (opcional)</label>
                {respSelected ? (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-blue-800">{respSelected.name}</span>
                    {respSelected.phone && <span className="text-xs text-blue-600">({respSelected.phone})</span>}
                    <button type="button" onClick={clearResponsavel} className="ml-auto text-blue-400 hover:text-blue-600"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={respSearch}
                      onChange={(e) => searchResponsavel(e.target.value)}
                      placeholder="Buscar paciente responsavel..."
                      className={inputCls}
                    />
                    {respResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {respResults.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => selectResponsavel(r)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-0"
                          >
                            <span className="font-medium">{r.name}</span>
                            {r.phone && <span className="text-slate-500 ml-2">({r.phone})</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {formData.responsavelId && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Parentesco</label>
                      <select value={formData.parentesco} onChange={(e) => setFormData({ ...formData, parentesco: e.target.value })} className={inputCls}>
                        <option value="">Selecione</option>
                        <option value="pai">Pai</option>
                        <option value="mae">Mae</option>
                        <option value="conjuge">Conjuge</option>
                        <option value="avo">Avo/Avo</option>
                        <option value="responsavel_legal">Responsavel Legal</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={formData.usarTelResponsavel} onChange={(e) => setFormData({ ...formData, usarTelResponsavel: e.target.checked })} className="rounded" />
                        Usar telefone do responsavel
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Endereco</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <input type="text" placeholder="00000-000" value={formData.address.cep} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, cep: formatarCep(e.target.value) } })} onBlur={(e) => handleCepBlur(e.target.value)} className={inputCls} maxLength={9} />
                    {cepLoading && <span className="text-xs text-slate-400 mt-1 block">Buscando endereco...</span>}
                    {cepErro && <span className="text-xs text-red-500 mt-1 block">{cepErro}</span>}
                  </div>
                  <input type="text" placeholder="Rua" value={formData.address.street} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} className={inputCls + ' col-span-2'} />
                  <input type="text" placeholder="Numero" value={formData.address.number} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, number: e.target.value } })} className={inputCls} ref={numberInputRef} />
                  <input type="text" placeholder="Bairro" value={formData.address.neighborhood} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, neighborhood: e.target.value } })} className={inputCls} />
                  <input type="text" placeholder="Cidade" value={formData.address.city} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })} className={inputCls} />
                  <input type="text" placeholder="UF" value={formData.address.state} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })} className={inputCls} maxLength={2} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Observacoes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={inputCls + ' h-20 resize-none'} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalMode('closed')} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">{saving ? 'Salvando...' : 'Criar paciente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient Detail Modal (PatientPanel) */}
      {modalMode === 'detail' && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl my-8">
            <PatientPanel
              customerId={selectedCustomer.id}
              onClose={() => setModalMode('closed')}
              initialTab={detailTab}
              onPatientUpdated={fetchCustomers}
            />
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className={`bg-white rounded-xl w-full p-6 ${importStep === 'preview' ? 'max-w-3xl' : 'max-w-md'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800">Importar Pacientes</h3>
                {importStep !== 'upload' && (
                  <span className="text-xs text-slate-400">
                    {importStep === 'preview' ? '— Conferir dados' : '— Resultado'}
                  </span>
                )}
              </div>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            {/* Step 1: Upload */}
            {importStep === 'upload' && (
              <>
                <div
                  className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-[#1E3A5F] transition-colors cursor-pointer"
                  onClick={() => document.getElementById('csv-file-input')?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#1E3A5F]', 'bg-blue-50'); }}
                  onDragLeave={e => { e.currentTarget.classList.remove('border-[#1E3A5F]', 'bg-blue-50'); }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#1E3A5F]', 'bg-blue-50'); const f = e.dataTransfer.files[0]; if (f) handleFileParsed(f); }}
                >
                  <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                  <p className="text-sm text-slate-600 font-medium">Clique ou arraste um arquivo CSV</p>
                  <p className="text-xs text-slate-400 mt-1">Maximo 5MB</p>
                  <input id="csv-file-input" type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileParsed(f); e.target.value = ''; }} />
                </div>
                <div className="mt-4 bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-600 mb-1">Colunas reconhecidas automaticamente:</p>
                  <p className="text-xs text-slate-500">Nome, Telefone, Email, CPF, Data de Nascimento, Convênio, Observações, Origem, CEP, Endereço, Número, Bairro, Cidade, Estado</p>
                  <p className="text-xs text-slate-400 mt-1">Você poderá ajustar o mapeamento antes de importar.</p>
                </div>
                <button onClick={() => setShowImport(false)} className="w-full mt-5 border border-slate-300 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              </>
            )}

            {/* Step 2: Preview + Mapping */}
            {importStep === 'preview' && (
              <>
                <div className="flex items-center gap-3 mb-4 text-sm text-slate-600">
                  <span className="bg-slate-100 px-2 py-1 rounded font-medium">{importFile?.name}</span>
                  <span>{csvRows.length} linha{csvRows.length !== 1 ? 's' : ''} encontrada{csvRows.length !== 1 ? 's' : ''}</span>
                  <span>•</span>
                  <span>{mappedFieldCount} coluna{mappedFieldCount !== 1 ? 's' : ''} mapeada{mappedFieldCount !== 1 ? 's' : ''}</span>
                </div>

                {!hasNameMapped && (
                  <div className="flex items-center gap-2 mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
                    <AlertTriangle size={14} />
                    <span>A coluna <strong>Nome</strong> é obrigatória. Mapeie pelo menos uma coluna para "Nome".</span>
                  </div>
                )}

                {/* Column Mapping */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Mapeamento de colunas</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                    {csvHeaders.map(h => (
                      <div key={h} className="flex flex-col">
                        <span className="text-xs text-slate-500 truncate mb-0.5" title={h}>{h}</span>
                        <select
                          value={columnMapping[h] || '_skip'}
                          onChange={e => setColumnMapping({ ...columnMapping, [h]: e.target.value })}
                          className={`text-xs border rounded px-2 py-1.5 ${columnMapping[h] === '_skip' ? 'border-slate-200 text-slate-400' : 'border-blue-300 text-blue-800 bg-blue-50'}`}
                        >
                          {IMPORT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                    <p className="text-xs font-medium text-slate-600">Preview (primeiras {Math.min(5, csvRows.length)} linhas já normalizadas)</p>
                  </div>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          {IMPORT_FIELDS.filter(f => f.key !== '_skip' && Object.values(columnMapping).includes(f.key)).map(f => (
                            <th key={f.key} className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap">{f.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {getMappedPreviewRows().map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            {IMPORT_FIELDS.filter(f => f.key !== '_skip' && Object.values(columnMapping).includes(f.key)).map(f => (
                              <td key={f.key} className={`px-3 py-2 whitespace-nowrap ${!row[f.key] && f.key === 'name' ? 'text-red-500 italic' : 'text-slate-700'}`}>
                                {row[f.key] || (f.key === 'name' ? 'vazio' : '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setImportStep('upload')} className="flex-1 border border-slate-300 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Voltar</button>
                  <button
                    onClick={handleImportConfirm}
                    disabled={!hasNameMapped || importing}
                    className="flex-1 bg-[#1E3A5F] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {importing ? 'Importando...' : <><span>Importar {csvRows.length} paciente{csvRows.length !== 1 ? 's' : ''}</span><ChevronRight size={16} /></>}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Result */}
            {importStep === 'result' && importResult && (
              <>
                <div className="text-center py-4">
                  <div className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3 ${importResult.imported > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    {importResult.imported > 0 ? (
                      <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <X size={28} className="text-red-600" />
                    )}
                  </div>
                  <p className="text-lg font-semibold text-slate-800">{importResult.imported} importado{importResult.imported !== 1 ? 's' : ''}</p>
                  {importResult.skipped > 0 && <p className="text-sm text-slate-500">{importResult.skipped} ignorado{importResult.skipped !== 1 ? 's' : ''}</p>}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="mt-3 max-h-32 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3">
                    {importResult.errors.slice(0, 20).map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
                    {importResult.errors.length > 20 && <p className="text-xs text-red-500 mt-1">...e mais {importResult.errors.length - 20} erros</p>}
                  </div>
                )}
                <button onClick={() => setShowImport(false)} className="w-full mt-5 bg-[#1E3A5F] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#2A4D7A]">Fechar</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[60] bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
