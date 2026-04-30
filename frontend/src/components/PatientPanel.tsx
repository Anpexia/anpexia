import { useState, useEffect, useCallback } from 'react';
import { X, Calendar, MessageSquare, Heart, Clock, Send, User, Activity, Download, FileText, Shield, Upload, Plus, Trash2, Paperclip, File } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { DictationTextarea } from './DictationTextarea';
import { CidAutocomplete } from './CidAutocomplete';
import { useCepLookup, formatarCep } from '../hooks/useCepLookup';
import { getSegmentConfig } from '../config/segmentConfig';

// ==================== Interfaces ====================

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
  lastAppointment?: string | null;
  nextAppointment?: string | null;
  totalAppointments?: number;
  daysSinceLastContact?: number | null;
  whatsappStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export type DetailTab = 'info' | 'prontuario' | 'prescricoes' | 'atestados' | 'appointments' | 'documentos';

// ==================== Constants ====================

const apptStatusMap: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Agendado', cls: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'Confirmado', cls: 'bg-green-100 text-green-700' },
  present: { label: 'Presente', cls: 'bg-purple-100 text-purple-700' },
  in_attendance: { label: 'Em atendimento', cls: 'bg-emerald-100 text-emerald-700' },
  attended: { label: 'Atendido', cls: 'bg-emerald-100 text-emerald-700' },
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

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

function populateForm(c: Customer) {
  return {
    name: c.name, phone: c.phone || '', email: c.email || '',
    cpfCnpj: c.cpfCnpj || '', birthDate: c.birthDate ? c.birthDate.split('T')[0] : '',
    insurance: c.insurance || '', notes: c.notes || '', origin: c.origin || '', optInWhatsApp: c.optInWhatsApp,
    address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', ...(c.address as any || {}) },
  };
}

function computeSummary(c: Customer) {
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
}

// ==================== Props ====================

export interface PatientPanelProps {
  customerId: string;
  onClose?: () => void;
  initialTab?: DetailTab;
  /** Called after patient info is saved, so parent can refresh its own data */
  onPatientUpdated?: () => void;
}

// ==================== Component ====================

export function PatientPanel({ customerId, onClose, initialTab = 'prontuario', onPatientUpdated }: PatientPanelProps) {
  const { user } = useAuth();
  const { buscarCep, loading: cepLoading, erro: cepErro } = useCepLookup();
  const numberInputRef = useCallback((node: HTMLInputElement | null) => { if (node) node.dataset.numberInput = 'true'; }, []);

  // ==================== State ====================

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', cpfCnpj: '', birthDate: '', insurance: '', notes: '', origin: '', optInWhatsApp: false, address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '' } });
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>(initialTab);

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

  // Evolucao state
  const [evolucoes, setEvolucoes] = useState<any[]>([]);
  const [loadingEvolucoes, setLoadingEvolucoes] = useState(false);
  const [showNewEvolucao, setShowNewEvolucao] = useState(false);
  const [evolucaoForm, setEvolucaoForm] = useState<Record<string, string>>({ subjective: '', objective: '', exams: '', returnDate: '' });
  const [savingEvolucao, setSavingEvolucao] = useState(false);

  // Prescricoes state
  const [prescricoes, setPrescricoes] = useState<any[]>([]);
  const [loadingPrescricoes, setLoadingPrescricoes] = useState(false);
  const [showNewPrescricao, setShowNewPrescricao] = useState(false);
  const [prescricaoType, setPrescricaoType] = useState('MEDICAMENTO');
  const [prescricaoItems, setPrescricaoItems] = useState<any[]>([]);
  const [prescricaoOculos, setPrescricaoOculos] = useState({ od_esferico: '', od_cilindrico: '', od_eixo: '', od_adicao: '', od_dnp: '', oe_esferico: '', oe_cilindrico: '', oe_eixo: '', oe_adicao: '', oe_dnp: '', tipoLente: '', validade: '', observacoes: '' });
  const [savingPrescricao, setSavingPrescricao] = useState(false);

  // Exam types for autocomplete
  const [examTypesList, setExamTypesList] = useState<{ id: string; name: string; category: string; ativo: boolean }[]>([]);

  // Atestados state
  const [atestados, setAtestados] = useState<any[]>([]);
  const [loadingAtestados, setLoadingAtestados] = useState(false);
  const [showNewAtestado, setShowNewAtestado] = useState(false);
  const [atestadoForm, setAtestadoForm] = useState({ type: 'ATESTADO', reason: '', cid: '', daysOff: '', startDate: '', endDate: '', observations: '' });
  const [savingAtestado, setSavingAtestado] = useState(false);

  // Documents state
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docCategory, setDocCategory] = useState('OUTRO');
  const [docDescription, setDocDescription] = useState('');

  // Convenio state
  const [conveniosList, setConveniosList] = useState<any[]>([]);
  const [, setPatientConvenio] = useState<any>(null);
  const [convenioForm, setConvenioForm] = useState({ convenioId: '', numeroCarteirinha: '', validade: '', titular: 'PROPRIO', nomeTitular: '' });
  const [savingConvenio, setSavingConvenio] = useState(false);

  const [toastMsg, setToastMsg] = useState('');

  // ==================== Data Loading ====================

  // Load customer data on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingCustomer(true);
    (async () => {
      try {
        const { data } = await api.get(`/customers/${customerId}`);
        if (cancelled) return;
        const cust = data.data;
        setCustomer(cust);
        setFormData(populateForm(cust));
        const mr = cust.medicalRecord;
        setMedForm({
          bloodType: mr?.bloodType || '', allergies: mr?.allergies || '',
          medications: mr?.medications || '', chronicDiseases: mr?.chronicDiseases || '',
          clinicalNotes: mr?.clinicalNotes || '',
        });
      } catch {
        // If detailed fetch fails, leave customer null
      } finally {
        if (!cancelled) setLoadingCustomer(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  // Fetch patient convenio after customer loaded
  useEffect(() => {
    if (!customer) return;
    api.get(`/convenios/patients/${customer.id}`).then(({ data }) => {
      const pc = data.data;
      setPatientConvenio(pc);
      if (pc) {
        setConvenioForm({
          convenioId: pc.convenioId || pc.convenio?.id || '',
          numeroCarteirinha: pc.numeroCarteirinha || '',
          validade: pc.validade ? pc.validade.split('T')[0] : '',
          titular: pc.titular || 'PROPRIO',
          nomeTitular: pc.nomeTitular || '',
        });
      } else {
        setConvenioForm({ convenioId: '', numeroCarteirinha: '', validade: '', titular: 'PROPRIO', nomeTitular: '' });
      }
    }).catch(() => {
      setPatientConvenio(null);
      setConvenioForm({ convenioId: '', numeroCarteirinha: '', validade: '', titular: 'PROPRIO', nomeTitular: '' });
    });
  }, [customer?.id]);

  // Fetch exam types for autocomplete
  useEffect(() => {
    api.get('/exam-types', { params: { segment: user?.tenant?.segment } }).then(({ data }) => setExamTypesList(data.data || [])).catch(() => {});
  }, [user?.tenant?.segment]);

  // Fetch convenios list for dropdown
  useEffect(() => {
    api.get('/convenios').then(({ data }) => {
      const ativos = (data.data || []).filter((c: any) => c.ativo);
      ativos.sort((a: any, b: any) => a.nome === 'Particular' ? -1 : b.nome === 'Particular' ? 1 : a.nome.localeCompare(b.nome));
      setConveniosList(ativos);
    }).catch(() => {});
  }, []);

  // Load prontuario sub-section data when switching
  useEffect(() => {
    if (!customer || detailTab !== 'prontuario') return;
    if (prontuarioSection === 'anamnese') fetchAnamnese(customer.id);
    if (prontuarioSection === 'evolucao') fetchEvolucoes(customer.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prontuarioSection, customer?.id, detailTab]);

  // Load prescricoes/atestados/documents when switching to their tabs
  useEffect(() => {
    if (!customer) return;
    if (detailTab === 'prescricoes') fetchPrescricoes(customer.id);
    if (detailTab === 'atestados') fetchAtestados(customer.id);
    if (detailTab === 'documentos') fetchDocuments(customer.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, detailTab]);

  // ==================== Handlers ====================

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
      const numInput = document.querySelector<HTMLInputElement>('input[data-number-input="true"]');
      if (numInput) numInput.focus();
    }
  };

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  const refreshCustomer = async () => {
    try {
      const { data } = await api.get(`/customers/${customerId}`);
      setCustomer(data.data);
      setFormData(populateForm(data.data));
    } catch {}
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        birthDate: formData.birthDate || undefined, cpfCnpj: formData.cpfCnpj || undefined,
        insurance: formData.insurance || undefined, notes: formData.notes || undefined, origin: formData.origin || undefined,
        address: formData.address.cep || formData.address.street ? formData.address : undefined,
      };
      await api.put(`/customers/${customer.id}`, payload);
      await refreshCustomer();
      onPatientUpdated?.();
      showToast('Dados salvos com sucesso!');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Erro ao salvar dados. Tente novamente.';
      showToast(msg);
    } finally { setSaving(false); }
  };

  const handleSaveMedical = async () => {
    if (!customer) return;
    setSavingMed(true);
    try {
      const { data } = await api.put(`/customers/${customer.id}/medical-record`, medForm);
      setCustomer({ ...customer, medicalRecord: data.data });
      showToast('Prontuario salvo!');
    } catch (err: any) { showToast(err?.response?.data?.error?.message || 'Erro ao salvar prontuario.'); } finally { setSavingMed(false); }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !entryForm.content.trim()) return;
    setSavingEntry(true);
    try {
      await api.post(`/customers/${customer.id}/medical-entries`, entryForm);
      const { data } = await api.get(`/customers/${customer.id}`);
      setCustomer(data.data);
      setEntryForm({ content: '', type: 'note' });
      setShowNewEntry(false);
    } catch {} finally { setSavingEntry(false); }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!customer) return;
    try {
      await api.delete(`/customers/${customer.id}/medical-entries/${entryId}`);
      const { data } = await api.get(`/customers/${customer.id}`);
      setCustomer(data.data);
    } catch {}
  };

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
    if (!customer) return;
    setSavingAnamnese(true);
    try {
      await api.post(`/anamnesis/${customer.id}`, { data: anamneseData });
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
    if (!customer) return;
    setSavingEvolucao(true);
    try {
      await api.post(`/patient-evolution/${customer.id}`, evolucaoForm);
      setEvolucaoForm({});
      setShowNewEvolucao(false);
      await fetchEvolucoes(customer.id);
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
    if (!customer) return;
    setSavingPrescricao(true);
    try {
      const body: any = { patientId: customer.id, type: prescricaoType };
      if (prescricaoType === 'OCULOS') {
        body.oculosData = prescricaoOculos;
      } else {
        body.items = prescricaoItems;
      }
      await api.post(`/prescriptions`, body);
      setShowNewPrescricao(false);
      setPrescricaoItems([]);
      setPrescricaoOculos({ od_esferico: '', od_cilindrico: '', od_eixo: '', od_adicao: '', od_dnp: '', oe_esferico: '', oe_cilindrico: '', oe_eixo: '', oe_adicao: '', oe_dnp: '', tipoLente: '', validade: '', observacoes: '' });
      await fetchPrescricoes(customer.id);
      showToast('Prescricao criada!');
    } catch { showToast('Erro ao criar prescricao'); }
    finally { setSavingPrescricao(false); }
  };

  const handleDeletePrescricao = async (id: string) => {
    if (!customer) return;
    try {
      await api.delete(`/prescriptions/${id}`);
      await fetchPrescricoes(customer.id);
      showToast('Prescricao excluida!');
    } catch { showToast('Erro ao excluir prescricao'); }
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
    if (!customer) return;
    setSavingAtestado(true);
    try {
      await api.post(`/medical-certificates`, { ...atestadoForm, patientId: customer.id, daysOff: atestadoForm.daysOff ? Number(atestadoForm.daysOff) : undefined });
      setShowNewAtestado(false);
      setAtestadoForm({ type: 'ATESTADO', reason: '', cid: '', daysOff: '', startDate: '', endDate: '', observations: '' });
      await fetchAtestados(customer.id);
      showToast('Atestado emitido!');
    } catch { showToast('Erro ao emitir atestado'); }
    finally { setSavingAtestado(false); }
  };

  // Document handlers
  const fetchDocuments = async (patientId: string) => {
    setLoadingDocs(true);
    try {
      const { data } = await api.get(`/customers/${patientId}/documents`);
      setDocuments(data.data || []);
    } catch { setDocuments([]); }
    finally { setLoadingDocs(false); }
  };

  const handleUploadDoc = async (file: File) => {
    if (!customer) return;
    if (file.size > 4 * 1024 * 1024) { showToast('Arquivo muito grande (max 4MB)'); return; }
    setUploadingDoc(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.post(`/customers/${customer.id}/documents`, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: base64,
        category: docCategory,
        description: docDescription || undefined,
      });
      setDocDescription('');
      setDocCategory('OUTRO');
      await fetchDocuments(customer.id);
      showToast('Documento salvo!');
    } catch { showToast('Erro ao enviar documento'); }
    finally { setUploadingDoc(false); }
  };

  const handleDownloadDoc = async (docId: string) => {
    if (!customer) return;
    try {
      const { data } = await api.get(`/customers/${customer.id}/documents/${docId}`);
      const doc = data.data;
      const byteChars = atob(doc.fileData);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: doc.fileType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Erro ao baixar documento'); }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!customer) return;
    try {
      await api.delete(`/customers/${customer.id}/documents/${docId}`);
      await fetchDocuments(customer.id);
      showToast('Documento removido');
    } catch { showToast('Erro ao remover documento'); }
  };

  // Convenio handlers
  const handleSaveConvenio = async () => {
    if (!customer || !convenioForm.convenioId) {
      showToast('Selecione o convenio');
      return;
    }
    setSavingConvenio(true);
    try {
      const { data } = await api.post(`/convenios/patients/${customer.id}`, convenioForm);
      setPatientConvenio(data.data);
      showToast('Convenio salvo!');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao salvar convenio');
    } finally { setSavingConvenio(false); }
  };

  // ==================== Render ====================

  if (loadingCustomer) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500">Carregando paciente...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-red-500">Erro ao carregar dados do paciente.</p>
      </div>
    );
  }

  const summary = computeSummary(customer);

  return (
    <div className="bg-white rounded-xl w-full">
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-800 text-lg">{customer.name}</h3>
            <div className="flex gap-1 mt-1">
              {customer.tags?.map((t) => (
                <span key={t.tag.id} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>{t.tag.name}</span>
              ))}
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <Calendar size={16} className="mx-auto text-[#1E3A5F] mb-1" />
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
              {customer.whatsappStatus === 'active' ? 'Ativo' : customer.whatsappStatus === 'none' ? '-' : customer.whatsappStatus || '-'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <Send size={16} className="mx-auto text-amber-500 mb-1" />
            <p className="text-xs text-slate-500">Ult. contato</p>
            <p className="text-sm font-semibold text-slate-800">
              {customer.daysSinceLastContact != null ? `${customer.daysSinceLastContact}d` : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 border-b border-slate-200 overflow-x-auto">
        {([
          { key: 'info', label: 'Informacoes', icon: User },
          { key: 'prontuario', label: 'Prontuario', icon: Heart },
          { key: 'prescricoes', label: 'Prescricoes', icon: FileText },
          { key: 'atestados', label: 'Atestados', icon: FileText },
          { key: 'documentos', label: 'Documentos', icon: Paperclip },
          { key: 'appointments', label: 'Consultas', icon: Calendar },
        ] as const).map((tab) => (
          <button key={tab.key} onClick={() => setDetailTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${detailTab === tab.key ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <tab.icon size={14} />{tab.label}
            {tab.key === 'prescricoes' && prescricoes.length > 0 && (
              <span className="bg-blue-50 text-blue-600 text-xs px-1.5 py-0.5 rounded">{prescricoes.length}</span>
            )}
            {tab.key === 'atestados' && atestados.length > 0 && (
              <span className="bg-emerald-50 text-emerald-600 text-xs px-1.5 py-0.5 rounded">{atestados.length}</span>
            )}
            {tab.key === 'documentos' && documents.length > 0 && (
              <span className="bg-amber-50 text-amber-600 text-xs px-1.5 py-0.5 rounded">{documents.length}</span>
            )}
            {tab.key === 'appointments' && customer.scheduledCalls && customer.scheduledCalls.length > 0 && (
              <span className="bg-[#EFF6FF] text-[#1E3A5F] text-xs px-1.5 py-0.5 rounded">{customer.scheduledCalls.length}</span>
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
            {/* Convenio Section */}
            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Shield size={16} className="text-blue-500" /> Convenio / Plano de Saude
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Convenio</label>
                  <select value={convenioForm.convenioId} onChange={e => setConvenioForm({ ...convenioForm, convenioId: e.target.value })} className={inputCls}>
                    <option value="">Selecione</option>
                    {conveniosList.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Numero da carteirinha</label>
                  <input type="text" value={convenioForm.numeroCarteirinha} onChange={e => setConvenioForm({ ...convenioForm, numeroCarteirinha: e.target.value })} className={inputCls} placeholder="000000000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Validade</label>
                  <input type="date" value={convenioForm.validade} onChange={e => setConvenioForm({ ...convenioForm, validade: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Titular</label>
                  <div className="flex gap-3 mt-1">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="radio" name="titular" checked={convenioForm.titular === 'PROPRIO'} onChange={() => setConvenioForm({ ...convenioForm, titular: 'PROPRIO', nomeTitular: '' })} />
                      Proprio
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="radio" name="titular" checked={convenioForm.titular === 'DEPENDENTE'} onChange={() => setConvenioForm({ ...convenioForm, titular: 'DEPENDENTE' })} />
                      Dependente
                    </label>
                  </div>
                </div>
              </div>
              {convenioForm.titular === 'DEPENDENTE' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nome do titular</label>
                  <input type="text" value={convenioForm.nomeTitular} onChange={e => setConvenioForm({ ...convenioForm, nomeTitular: e.target.value })} className={inputCls} placeholder="Nome completo do titular" />
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={handleSaveConvenio} disabled={savingConvenio} className="px-3 py-1.5 bg-[#1E3A5F] text-white text-xs rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
                  {savingConvenio ? 'Salvando...' : 'Salvar Convenio'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Observacoes</label>
              <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={inputCls + ' h-20 resize-none'} />
            </div>
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-400">Cadastrado em {format(new Date(customer.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</p>
              <button type="submit" disabled={saving} className="px-6 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
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
                { key: 'anamnese', label: 'Anamnese', show: true },
                { key: 'evolucao', label: 'Evolucao', show: true },
              ].filter(t => t.show).map(t => (
                <button key={t.key} onClick={() => setProntuarioSection(t.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${prontuarioSection === t.key ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
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
                      <DictationTextarea value={medForm.allergies} onChange={(v) => setMedForm({ ...medForm, allergies: v })} className={inputCls + ' h-16 resize-none'} placeholder="Ex: Dipirona, Latex..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Medicamentos em uso</label>
                      <DictationTextarea value={medForm.medications} onChange={(v) => setMedForm({ ...medForm, medications: v })} className={inputCls + ' h-16 resize-none'} placeholder="Ex: Losartana 50mg..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Doencas cronicas</label>
                      <DictationTextarea value={medForm.chronicDiseases} onChange={(v) => setMedForm({ ...medForm, chronicDiseases: v })} className={inputCls + ' h-16 resize-none'} placeholder="Ex: Hipertensao, Diabetes..." />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes clinicas</label>
                      <DictationTextarea value={medForm.clinicalNotes} onChange={(v) => setMedForm({ ...medForm, clinicalNotes: v })} className={inputCls + ' h-20 resize-none'} placeholder="Anotacoes gerais do medico..." />
                    </div>
                  </div>
                  <button onClick={handleSaveMedical} disabled={savingMed} className="mt-3 px-4 py-2 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
                    {savingMed ? 'Salvando...' : 'Salvar dados clinicos'}
                  </button>
                </div>

                {/* Entries timeline */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-slate-800">Historico de anotacoes</h4>
                    <button onClick={() => setShowNewEntry(!showNewEntry)} className="flex items-center gap-1.5 text-sm font-medium text-[#1E3A5F] hover:text-[#1E3A5F]">
                      <Plus size={16} /> Nova anotacao
                    </button>
                  </div>

                  {showNewEntry && (
                    <form onSubmit={handleAddEntry} className="mb-4 p-4 border border-[#BFDBFE] bg-[#EFF6FF]/50 rounded-lg">
                      <div className="flex gap-3 mb-3">
                        <select value={entryForm.type} onChange={(e) => setEntryForm({ ...entryForm, type: e.target.value })} className={inputCls + ' w-auto'}>
                          <option value="note">Anotacao</option>
                          <option value="procedure">Procedimento</option>
                          <option value="prescription">Prescricao</option>
                          <option value="exam">Exame</option>
                        </select>
                      </div>
                      <DictationTextarea value={entryForm.content} onChange={(v) => setEntryForm({ ...entryForm, content: v })} className={inputCls + ' h-24 resize-none mb-3'} placeholder="Descreva o procedimento, anotacao ou observacao..." required />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowNewEntry(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                        <button type="submit" disabled={savingEntry} className="px-4 py-1.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
                          {savingEntry ? 'Salvando...' : 'Adicionar'}
                        </button>
                      </div>
                    </form>
                  )}

                  {(!customer.medicalRecord?.entries || customer.medicalRecord.entries.length === 0) ? (
                    <p className="text-sm text-slate-500 text-center py-8">Nenhuma anotacao registrada. Clique em "Nova anotacao" para comecar.</p>
                  ) : (
                    <div className="space-y-3">
                      {customer.medicalRecord.entries.map((entry) => {
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
                    {getSegmentConfig(user?.tenant?.segment).anamnese.map(field => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        {field.type === 'textarea' ? (
                          <DictationTextarea value={anamneseData[field.key] || ''} onChange={(v) => setAnamneseData({ ...anamneseData, [field.key]: v })} className={inputCls + ' h-24 resize-none'} placeholder={field.placeholder} />
                        ) : (
                          <input type={field.type === 'number' ? 'number' : 'text'} value={anamneseData[field.key] || ''} onChange={(e) => setAnamneseData({ ...anamneseData, [field.key]: e.target.value })} className={inputCls} placeholder={field.placeholder} />
                        )}
                      </div>
                    ))}

                    <button onClick={handleSaveAnamnese} disabled={savingAnamnese} className="w-full py-2.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50 font-medium">
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
                  <button onClick={() => setShowNewEvolucao(!showNewEvolucao)} className="flex items-center gap-1.5 text-sm font-medium text-[#1E3A5F] hover:text-[#1E3A5F]">
                    <Plus size={16} /> Nova Evolucao
                  </button>
                </div>

                {showNewEvolucao && (
                  <div className="p-4 border border-[#BFDBFE] bg-[#EFF6FF]/50 rounded-lg space-y-3">
                    {getSegmentConfig(user?.tenant?.segment).evolucao.map(field => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        {field.type === 'textarea' ? (
                          <DictationTextarea value={evolucaoForm[field.key] || ''} onChange={(v) => setEvolucaoForm({ ...evolucaoForm, [field.key]: v })} className={inputCls + ' h-24 resize-none'} placeholder={field.placeholder} />
                        ) : (
                          <input type={field.type === 'number' ? 'number' : 'text'} value={evolucaoForm[field.key] || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, [field.key]: e.target.value })} className={inputCls} placeholder={field.placeholder} />
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowNewEvolucao(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                      <button type="button" onClick={handleAddEvolucao} disabled={savingEvolucao} className="px-4 py-1.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
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
                          <span className="text-xs font-medium text-[#1E3A5F]">{format(new Date(ev.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          {getSegmentConfig(user?.tenant?.segment).evolucao.map(field => (
                            ev[field.key] ? <div key={field.key}><span className="font-medium text-slate-600">{field.label}: </span><span className="text-slate-700">{ev[field.key]}</span></div> : null
                          ))}
                        </div>
                        {ev.notes && <p className="text-xs text-slate-400 mt-1">{ev.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* PRESCRICOES TAB */}
        {detailTab === 'prescricoes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-blue-600" /> Prescricoes
              </h4>
              <button onClick={() => { setShowNewPrescricao(!showNewPrescricao); setPrescricaoType('MEDICAMENTO'); setPrescricaoItems([]); }} className="flex items-center gap-1.5 text-sm font-medium text-[#1E3A5F] hover:text-[#1E3A5F]">
                <Plus size={16} /> Nova Prescricao
              </button>
            </div>

            <datalist id="exam-types-list">
              {examTypesList.filter(e => e.ativo !== false).map(e => <option key={e.id} value={e.name} />)}
            </datalist>

            {showNewPrescricao && (
              <div className="p-4 border border-[#BFDBFE] bg-[#EFF6FF]/50 rounded-lg space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                  <select value={prescricaoType} onChange={(e) => { setPrescricaoType(e.target.value); setPrescricaoItems([]); }} className={inputCls}>
                    <option value="MEDICAMENTO">Medicamento</option>
                    <option value="EXAME_EXTERNO">Exame Externo</option>
                    <option value="EXAME_INTERNO">Exame Interno</option>
                    {['CLINICA_MEDICA', 'CLINICA_OFTALMOLOGICA', 'CLINICA_GERAL'].includes(user?.tenant?.segment || '') && (
                      <option value="OCULOS">Oculos</option>
                    )}
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
                    <button type="button" onClick={() => setPrescricaoItems([...prescricaoItems, { name: '', dosage: '', posologia: '', duration: '', via: '' }])} className="text-sm text-[#1E3A5F] hover:text-[#1E3A5F] font-medium">+ Adicionar medicamento</button>
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
                          <input type="text" placeholder="Nome do exame" list="exam-types-list" value={item.name || ''} onChange={(e) => { const updated = [...prescricaoItems]; updated[idx] = { ...item, name: e.target.value }; setPrescricaoItems(updated); }} className={inputCls} />
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
                    <button type="button" onClick={() => setPrescricaoItems([...prescricaoItems, { name: '', specialty: '', indication: '', urgency: '' }])} className="text-sm text-[#1E3A5F] hover:text-[#1E3A5F] font-medium">+ Adicionar exame</button>
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
                      <DictationTextarea value={prescricaoOculos.observacoes} onChange={(v) => setPrescricaoOculos({ ...prescricaoOculos, observacoes: v })} className={inputCls + ' h-16 resize-none'} />
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowNewPrescricao(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                  <button type="button" onClick={handleAddPrescricao} disabled={savingPrescricao} className="px-4 py-1.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
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
                    MEDICAMENTO: { label: 'Receituario', cls: 'bg-blue-100 text-blue-700' },
                    EXAME_EXTERNO: { label: 'Exame Externo', cls: 'bg-amber-100 text-amber-700' },
                    OCULOS: { label: 'Oculos', cls: 'bg-violet-100 text-violet-700' },
                    EXAME_INTERNO: { label: 'Exame Interno', cls: 'bg-emerald-100 text-emerald-700' },
                  };
                  const tl = typeLabels[p.type] || { label: p.type, cls: 'bg-gray-100 text-gray-600' };
                  const itemCount = p.items?.length || 0;
                  const description = p.type === 'MEDICAMENTO' && itemCount > 0
                    ? `${itemCount} medicamento(s)`
                    : p.type === 'OCULOS' ? 'Receita de oculos'
                    : p.items?.map((item: any) => item.name).join(', ') || p.type;
                  return (
                    <div key={p.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${tl.cls}`}>{tl.label}</span>
                          <span className="text-sm text-slate-700 truncate">
                            {p.doctorName ? `Dr(a). ${p.doctorName}` : ''}{p.doctorName && description ? ' - ' : ''}{description}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-xs text-slate-400">{format(new Date(p.createdAt), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          <button onClick={() => handleDownloadPdf('prescriptions', p.id)} className="flex items-center gap-1 text-sm text-[#1E3A5F] hover:text-[#2A4D7A] font-medium" title="Baixar PDF">
                            <Download size={14} /> PDF
                          </button>
                          <button onClick={() => handleDeletePrescricao(p.id)} className="text-red-400 hover:text-red-600" title="Excluir prescricao">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ATESTADOS TAB */}
        {detailTab === 'atestados' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-emerald-600" /> Atestados
              </h4>
              <button onClick={() => setShowNewAtestado(!showNewAtestado)} className="flex items-center gap-1.5 text-sm font-medium text-[#1E3A5F] hover:text-[#1E3A5F]">
                <Plus size={16} /> Emitir Atestado
              </button>
            </div>

            {showNewAtestado && (
              <div className="p-4 border border-[#BFDBFE] bg-[#EFF6FF]/50 rounded-lg space-y-3">
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
                  <DictationTextarea value={atestadoForm.reason} onChange={(v) => setAtestadoForm({ ...atestadoForm, reason: v })} className={inputCls + ' h-16 resize-none'} placeholder="Motivo do atestado..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">CID-10 (opcional)</label>
                  <CidAutocomplete value={atestadoForm.cid || ''} onChange={(v) => setAtestadoForm({ ...atestadoForm, cid: v })} className={inputCls} />
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
                  <DictationTextarea value={atestadoForm.observations} onChange={(v) => setAtestadoForm({ ...atestadoForm, observations: v })} className={inputCls + ' h-16 resize-none'} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowNewAtestado(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                  <button type="button" onClick={handleAddAtestado} disabled={savingAtestado} className="px-4 py-1.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${at.cls}`}>{at.label}</span>
                          <span className="text-sm text-slate-700 truncate">{a.reason}</span>
                          {a.cid && <span className="text-xs text-slate-500 shrink-0">CID: {a.cid}</span>}
                          {a.daysOff && <span className="text-xs text-slate-500 shrink-0">{a.daysOff} dia(s) de afastamento</span>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-xs text-slate-400">{format(new Date(a.createdAt), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          <button onClick={() => handleDownloadPdf('medical-certificates', a.id)} className="flex items-center gap-1 text-sm text-[#1E3A5F] hover:text-[#2A4D7A] font-medium" title="Baixar PDF">
                            <Download size={14} /> PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTOS TAB */}
        {detailTab === 'documentos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-slate-800 flex items-center gap-2">
                <Paperclip size={16} className="text-amber-600" /> Documentos
              </h4>
            </div>

            <div className="p-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
                  <select value={docCategory} onChange={e => setDocCategory(e.target.value)} className={inputCls}>
                    <option value="EXAME">Exame</option>
                    <option value="LAUDO">Laudo</option>
                    <option value="RECEITA">Receita</option>
                    <option value="HISTORICO">Historico</option>
                    <option value="IMAGEM">Imagem</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descricao (opcional)</label>
                  <input value={docDescription} onChange={e => setDocDescription(e.target.value)} className={inputCls} placeholder="Ex: Hemograma 15/04, Raio-X torax..." />
                </div>
              </div>
              <label className={`flex flex-col items-center justify-center py-4 cursor-pointer rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors ${uploadingDoc ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={24} className="text-slate-400 mb-1" />
                <span className="text-sm text-slate-600 font-medium">{uploadingDoc ? 'Enviando...' : 'Clique para enviar arquivo'}</span>
                <span className="text-xs text-slate-400 mt-0.5">PDF, imagem ou documento (max 4MB)</span>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx" onChange={e => { if (e.target.files?.[0]) handleUploadDoc(e.target.files[0]); e.target.value = ''; }} disabled={uploadingDoc} />
              </label>
            </div>

            {loadingDocs ? (
              <p className="text-sm text-slate-500 text-center py-8">Carregando documentos...</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Nenhum documento salvo para este paciente.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc: any) => {
                  const catLabels: Record<string, { label: string; cls: string }> = {
                    EXAME: { label: 'Exame', cls: 'bg-blue-100 text-blue-700' },
                    LAUDO: { label: 'Laudo', cls: 'bg-purple-100 text-purple-700' },
                    RECEITA: { label: 'Receita', cls: 'bg-emerald-100 text-emerald-700' },
                    HISTORICO: { label: 'Historico', cls: 'bg-amber-100 text-amber-700' },
                    IMAGEM: { label: 'Imagem', cls: 'bg-pink-100 text-pink-700' },
                    OUTRO: { label: 'Outro', cls: 'bg-slate-100 text-slate-600' },
                  };
                  const cat = catLabels[doc.category] || catLabels.OUTRO;
                  const sizeKB = doc.fileSize ? `${Math.round(doc.fileSize / 1024)}KB` : '';
                  return (
                    <div key={doc.id} className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50/50 transition-colors flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <File size={18} className="text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${cat.cls}`}>{cat.label}</span>
                          <span className="text-sm font-medium text-slate-800 truncate">{doc.fileName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {doc.description && <span className="text-xs text-slate-500 truncate">{doc.description}</span>}
                          <span className="text-xs text-slate-400">{sizeKB}</span>
                          <span className="text-xs text-slate-400">por {doc.uploaderName}</span>
                          <span className="text-xs text-slate-400">{format(new Date(doc.createdAt), 'dd/MM/yyyy', { locale: ptBR })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleDownloadDoc(doc.id)} className="p-1.5 text-[#1E3A5F] hover:bg-[#EFF6FF] rounded" title="Baixar">
                          <Download size={16} />
                        </button>
                        <button onClick={() => handleDeleteDoc(doc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Remover">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* APPOINTMENTS TAB */}
        {detailTab === 'appointments' && (
          <div>
            {!customer.scheduledCalls || customer.scheduledCalls.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Nenhuma consulta registrada para este paciente.</p>
            ) : (
              <div className="space-y-3">
                {customer.scheduledCalls.map((a) => {
                  const st = apptStatusMap[a.status] || { label: a.status, cls: 'bg-gray-100 text-gray-600' };
                  const isPast = new Date(a.date) < new Date();
                  return (
                    <div key={a.id} className={`p-4 border rounded-lg transition-colors ${isPast ? 'border-slate-200 opacity-70' : 'border-[#BFDBFE] bg-[#EFF6FF]/30'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-[#EFF6FF] rounded-lg p-2 text-center min-w-[50px]">
                            <p className="text-xs text-[#1E3A5F] font-medium">{format(new Date(a.date), 'MMM', { locale: ptBR }).toUpperCase()}</p>
                            <p className="text-lg font-bold text-[#1E3A5F]">{format(new Date(a.date), 'dd')}</p>
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

      </div>

      {/* Toast notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[60] bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
