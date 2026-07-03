import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Heart, User, Download, FileText, Shield, Upload, Plus, Trash2, Paperclip, File, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { DictationTextarea } from './DictationTextarea';
import { CidAutocomplete } from './CidAutocomplete';
import { useCepLookup, formatarCep } from '../hooks/useCepLookup';
import { getSegmentConfig } from '../config/segmentConfig';
import { maskPhone, whatsappIndicator } from '../utils/phone';

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
  dataQuality?: { cpfValid: boolean | null; cpfDuplicate: boolean };
  phone: string | null;
  cellPhone?: string | null;
  landlinePhone?: string | null;
  email: string | null;
  cpfCnpj: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
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
  dependentes?: Array<{ id: string; name: string; phone: string | null; birthDate: string | null; parentesco: string | null; usarTelResponsavel: boolean }>;
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

// Texto livre clinico append-only (multiprofissional). Mostra o historico
// cronologico (autor, data, hora, conteudo) e um campo para adicionar um novo
// registro imutavel. Usado tanto na Anamnese quanto na Evolucao.
const NOTE_DRAFT_PREFIX = 'anpexia_note_draft:';

function ClinicalNotesSection({ notes, value, onChange, onAdd, saving, addLabel, placeholder, currentUserId, onEdit, draftKey }: {
  notes: any[];
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  saving: boolean;
  addLabel: string;
  placeholder: string;
  /** Usuário logado — só o autor do registro pode editá-lo. */
  currentUserId?: string;
  /** Persiste a edição (PUT) e recarrega a lista. */
  onEdit: (noteId: string, content: string) => Promise<void>;
  /** Chave do rascunho local (usuário+paciente+seção). Sem ela, o rascunho fica desativado. */
  draftKey?: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const draftInitRef = useRef<string | null>(null);
  const draftHadContentRef = useRef(false);

  // Rascunho local (localStorage): o texto digitado na caixa fica preservado
  // mesmo sem clicar em "Adicionar" — sobrevive a refresh/fechamento/queda de
  // internet. NÃO cria registro; só guarda o rascunho até o médico registrar.
  // Restaura ao abrir a seção deste paciente.
  useEffect(() => {
    if (!draftKey) return;
    draftInitRef.current = draftKey;
    let saved = '';
    try { saved = localStorage.getItem(NOTE_DRAFT_PREFIX + draftKey) || ''; } catch { /* private mode */ }
    // Carrega o rascunho DESTE paciente/seção (o do paciente anterior já foi
    // persistido na sua própria chave, então não se perde nada ao trocar).
    if (saved) { onChange(saved); setDraftRecovered(true); draftHadContentRef.current = true; }
    else { if (value) onChange(''); setDraftRecovered(false); draftHadContentRef.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Persiste a cada alteração (instantâneo). Ao esvaziar (após registrar), limpa.
  useEffect(() => {
    if (!draftKey || draftInitRef.current !== draftKey) return;
    const key = NOTE_DRAFT_PREFIX + draftKey;
    try {
      if (value && value.trim()) { localStorage.setItem(key, value); draftHadContentRef.current = true; }
      else if (draftHadContentRef.current) { localStorage.removeItem(key); draftHadContentRef.current = false; setDraftRecovered(false); }
    } catch { /* quota/private mode — ignora */ }
  }, [value, draftKey]);

  const startEdit = (n: any) => { setEditingId(n.id); setEditText(n.content || ''); };
  const cancelEdit = () => { setEditingId(null); setEditText(''); };
  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    setSavingEdit(true);
    try {
      await onEdit(id, editText.trim());
      setEditingId(null);
      setEditText('');
    } finally { setSavingEdit(false); }
  };

  return (
    <div className="space-y-3">
      {notes.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">Nenhum registro ainda.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const canEdit = !!currentUserId && n.authorId === currentUserId;
            const isEditing = editingId === n.id;
            return (
              <div key={n.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-xs font-semibold text-[#1E3A5F]">{n.authorName || 'Profissional'}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400">
                      {n.createdAt ? format(new Date(n.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}
                      {n.updatedAt ? ` · editado ${format(new Date(n.updatedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}` : ''}
                    </span>
                    {canEdit && !isEditing && (
                      <button type="button" onClick={() => startEdit(n)} className="text-[11px] font-medium text-[#1E3A5F] hover:underline">Editar</button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <DictationTextarea value={editText} onChange={setEditText} className={inputCls + ' resize-y min-h-[20vh]'} />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={cancelEdit} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50">Cancelar</button>
                      <button type="button" onClick={() => saveEdit(n.id)} disabled={savingEdit || !editText.trim()} className="px-4 py-1.5 bg-[#1E3A5F] text-white text-xs rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
                        {savingEdit ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-slate-200 pt-3">
        <DictationTextarea
          value={value}
          onChange={onChange}
          className={inputCls + ' resize-y min-h-[42vh]'}
          placeholder={placeholder}
        />
        {draftKey && value.trim() && (
          <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span>
              {draftRecovered ? 'Rascunho recuperado — continue de onde parou. ' : 'Rascunho salvo automaticamente. '}
              Ainda não é um registro — clique em "{addLabel}" para gravar.
            </span>
          </p>
        )}
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={saving || !value.trim()}
            className="px-4 py-1.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50"
          >
            {saving ? 'Salvando...' : addLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Idade em anos a partir da data de nascimento (ex.: "42 anos"). Null se ausente/invalida. */
function calcAge(birthDate?: string | null): string | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 0) return null;
  return `${age} ano${age !== 1 ? 's' : ''}`;
}

function populateForm(c: Customer) {
  return {
    name: c.name, phone: c.phone || '', cellPhone: c.cellPhone || '', landlinePhone: c.landlinePhone || '', email: c.email || '',
    cpfCnpj: c.cpfCnpj || '', documentType: c.documentType || '', documentNumber: c.documentNumber || '', birthDate: c.birthDate ? c.birthDate.split('T')[0] : '',
    insurance: c.insurance || '', notes: c.notes || '', origin: c.origin || '', optInWhatsApp: c.optInWhatsApp,
    address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', ...(c.address as any || {}) },
  };
}

// ==================== Props ====================

/** Resumo do atendimento exibido no cabecalho (idade vem do customer; o resto do agendamento).
 *  Pacientes nao passa (mostra so a idade). Agenda e Fila passam o atendimento atual. */
export interface AttendanceSummary {
  /** 'CONVENIO' | 'PARTICULAR' (do ScheduledCall.paymentType). */
  paymentType?: string | null;
  /** Nome do convenio do atendimento (quando paymentType === 'CONVENIO'). */
  convenioNome?: string | null;
  /** Procedimento agendado ja derivado (Retorno / TUSS / particular). */
  procedureLabel?: string | null;
}

export interface PatientPanelProps {
  customerId: string;
  onClose?: () => void;
  initialTab?: DetailTab;
  /** Called after patient info is saved, so parent can refresh its own data */
  onPatientUpdated?: () => void;
  /** Doctor performing the attendance — used as author of anamnesis */
  doctorId?: string;
  /** Acoes extras especificas do contexto de abertura (ex.: "Finalizar Atendimento" na Fila),
   *  renderizadas no cabecalho fixo ao lado do botao fechar — sem duplicar layout. */
  headerExtra?: ReactNode;
  /** Resumo do atendimento (Agenda/Fila) para o cabecalho. Pacientes omite (so idade). */
  attendance?: AttendanceSummary;
}

// ==================== Modal shell (tamanho centralizado) ====================

/**
 * Shell unico do prontuario. Concentra largura, altura, responsividade e o
 * recorte do scroll interno num so lugar, para que TODOS os pontos de abertura
 * (Pacientes, Agenda, Fila) usem exatamente o mesmo tamanho e comportamento.
 *
 * - Mobile: ocupa toda a area disponivel (tela cheia, sem cantos).
 * - Tablet: ~92vw x 92vh.
 * - Desktop: ~85vw x 90vh, com teto de 1600px de largura.
 *
 * O scroll interno fica por conta do proprio PatientPanel (cabecalho, abas e
 * rodape sao `shrink-0`; so a area de conteudo rola). Aqui o container apenas
 * define o tamanho e recorta o overflow com `overflow-hidden`.
 */
export function PatientPanelModal({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-[92vh] sm:w-[92vw] sm:rounded-2xl lg:h-[90vh] lg:w-[85vw] lg:max-w-[1600px]">
        {children}
      </div>
    </div>
  );
}

// ==================== Component ====================

export function PatientPanel({ customerId, onClose, initialTab = 'prontuario', onPatientUpdated, doctorId: doctorIdProp, headerExtra, attendance }: PatientPanelProps) {
  const { user } = useAuth();
  const { buscarCep, loading: cepLoading, erro: cepErro } = useCepLookup();
  const numberInputRef = useCallback((node: HTMLInputElement | null) => { if (node) node.dataset.numberInput = 'true'; }, []);

  // ==================== State ====================

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [formData, setFormData] = useState({ name: '', phone: '', cellPhone: '', landlinePhone: '', email: '', cpfCnpj: '', documentType: '', documentNumber: '', birthDate: '', insurance: '', notes: '', origin: '', optInWhatsApp: false, address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '' } });
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
  const [anamnesisId, setAnamnesisId] = useState<string | null>(null);
  const [anamneseSaveStatus, setAnamneseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'unsaved'>('idle');
  const [anamneseError, setAnamneseError] = useState<string>('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anamneseDataRef = useRef<any>({});
  const anamnesisVersionRef = useRef<number>(0);
  const anamnesePatchRef = useRef<Record<string, any>>({});
  const [anamneseTab, setAnamneseTab] = useState<'campos' | 'texto_livre'>('campos');
  // Texto livre clinico append-only (Anamnese)
  const [anamneseNotes, setAnamneseNotes] = useState<any[]>([]);
  const [newAnamneseNote, setNewAnamneseNote] = useState('');
  const [savingAnamneseNote, setSavingAnamneseNote] = useState(false);

  // Evolucao state
  const [evolucoes, setEvolucoes] = useState<any[]>([]);
  const [loadingEvolucoes, setLoadingEvolucoes] = useState(false);
  const [showNewEvolucao, setShowNewEvolucao] = useState(false);
  const [evolucaoForm, setEvolucaoForm] = useState<Record<string, string>>({ subjective: '', objective: '', exams: '', returnDate: '' });
  const [editingEvolucaoId, setEditingEvolucaoId] = useState<string | null>(null);
  const [savingEvolucao, setSavingEvolucao] = useState(false);
  const [evolucaoTab, setEvolucaoTab] = useState<'estruturada' | 'texto_livre'>('estruturada');
  // Texto livre clinico append-only (Evolucao)
  const [evolucaoNotes, setEvolucaoNotes] = useState<any[]>([]);
  const [newEvolucaoNote, setNewEvolucaoNote] = useState('');
  const [savingEvolucaoNote, setSavingEvolucaoNote] = useState(false);

  // Prescricoes state
  const [prescricoes, setPrescricoes] = useState<any[]>([]);
  const [loadingPrescricoes, setLoadingPrescricoes] = useState(false);
  const [showNewPrescricao, setShowNewPrescricao] = useState(false);
  const [prescricaoType, setPrescricaoType] = useState('MEDICAMENTO');
  const [prescricaoItems, setPrescricaoItems] = useState<any[]>([]);
  const [prescricaoOculos, setPrescricaoOculos] = useState({ od_esferico: '', od_cilindrico: '', od_eixo: '', od_adicao: '', od_dnp: '', oe_esferico: '', oe_cilindrico: '', oe_eixo: '', oe_adicao: '', oe_dnp: '', tipoLente: '', validade: '', observacoes: '' });
  const [savingPrescricao, setSavingPrescricao] = useState(false);
  const [prescricaoOutro, setPrescricaoOutro] = useState({ title: '', content: '' });

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
  const [previewDocIndex, setPreviewDocIndex] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  // Carrega o texto livre clinico (append-only) de um contexto
  const fetchClinicalNotes = async (patientId: string, context: 'ANAMNESE' | 'EVOLUCAO', setter: (n: any[]) => void) => {
    try {
      const { data } = await api.get(`/clinical-notes/${patientId}`, { params: { context } });
      setter(data.data || []);
    } catch { setter([]); }
  };

  // Fetch anamnese (campos estruturados + texto livre append-only)
  const fetchAnamnese = async (patientId: string) => {
    setLoadingAnamnese(true);
    try {
      const { data } = await api.get(`/anamnesis/${patientId}`);
      if (data.data) {
        setAnamneseData(data.data.data || {});
        anamneseDataRef.current = data.data.data || {};
        anamnesisVersionRef.current = data.data.version ?? 0;
        anamnesePatchRef.current = {};
        setAnamnesisId(data.data.id);
        setAnamneseSaveStatus('saved');
      } else {
        setAnamneseData({});
        anamneseDataRef.current = {};
        anamnesisVersionRef.current = 0;
        anamnesePatchRef.current = {};
        setAnamnesisId(null);
        setAnamneseSaveStatus('idle');
      }
    } catch {
      setAnamneseData({});
      anamneseDataRef.current = {};
      anamnesisVersionRef.current = 0;
      anamnesePatchRef.current = {};
      setAnamnesisId(null);
      setAnamneseSaveStatus('idle');
    }
    finally { setLoadingAnamnese(false); }
    fetchClinicalNotes(patientId, 'ANAMNESE', setAnamneseNotes);
  };

  // Salva os campos estruturados. Em update, envia apenas as chaves alteradas
  // (patch) + version, para que o merge no backend nunca apague campos de outro
  // profissional. O texto livre NAO passa por aqui (vai para clinical-notes).
  const saveAnamnese = async () => {
    if (!customer) return;
    const resolvedDoctorId = doctorIdProp || user?.id;
    setSavingAnamnese(true);
    setAnamneseSaveStatus('saving');
    setAnamneseError('');
    try {
      if (anamnesisId) {
        const sendPatch = { ...anamnesePatchRef.current };
        anamnesePatchRef.current = {};
        try {
          const { data } = await api.put(`/anamnesis/${customer.id}/${anamnesisId}`, { data: sendPatch, version: anamnesisVersionRef.current });
          if (data?.data?.version != null) anamnesisVersionRef.current = data.data.version;
        } catch (e: any) {
          // Restaura o patch nao salvo (mantendo edicoes feitas durante a requisicao)
          anamnesePatchRef.current = { ...sendPatch, ...anamnesePatchRef.current };
          if (e?.response?.status === 409) {
            // Conflito raro: ressincroniza com o servidor (que ja mesclou os dados)
            await fetchAnamnese(customer.id);
            showToast('Anamnese recarregada (atualizada por outro profissional).');
            setAnamneseSaveStatus('saved');
            return;
          }
          throw e;
        }
      } else {
        const { data } = await api.post(`/anamnesis/${customer.id}`, { doctorId: resolvedDoctorId, data: anamneseDataRef.current });
        setAnamnesisId(data.data?.id || data.id);
        if (data?.data?.version != null) anamnesisVersionRef.current = data.data.version;
        anamnesePatchRef.current = {};
      }
      setAnamneseSaveStatus('saved');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.error || 'Erro ao salvar anamnese';
      setAnamneseError(typeof msg === 'string' ? msg : 'Erro ao salvar anamnese');
      setAnamneseSaveStatus('error');
      showToast(typeof msg === 'string' ? msg : 'Erro ao salvar anamnese');
    } finally {
      setSavingAnamnese(false);
    }
  };

  const handleSaveAnamnese = () => saveAnamnese();

  const handleAnamneseFieldChange = (key: string, value: string) => {
    const updated = { ...anamneseData, [key]: value };
    setAnamneseData(updated);
    anamneseDataRef.current = updated;
    anamnesePatchRef.current = { ...anamnesePatchRef.current, [key]: value };
    setAnamneseSaveStatus('unsaved');

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveAnamnese();
    }, 3000);
  };

  // Adiciona um registro de texto livre da Anamnese (append-only)
  const addAnamneseNote = async () => {
    if (!customer) return;
    const content = newAnamneseNote.trim();
    if (!content) return;
    setSavingAnamneseNote(true);
    try {
      await api.post(`/clinical-notes/${customer.id}`, { context: 'ANAMNESE', content });
      setNewAnamneseNote('');
      await fetchClinicalNotes(customer.id, 'ANAMNESE', setAnamneseNotes);
      showToast('Registro adicionado');
    } catch { showToast('Erro ao adicionar registro'); }
    finally { setSavingAnamneseNote(false); }
  };

  // Adiciona um registro de texto livre da Evolucao (append-only)
  const addEvolucaoNote = async () => {
    if (!customer) return;
    const content = newEvolucaoNote.trim();
    if (!content) return;
    setSavingEvolucaoNote(true);
    try {
      await api.post(`/clinical-notes/${customer.id}`, { context: 'EVOLUCAO', content });
      setNewEvolucaoNote('');
      await fetchClinicalNotes(customer.id, 'EVOLUCAO', setEvolucaoNotes);
      showToast('Registro adicionado');
    } catch { showToast('Erro ao adicionar registro'); }
    finally { setSavingEvolucaoNote(false); }
  };

  // Edita um registro de texto livre. So o autor consegue (backend valida e retorna 403 caso contrario).
  const editClinicalNote = async (context: 'ANAMNESE' | 'EVOLUCAO', noteId: string, content: string, setter: (n: any[]) => void) => {
    if (!customer) return;
    try {
      await api.put(`/clinical-notes/${customer.id}/${noteId}`, { content });
      await fetchClinicalNotes(customer.id, context, setter);
      showToast('Registro atualizado');
    } catch (err: any) {
      const msg = err?.response?.status === 403
        ? 'Somente o autor pode editar este registro'
        : 'Erro ao atualizar registro';
      showToast(msg);
      throw err;
    }
  };

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // Fetch evolucoes (estruturadas + texto livre append-only)
  const fetchEvolucoes = async (patientId: string) => {
    setLoadingEvolucoes(true);
    try {
      const { data } = await api.get(`/patient-evolution/${patientId}`);
      setEvolucoes(data.data || []);
    } catch { setEvolucoes([]); }
    finally { setLoadingEvolucoes(false); }
    fetchClinicalNotes(patientId, 'EVOLUCAO', setEvolucaoNotes);
  };

  const handleAddEvolucao = async () => {
    if (!customer) return;
    const isEdit = !!editingEvolucaoId;
    setSavingEvolucao(true);
    try {
      if (isEdit) {
        await api.put(`/patient-evolution/${customer.id}/${editingEvolucaoId}`, evolucaoForm);
      } else {
        await api.post(`/patient-evolution/${customer.id}`, evolucaoForm);
      }
      setEvolucaoForm({});
      setShowNewEvolucao(false);
      setEditingEvolucaoId(null);
      await fetchEvolucoes(customer.id);
      showToast(isEdit ? 'Evolucao atualizada!' : 'Evolucao registrada!');
    } catch (err: any) {
      showToast(err?.response?.status === 403 ? 'Somente o autor pode editar esta evolucao' : 'Erro ao salvar evolucao');
    }
    finally { setSavingEvolucao(false); }
  };

  // Abre o formulario ja preenchido para o autor editar a evolucao que criou.
  const startEditEvolucao = (ev: any) => {
    const { id, tenantId, patientId, doctorId, createdAt, updatedAt, updatedById, ...fields } = ev;
    void id; void tenantId; void patientId; void doctorId; void createdAt; void updatedAt; void updatedById;
    setEvolucaoForm({ ...fields });
    setEditingEvolucaoId(ev.id);
    setShowNewEvolucao(true);
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
      if (prescricaoType === 'OUTRO') {
        body.title = prescricaoOutro.title;
        body.content = prescricaoOutro.content;
      } else if (prescricaoType === 'OCULOS') {
        body.oculosData = prescricaoOculos;
      } else {
        body.items = prescricaoItems;
      }
      await api.post(`/prescriptions`, body);
      setShowNewPrescricao(false);
      setPrescricaoItems([]);
      setPrescricaoOutro({ title: '', content: '' });
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

  const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB por arquivo
  const MAX_PATIENT_DOC_BYTES = 50 * 1024 * 1024; // 50 MB por paciente

  const handleUploadDoc = async (file: File) => {
    if (!customer) return;
    if (file.size > MAX_DOC_BYTES) { showToast('Arquivo muito grande (maximo 10 MB por documento).'); return; }
    const usedBytes = documents.reduce((s: number, d: any) => s + (d.fileSize || 0), 0);
    if (usedBytes + file.size > MAX_PATIENT_DOC_BYTES) {
      showToast('Limite de 50 MB de documentos por paciente atingido. Exclua algum arquivo para adicionar novos.');
      return;
    }
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
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Erro ao enviar documento');
    }
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

  const isDocPreviewable = (doc: any) => {
    const ft = (doc.fileType || '').toLowerCase();
    if (ft.startsWith('image/') || ft === 'application/pdf') return true;
    const ext = (doc.fileName || '').toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext || '');
  };

  const openDocPreview = async (index: number) => {
    const doc = documents[index];
    if (!customer || !doc) return;
    if (!isDocPreviewable(doc)) { handleDownloadDoc(doc.id); return; }

    setPreviewDocIndex(index);
    setPreviewLoading(true);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }

    try {
      const { data } = await api.get(`/customers/${customer.id}/documents/${doc.id}`);
      const d = data.data || data;
      if (!d?.fileData) { showToast('Documento sem dados'); setPreviewDocIndex(null); return; }
      if (typeof d.fileData === 'string' && d.fileData.startsWith('enc:')) {
        showToast('Erro: documento encriptado'); setPreviewDocIndex(null); return;
      }
      const byteChars = atob(d.fileData);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: d.fileType || doc.fileType });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error('[DOC PREVIEW]', err);
      showToast('Erro ao carregar preview');
      setPreviewDocIndex(null);
    } finally { setPreviewLoading(false); }
  };

  const navigatePreview = (dir: 1 | -1) => {
    if (previewDocIndex === null) return;
    let next = previewDocIndex + dir;
    while (next >= 0 && next < documents.length) {
      if (isDocPreviewable(documents[next])) { openDocPreview(next); return; }
      next += dir;
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewDocIndex(null);
    setPreviewUrl(null);
  };

  useEffect(() => {
    if (previewDocIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
      if (e.key === 'ArrowLeft') navigatePreview(-1);
      if (e.key === 'ArrowRight') navigatePreview(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDocIndex, documents]);

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

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      {/* Alertas de qualidade de dados (informativos, não bloqueiam) */}
      {(customer.dataQuality?.cpfValid === false || customer.dataQuality?.cpfDuplicate) && (
        <div className="shrink-0 px-6 pt-4 space-y-1">
          {customer.dataQuality?.cpfValid === false && (
            <div className="text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2">⚠ CPF inválido. Corrija o cadastro.</div>
          )}
          {customer.dataQuality?.cpfDuplicate && (
            <div className="text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2">⚠ CPF utilizado em outro paciente.</div>
          )}
        </div>
      )}
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-lg">{customer.name}</h3>
            {(() => {
              const idade = calcAge(customer.birthDate);
              const tipo = attendance
                ? (attendance.paymentType === 'CONVENIO'
                    ? `Convenio${attendance.convenioNome ? ' ' + attendance.convenioNome : ''}`
                    : 'Particular')
                : null;
              const parts = [idade, tipo, attendance?.procedureLabel].filter(Boolean);
              return parts.length > 0 ? (
                <p className="mt-0.5 text-sm text-slate-500">{parts.join('  •  ')}</p>
              ) : null;
            })()}
            <div className="flex gap-1 mt-1">
              {customer.tags?.map((t) => (
                <span key={t.tag.id} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>{t.tag.name}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {headerExtra}
            {onClose && (
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 px-6 border-b border-slate-200 overflow-x-auto shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
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

      {/* Prontuário sub-navigation - fixed outside scroll */}
      {detailTab === 'prontuario' && (
        <div className="shrink-0 px-6 pt-3 pb-2 border-b border-slate-100 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
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
        </div>
      )}

      {/* Tab Content — scrollable */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {/* INFO TAB — Editable form */}
        {detailTab === 'info' && (
          <form id="patient-info-form" onSubmit={handleSaveInfo} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefone Celular <span className="text-[11px] text-slate-400">(WhatsApp)</span></label>
                <input type="tel" value={formData.cellPhone} onChange={(e) => setFormData({ ...formData, cellPhone: maskPhone(e.target.value) })} className={inputCls} placeholder="(00) 00000-0000" maxLength={16} />
                {(() => { const ind = whatsappIndicator(formData.cellPhone, formData.landlinePhone); return <p className={`mt-1 text-xs ${ind.cls}`}>{ind.icon} {ind.label}</p>; })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefone Fixo</label>
                <input type="tel" value={formData.landlinePhone} onChange={(e) => setFormData({ ...formData, landlinePhone: maskPhone(e.target.value) })} className={inputCls} placeholder="(00) 0000-0000" maxLength={15} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CPF <span className="text-[11px] text-slate-400">(único)</span></label>
                <input type="text" value={formData.cpfCnpj} onChange={(e) => setFormData({ ...formData, cpfCnpj: e.target.value })} className={inputCls} placeholder="000.000.000-00" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de documento</label>
                  <select value={formData.documentType} onChange={(e) => setFormData({ ...formData, documentType: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    <option value="RG">RG</option>
                    <option value="CNH">CNH</option>
                    <option value="PASSPORT">Passaporte</option>
                    <option value="RNM">RNM/RNE</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nº do documento</label>
                  <input type="text" value={formData.documentNumber} onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })} className={inputCls} placeholder="Opcional" />
                </div>
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

            {/* Responsavel / Dependentes Section */}
            {customer && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <User size={16} className="text-indigo-500" /> Familia / Vinculos
                </h4>

                {/* If patient has a responsavel */}
                {(customer as any).responsavel && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-indigo-600 font-medium mb-1">Responsavel:</p>
                    <p className="text-sm font-medium text-indigo-800">{(customer as any).responsavel.name}
                      {(customer as any).parentesco && <span className="text-xs text-indigo-500 ml-2">({(customer as any).parentesco})</span>}
                    </p>
                    {(customer as any).responsavel.phone && <p className="text-xs text-indigo-600">{(customer as any).responsavel.phone}</p>}
                    {(customer as any).usarTelResponsavel && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded mt-1 inline-block">Usa telefone do responsavel</span>}
                  </div>
                )}

                {/* If patient has dependentes */}
                {(customer as any).dependentes && (customer as any).dependentes.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-600 font-medium mb-2">Dependentes:</p>
                    <div className="space-y-1.5">
                      {(customer as any).dependentes.map((dep: any) => {
                        let age = '';
                        if (dep.birthDate) {
                          const b = new Date(dep.birthDate);
                          const y = new Date().getFullYear() - b.getFullYear();
                          age = `${y} anos`;
                        }
                        return (
                          <div key={dep.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
                            <span className="text-sm font-medium text-slate-800">{dep.name}</span>
                            {dep.parentesco && <span className="text-xs text-slate-500">({dep.parentesco})</span>}
                            {age && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{age}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!(customer as any).responsavel && (!(customer as any).dependentes || (customer as any).dependentes.length === 0) && (
                  <p className="text-xs text-slate-400 italic">Nenhum vinculo familiar cadastrado.</p>
                )}
              </div>
            )}
          </form>
        )}

        {/* PRONTUARIO TAB */}
        {detailTab === 'prontuario' && (
          <div className="space-y-4">
            {/* DADOS CLINICOS SECTION */}
            {prontuarioSection === 'dados' && (
              <div className="space-y-6">
                <div className="bg-slate-50 rounded-lg p-4">
                  <h4 className="font-medium text-slate-800 mb-3">Dados clinicos</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Tipo sanguineo</label>
                      <select value={medForm.bloodType} onChange={(e) => setMedForm({ ...medForm, bloodType: e.target.value })} className={inputCls}>
                        <option value="">Nao informado</option>
                        {bloodTypes.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Alergias</label>
                      <DictationTextarea value={medForm.allergies} onChange={(v) => setMedForm({ ...medForm, allergies: v })} className={inputCls + ' h-24 resize-y'} placeholder="Ex: Dipirona, Latex..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Medicamentos em uso</label>
                      <DictationTextarea value={medForm.medications} onChange={(v) => setMedForm({ ...medForm, medications: v })} className={inputCls + ' h-24 resize-y'} placeholder="Ex: Losartana 50mg..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Doencas cronicas</label>
                      <DictationTextarea value={medForm.chronicDiseases} onChange={(v) => setMedForm({ ...medForm, chronicDiseases: v })} className={inputCls + ' h-24 resize-y'} placeholder="Ex: Hipertensao, Diabetes..." />
                    </div>
                    <div className="md:col-span-2 xl:col-span-4">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Observacoes clinicas</label>
                      <DictationTextarea value={medForm.clinicalNotes} onChange={(v) => setMedForm({ ...medForm, clinicalNotes: v })} className={inputCls + ' h-32 resize-y'} placeholder="Anotacoes gerais do medico..." />
                    </div>
                  </div>
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
                    {/* Status indicator */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">
                        {anamneseSaveStatus === 'saving' && <span className="text-amber-600">Salvando automaticamente...</span>}
                        {anamneseSaveStatus === 'saved' && <span className="text-emerald-600">Salvo</span>}
                        {anamneseSaveStatus === 'unsaved' && <span className="text-amber-500">Alteracoes nao salvas</span>}
                        {anamneseSaveStatus === 'error' && <span className="text-red-600">Erro ao salvar{anamneseError ? `: ${anamneseError}` : ''}</span>}
                      </span>
                      {anamneseSaveStatus === 'saved' && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />}
                      {anamneseSaveStatus === 'unsaved' && <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />}
                      {anamneseSaveStatus === 'error' && <span className="inline-block w-2 h-2 rounded-full bg-red-500" />}
                      {anamneseSaveStatus === 'saving' && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                    </div>

                    {/* Tabs: Campos | Texto Livre */}
                    <div className="flex gap-1 border-b border-slate-200">
                      <button
                        onClick={() => setAnamneseTab('campos')}
                        className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${anamneseTab === 'campos' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Campos
                      </button>
                      <button
                        onClick={() => setAnamneseTab('texto_livre')}
                        className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${anamneseTab === 'texto_livre' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Texto Livre
                      </button>
                    </div>

                    {/* Tab: Campos (modo tradicional) */}
                    {anamneseTab === 'campos' && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
                        {getSegmentConfig(user?.tenant?.segment).anamnese.map(field => (
                          <div key={field.key}>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                            {field.type === 'textarea' ? (
                              <DictationTextarea value={anamneseData[field.key] || ''} onChange={(v) => handleAnamneseFieldChange(field.key, v)} className={inputCls + ' h-28 resize-y'} placeholder={field.placeholder} />
                            ) : (
                              <input type={field.type === 'number' ? 'number' : 'text'} value={anamneseData[field.key] || ''} onChange={(e) => handleAnamneseFieldChange(field.key, e.target.value)} className={inputCls} placeholder={field.placeholder} />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tab: Texto Livre (append-only, multiprofissional) */}
                    {anamneseTab === 'texto_livre' && (
                      <ClinicalNotesSection
                        notes={anamneseNotes}
                        value={newAnamneseNote}
                        onChange={setNewAnamneseNote}
                        onAdd={addAnamneseNote}
                        saving={savingAnamneseNote}
                        addLabel="Adicionar registro"
                        placeholder="Digite um novo registro da anamnese. Ao adicionar, o texto fica salvo de forma permanente com seu nome e horario — nada e sobrescrito."
                        currentUserId={user?.id}
                        draftKey={user?.id && customer?.id ? `${user.id}:${customer.id}:ANAMNESE` : undefined}
                        onEdit={(noteId, content) => editClinicalNote('ANAMNESE', noteId, content, setAnamneseNotes)}
                      />
                    )}

                  </>
                )}
              </div>
            )}

            {/* EVOLUCAO SECTION */}
            {prontuarioSection === 'evolucao' && (
              <div className="space-y-4">
                {/* Tabs: Estruturada | Texto Livre */}
                <div className="flex gap-1 border-b border-slate-200">
                  <button
                    onClick={() => setEvolucaoTab('estruturada')}
                    className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${evolucaoTab === 'estruturada' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                  >
                    Estruturada
                  </button>
                  <button
                    onClick={() => setEvolucaoTab('texto_livre')}
                    className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${evolucaoTab === 'texto_livre' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                  >
                    Texto Livre
                  </button>
                </div>

                {evolucaoTab === 'texto_livre' && (
                  <ClinicalNotesSection
                    notes={evolucaoNotes}
                    value={newEvolucaoNote}
                    onChange={setNewEvolucaoNote}
                    onAdd={addEvolucaoNote}
                    saving={savingEvolucaoNote}
                    addLabel="Registrar Evolucao"
                    placeholder="Digite a evolucao do paciente. Ao registrar, o texto fica salvo de forma permanente com seu nome e horario — nada e sobrescrito."
                    currentUserId={user?.id}
                    draftKey={user?.id && customer?.id ? `${user.id}:${customer.id}:EVOLUCAO` : undefined}
                    onEdit={(noteId, content) => editClinicalNote('EVOLUCAO', noteId, content, setEvolucaoNotes)}
                  />
                )}

                {evolucaoTab === 'estruturada' && (
                <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-slate-800">Evolucoes</h4>
                  <button onClick={() => { setEditingEvolucaoId(null); setEvolucaoForm({}); setShowNewEvolucao(v => !v); }} className="flex items-center gap-1.5 text-sm font-medium text-[#1E3A5F] hover:text-[#1E3A5F]">
                    <Plus size={16} /> Nova Evolucao
                  </button>
                </div>

                {showNewEvolucao && user?.tenant?.segment === 'CLINICA_OFTALMOLOGICA' && (
                  <div className="p-4 border border-[#BFDBFE] bg-[#EFF6FF]/50 rounded-lg space-y-3">
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-1">Acuidade Visual c/ Correção</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[11px] text-slate-500 mb-0.5">OD</label><input type="text" value={evolucaoForm.acuity_od || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, acuity_od: e.target.value })} className={inputCls} placeholder="20/20" /></div>
                        <div><label className="block text-[11px] text-slate-500 mb-0.5">OE</label><input type="text" value={evolucaoForm.acuity_oe || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, acuity_oe: e.target.value })} className={inputCls} placeholder="20/20" /></div>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-1">Refração Dinâmica</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div><label className="block text-[11px] text-slate-500 mb-0.5">OD</label><input type="text" value={evolucaoForm.refraction_od || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, refraction_od: e.target.value })} className={inputCls} placeholder="-2.00 -0.50 x 180" /></div>
                        <div><label className="block text-[11px] text-slate-500 mb-0.5">OE</label><input type="text" value={evolucaoForm.refraction_oe || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, refraction_oe: e.target.value })} className={inputCls} placeholder="-1.75 -0.25 x 10" /></div>
                        <div><label className="block text-[11px] text-slate-500 mb-0.5">Adição</label><input type="text" value={evolucaoForm.refraction_add || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, refraction_add: e.target.value })} className={inputCls} placeholder="+2.00" /></div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Biomicroscopia</label>
                      <DictationTextarea value={evolucaoForm.objective || ''} onChange={(v) => setEvolucaoForm({ ...evolucaoForm, objective: v })} className={inputCls + ' h-24 resize-y'} placeholder="Palpebras, conjuntiva, cornea, CA, cristalino..." />
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-1">Tonometria (mmHg)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[11px] text-slate-500 mb-0.5">OD</label><input type="number" value={evolucaoForm.iop_od || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, iop_od: e.target.value })} className={inputCls} placeholder="14" /></div>
                        <div><label className="block text-[11px] text-slate-500 mb-0.5">OE</label><input type="number" value={evolucaoForm.iop_oe || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, iop_oe: e.target.value })} className={inputCls} placeholder="15" /></div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Mapeamento de Retina (AO)</label>
                      <DictationTextarea value={evolucaoForm.fundoscopy || ''} onChange={(v) => setEvolucaoForm({ ...evolucaoForm, fundoscopy: v })} className={inputCls + ' h-24 resize-y'} placeholder="Achados do fundo de olho..." />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Hipótese Diagnóstica</label>
                        <DictationTextarea value={evolucaoForm.diagnosis || ''} onChange={(v) => setEvolucaoForm({ ...evolucaoForm, diagnosis: v })} className={inputCls + ' h-24 resize-y'} placeholder="Ex: BAV OD, Glaucoma suspeito..." />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Conduta</label>
                        <DictationTextarea value={evolucaoForm.plan || ''} onChange={(v) => setEvolucaoForm({ ...evolucaoForm, plan: v })} className={inputCls + ' h-24 resize-y'} placeholder="Prescricao de colirios, orientacoes, encaminhamentos..." />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Retorno</label>
                      <input type="text" value={evolucaoForm.returnDate || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, returnDate: e.target.value })} className={inputCls} placeholder="Ex: 3 meses com exames" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Queixa / Subjetivo</label>
                      <DictationTextarea value={evolucaoForm.subjective || ''} onChange={(v) => setEvolucaoForm({ ...evolucaoForm, subjective: v })} className={inputCls + ' h-24 resize-y'} placeholder="Queixas visuais, sintomas, relato do paciente..." />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Exames Solicitados</label>
                      <DictationTextarea value={evolucaoForm.exams || ''} onChange={(v) => setEvolucaoForm({ ...evolucaoForm, exams: v })} className={inputCls + ' h-24 resize-y'} placeholder="OCT, campo visual, paquimetria, topografia, retinografia..." />
                    </div>

                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowNewEvolucao(false); setEditingEvolucaoId(null); setEvolucaoForm({}); }} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                      <button type="button" onClick={handleAddEvolucao} disabled={savingEvolucao} className="px-4 py-1.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
                        {savingEvolucao ? 'Salvando...' : (editingEvolucaoId ? 'Salvar alteracoes' : 'Registrar')}
                      </button>
                    </div>
                  </div>
                )}

                {showNewEvolucao && user?.tenant?.segment !== 'CLINICA_OFTALMOLOGICA' && (
                  <div className="p-4 border border-[#BFDBFE] bg-[#EFF6FF]/50 rounded-lg space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
                      {getSegmentConfig(user?.tenant?.segment).evolucao.map(field => (
                        <div key={field.key} className={field.type === 'textarea' ? '' : 'lg:col-span-1'}>
                          <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                          {field.type === 'textarea' ? (
                            <DictationTextarea value={evolucaoForm[field.key] || ''} onChange={(v) => setEvolucaoForm({ ...evolucaoForm, [field.key]: v })} className={inputCls + ' h-28 resize-y'} placeholder={field.placeholder} />
                          ) : (
                            <input type={field.type === 'number' ? 'number' : 'text'} value={evolucaoForm[field.key] || ''} onChange={(e) => setEvolucaoForm({ ...evolucaoForm, [field.key]: e.target.value })} className={inputCls} placeholder={field.placeholder} />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowNewEvolucao(false); setEditingEvolucaoId(null); setEvolucaoForm({}); }} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                      <button type="button" onClick={handleAddEvolucao} disabled={savingEvolucao} className="px-4 py-1.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50">
                        {savingEvolucao ? 'Salvando...' : (editingEvolucaoId ? 'Salvar alteracoes' : 'Registrar')}
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
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <span className="text-xs font-medium text-[#1E3A5F]">
                            {format(new Date(ev.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
                            {ev.updatedAt && <span className="text-slate-400 font-normal"> · editado {format(new Date(ev.updatedAt), "dd/MM 'as' HH:mm", { locale: ptBR })}</span>}
                          </span>
                          {ev.doctorId && ev.doctorId === user?.id && editingEvolucaoId !== ev.id && (
                            <button type="button" onClick={() => startEditEvolucao(ev)} className="text-[11px] font-medium text-[#1E3A5F] hover:underline shrink-0">Editar</button>
                          )}
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
                  <select value={prescricaoType} onChange={(e) => { setPrescricaoType(e.target.value); setPrescricaoItems([]); setPrescricaoOutro({ title: '', content: '' }); }} className={inputCls}>
                    <option value="MEDICAMENTO">Medicamento</option>
                    <option value="EXAME_EXTERNO">Exame Externo</option>
                    <option value="EXAME_INTERNO">Exame Interno</option>
                    {['CLINICA_MEDICA', 'CLINICA_OFTALMOLOGICA', 'CLINICA_GERAL'].includes(user?.tenant?.segment || '') && (
                      <option value="OCULOS">Oculos</option>
                    )}
                    <option value="OUTRO">Outro</option>
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
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
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
                      <DictationTextarea value={prescricaoOculos.observacoes} onChange={(v) => setPrescricaoOculos({ ...prescricaoOculos, observacoes: v })} className={inputCls + ' h-20 resize-y'} />
                    </div>
                  </div>
                )}

                {/* OUTRO form */}
                {prescricaoType === 'OUTRO' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Titulo (opcional)</label>
                      <input type="text" value={prescricaoOutro.title} onChange={(e) => setPrescricaoOutro({ ...prescricaoOutro, title: e.target.value })} className={inputCls} placeholder="Ex: Prescricao personalizada, Orientacoes..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Conteudo da prescricao</label>
                      <DictationTextarea
                        value={prescricaoOutro.content}
                        onChange={(v) => setPrescricaoOutro({ ...prescricaoOutro, content: v })}
                        className={inputCls + ' resize-y'}
                        style={{ minHeight: '60vh', maxHeight: '80vh' }}
                        placeholder="Cole ou digite o conteudo completo da prescricao aqui..."
                      />
                    </div>
                  </div>
                )}

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
                    OUTRO: { label: 'Outro', cls: 'bg-slate-100 text-slate-700' },
                  };
                  const tl = typeLabels[p.type] || { label: p.type, cls: 'bg-gray-100 text-gray-600' };
                  const itemCount = p.items?.length || 0;
                  const description = p.type === 'MEDICAMENTO' && itemCount > 0
                    ? `${itemCount} medicamento(s)`
                    : p.type === 'OCULOS' ? 'Receita de oculos'
                    : p.type === 'OUTRO' ? (p.title || 'Prescricao personalizada')
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
                  <DictationTextarea value={atestadoForm.reason} onChange={(v) => setAtestadoForm({ ...atestadoForm, reason: v })} className={inputCls + ' h-20 resize-y'} placeholder="Motivo do atestado..." />
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
                  <DictationTextarea value={atestadoForm.observations} onChange={(v) => setAtestadoForm({ ...atestadoForm, observations: v })} className={inputCls + ' h-20 resize-y'} />
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
                <span className="text-xs text-slate-400 mt-0.5">PDF, imagem ou documento (max 10 MB por arquivo)</span>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx" onChange={e => { if (e.target.files?.[0]) handleUploadDoc(e.target.files[0]); e.target.value = ''; }} disabled={uploadingDoc} />
              </label>
              {(() => {
                const usedBytes = documents.reduce((s: number, d: any) => s + (d.fileSize || 0), 0);
                const usedMb = usedBytes / (1024 * 1024);
                const pct = Math.min(100, (usedBytes / MAX_PATIENT_DOC_BYTES) * 100);
                const full = usedBytes >= MAX_PATIENT_DOC_BYTES;
                return (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Armazenamento deste paciente</span>
                      <span className={full ? 'text-red-600 font-medium' : 'text-slate-500'}>{usedMb.toFixed(1)} MB de 50 MB</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${full ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-[#1E3A5F]'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {full && <p className="text-xs text-red-600 mt-1">Limite atingido — exclua um arquivo para adicionar novos.</p>}
                  </div>
                );
              })()}
            </div>

            {loadingDocs ? (
              <p className="text-sm text-slate-500 text-center py-8">Carregando documentos...</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Nenhum documento salvo para este paciente.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc: any, idx: number) => {
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
                  const previewable = isDocPreviewable(doc);
                  return (
                    <div key={doc.id} className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          {previewable ? <Eye size={18} className="text-[#1E3A5F]" /> : <File size={18} className="text-slate-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${cat.cls}`}>{cat.label}</span>
                            <span className="text-sm font-medium truncate text-slate-800">{doc.fileName}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {doc.description && <span className="text-xs text-slate-500 truncate">{doc.description}</span>}
                            <span className="text-xs text-slate-400">{sizeKB}</span>
                            <span className="text-xs text-slate-400">por {doc.uploaderName}</span>
                            <span className="text-xs text-slate-400">{format(new Date(doc.createdAt), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 ml-12">
                        {previewable && (
                          <button onClick={() => openDocPreview(idx)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1E3A5F] hover:bg-[#15304F] rounded-lg transition-colors">
                            <Eye size={14} /> Visualizar
                          </button>
                        )}
                        <button onClick={() => handleDownloadDoc(doc.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1E3A5F] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-lg transition-colors">
                          <Download size={14} /> Baixar
                        </button>
                        <button onClick={() => handleDeleteDoc(doc.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                          <Trash2 size={14} /> Remover
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

      {/* Fixed footer with save buttons */}
      {(detailTab === 'info' ||
        (detailTab === 'prontuario' && (prontuarioSection === 'dados' || prontuarioSection === 'anamnese')) ||
        (detailTab === 'prescricoes' && showNewPrescricao) ||
        (detailTab === 'atestados' && showNewAtestado)
      ) && (
        <div className="shrink-0 px-6 py-3 border-t border-slate-200 bg-white rounded-b-xl shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
          {detailTab === 'info' && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Cadastrado em {format(new Date(customer.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</p>
              <button type="submit" form="patient-info-form" disabled={saving} className="px-6 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
            </div>
          )}

          {detailTab === 'prontuario' && prontuarioSection === 'dados' && (
            <button onClick={handleSaveMedical} disabled={savingMed} className="w-full py-2.5 bg-[#1E3A5F] text-white text-sm rounded-lg hover:bg-[#2A4D7A] disabled:opacity-50 font-medium">
              {savingMed ? 'Salvando...' : 'Salvar dados clinicos'}
            </button>
          )}

          {detailTab === 'prontuario' && prontuarioSection === 'anamnese' && !loadingAnamnese && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                {anamneseSaveStatus === 'saving' && <span className="text-amber-600">Salvando...</span>}
                {anamneseSaveStatus === 'saved' && <span className="text-emerald-600">Salvo</span>}
                {anamneseSaveStatus === 'unsaved' && <span className="text-amber-500">Nao salvo</span>}
                {anamneseSaveStatus === 'error' && <span className="text-red-600">Erro{anamneseError ? `: ${anamneseError}` : ''}</span>}
              </span>
              <button onClick={handleSaveAnamnese} disabled={savingAnamnese} className="px-6 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                {savingAnamnese ? 'Salvando...' : 'Salvar anamnese'}
              </button>
            </div>
          )}

          {detailTab === 'prescricoes' && showNewPrescricao && (
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowNewPrescricao(false)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={handleAddPrescricao} disabled={savingPrescricao} className="px-6 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                {savingPrescricao ? 'Salvando...' : 'Criar prescricao'}
              </button>
            </div>
          )}

          {detailTab === 'atestados' && showNewAtestado && (
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowNewAtestado(false)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={handleAddAtestado} disabled={savingAtestado} className="px-6 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                {savingAtestado ? 'Emitindo...' : 'Emitir'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Document Preview Modal — portaled to body to escape parent z-index stacking context */}
      {previewDocIndex !== null && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col" onClick={closePreview}>
          <div className="shrink-0 flex items-center justify-between px-6 py-3" onClick={e => e.stopPropagation()}>
            <span className="text-white text-sm font-medium truncate max-w-[60%]">
              {documents[previewDocIndex]?.fileName}
              {documents[previewDocIndex]?.description && <span className="text-white/60 ml-2">— {documents[previewDocIndex].description}</span>}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-white/50 text-xs mr-3">{previewDocIndex + 1} / {documents.filter(isDocPreviewable).length}</span>
              <button onClick={() => handleDownloadDoc(documents[previewDocIndex]?.id)} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Baixar">
                <Download size={20} />
              </button>
              <button onClick={closePreview} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Fechar (Esc)">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center min-h-0 px-16 pb-6" onClick={e => e.stopPropagation()}>
            {previewLoading ? (
              <p className="text-white/70 text-sm">Carregando preview...</p>
            ) : previewUrl && (documents[previewDocIndex]?.fileType || '').startsWith('image/') ? (
              <img src={previewUrl} alt={documents[previewDocIndex]?.fileName} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
            ) : previewUrl && (documents[previewDocIndex]?.fileType || '') === 'application/pdf' ? (
              <iframe src={previewUrl} className="w-full h-full bg-white rounded-lg shadow-2xl" title={documents[previewDocIndex]?.fileName} />
            ) : (
              <p className="text-white/70 text-sm">Preview nao disponivel para este tipo de arquivo.</p>
            )}
          </div>

          {previewDocIndex > 0 && documents.slice(0, previewDocIndex).some(isDocPreviewable) && (
            <button onClick={(e) => { e.stopPropagation(); navigatePreview(-1); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors" title="Anterior">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}
          {previewDocIndex < documents.length - 1 && documents.slice(previewDocIndex + 1).some(isDocPreviewable) && (
            <button onClick={(e) => { e.stopPropagation(); navigatePreview(1); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors" title="Proximo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}
        </div>,
        document.body,
      )}

      {/* Toast notification — portaled to body */}
      {toastMsg && createPortal(
        <div className="fixed bottom-6 right-6 z-[9999] bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in">
          {toastMsg}
        </div>,
        document.body,
      )}
    </div>
  );
}
