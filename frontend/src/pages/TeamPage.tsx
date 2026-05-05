import { useState, useEffect } from 'react';
import { Users, Plus, X, CheckCircle, UserCheck, UserX, Shield, Edit2, Trash2, Clock } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import SpecialtyCombobox from '../components/SpecialtyCombobox';

interface ShiftRange {
  inicio: string;
  fim: string;
}

interface DaySchedule {
  ativo: boolean;
  manha: ShiftRange;
  tarde: ShiftRange;
}

type Horarios = Record<string, DaySchedule>;

const DAY_LABELS: Record<string, string> = {
  dom: 'Domingo', seg: 'Segunda', ter: 'Terca', qua: 'Quarta',
  qui: 'Quinta', sex: 'Sexta', sab: 'Sabado',
};
const DAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const DEFAULT_HORARIOS: Horarios = Object.fromEntries(
  DAY_KEYS.map(k => [k, {
    ativo: ['seg', 'ter', 'qua', 'qui', 'sex'].includes(k),
    manha: { inicio: '08:00', fim: '12:00' },
    tarde: { inicio: '14:00', fim: '18:00' },
  }])
);

function migrateDaySchedule(raw: any): DaySchedule {
  if (!raw || typeof raw !== 'object') return { ativo: false, manha: { inicio: '08:00', fim: '12:00' }, tarde: { inicio: '14:00', fim: '18:00' } };
  if (raw.manha && raw.tarde) return raw as DaySchedule;
  const inicio = raw.inicio || '08:00';
  const fim = raw.fim || '18:00';
  const inicioH = parseInt(inicio.split(':')[0], 10);
  const fimH = parseInt(fim.split(':')[0], 10);
  if (fimH <= 13) return { ativo: Boolean(raw.ativo), manha: { inicio, fim }, tarde: { inicio: '14:00', fim: '18:00' } };
  if (inicioH >= 12) return { ativo: Boolean(raw.ativo), manha: { inicio: '08:00', fim: '12:00' }, tarde: { inicio, fim } };
  return { ativo: Boolean(raw.ativo), manha: { inicio, fim: '12:00' }, tarde: { inicio: '14:00', fim } };
}

function migrateHorarios(raw: any): Horarios {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_HORARIOS };
  const result: Horarios = {};
  for (const key of DAY_KEYS) {
    result[key] = raw[key] ? migrateDaySchedule(raw[key]) : DEFAULT_HORARIOS[key];
  }
  return result;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isProvider?: boolean;
  especialidade?: string | null;
  rqe?: string | null;
  horarios?: Horarios | null;
  duracaoConsulta?: number | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function TeamPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN';
  const canManage = isOwner || user?.role === 'MANAGER';

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<TeamMember | null>(null);
  const [toast, setToast] = useState('');

  // Create form
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<'OWNER' | 'MANAGER' | 'DOCTOR' | 'HEALTH_PROFESSIONAL' | 'NURSE' | 'RECEPTIONIST' | 'FINANCIAL' | 'STOCK' | 'EMPLOYEE'>('RECEPTIONIST');
  const [formIsProvider, setFormIsProvider] = useState(false);
  const [formEspecialidade, setFormEspecialidade] = useState('');
  const [formRqe, setFormRqe] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit modal tab
  const [editTab, setEditTab] = useState<'dados' | 'horarios' | 'repasse_tuss' | 'repasse_particular'>('dados');

  // Doctor schedule
  const [horarios, setHorarios] = useState<Horarios>(DEFAULT_HORARIOS);
  const [duracaoConsulta, setDuracaoConsulta] = useState<number>(30);
  const [savingHorarios, setSavingHorarios] = useState(false);

  // Repasse per procedure
  interface RepasseProcedure { procedureId: string; name: string; code?: string; type: string; value: number | null; percentage: number }
  const [repasseTuss, setRepasseTuss] = useState<RepasseProcedure[]>([]);
  const [repassePrivate, setRepassePrivate] = useState<RepasseProcedure[]>([]);
  const [loadingRepasse, setLoadingRepasse] = useState(false);
  const [repasseSearch, setRepasseSearch] = useState('');
  const [savingRepasse, setSavingRepasse] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/team');
      setMembers(data.data || []);
    } catch { setMembers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const loadRepasseTuss = async (doctorId: string) => {
    try {
      const { data } = await api.get(`/doctors/${doctorId}/repasse/tuss`);
      setRepasseTuss(data.data || []);
    } catch { setRepasseTuss([]); }
  };

  const loadRepassePrivate = async (doctorId: string) => {
    try {
      const { data } = await api.get(`/doctors/${doctorId}/repasse/private`);
      setRepassePrivate(data.data || []);
    } catch { setRepassePrivate([]); }
  };

  const handleCreate = async () => {
    if (!formName || !formEmail) { showToast('Preencha todos os campos obrigatorios'); return; }
    setSubmitting(true);
    try {
      const isProviderRole = formRole === 'DOCTOR' || formRole === 'HEALTH_PROFESSIONAL';
      const providerActive = isProviderRole || formIsProvider;
      await api.post('/team', {
        name: formName,
        email: formEmail,
        phone: formPhone || undefined,
        role: formRole,
        isProvider: providerActive,
        especialidade: providerActive ? (formEspecialidade || undefined) : undefined,
        rqe: providerActive ? (formRqe || undefined) : undefined,
      });
      showToast(`Convite enviado para ${formEmail}. O membro receberá um email para definir sua senha.`);
      setShowCreateModal(false);
      resetForm();
      fetchMembers();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao criar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editMember) return;
    setSubmitting(true);
    try {
      // OWNER can edit basic fields. MANAGER cannot (backend enforces).
      const isProviderRole = formRole === 'DOCTOR' || formRole === 'HEALTH_PROFESSIONAL';
      const providerActive = isProviderRole || formIsProvider;
      if (isOwner) {
        await api.put(`/team/${editMember.id}`, {
          name: formName,
          phone: formPhone || undefined,
          role: formRole,
          isProvider: providerActive,
          especialidade: providerActive ? (formEspecialidade || undefined) : undefined,
          rqe: providerActive ? (formRqe || undefined) : undefined,
        });
      }
      showToast('Membro atualizado!');
      setEditMember(null);
      resetForm();
      fetchMembers();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao atualizar');
    } finally {
      setSubmitting(false);
    }
  };

  const loadRepasse = async (doctorId: string) => {
    setLoadingRepasse(true);
    try {
      await Promise.all([loadRepasseTuss(doctorId), loadRepassePrivate(doctorId)]);
    } catch {} finally {
      setLoadingRepasse(false);
    }
  };

  const handleSaveRepasseTuss = async () => {
    if (!editMember) return;
    setSavingRepasse(true);
    try {
      const repasses = repasseTuss.filter(r => r.percentage > 0).map(r => ({ procedureId: r.procedureId, percentage: r.percentage }));
      await api.put(`/doctors/${editMember.id}/repasse/tuss`, { repasses });
      showToast('Repasse TUSS salvo!');
    } catch { showToast('Erro ao salvar repasse'); }
    finally { setSavingRepasse(false); }
  };

  const handleSaveRepassePrivate = async () => {
    if (!editMember) return;
    setSavingRepasse(true);
    try {
      const repasses = repassePrivate.filter(r => r.percentage > 0).map(r => ({ procedureId: r.procedureId, percentage: r.percentage }));
      await api.put(`/doctors/${editMember.id}/repasse/private`, { repasses });
      showToast('Repasse Particular salvo!');
    } catch { showToast('Erro ao salvar repasse'); }
    finally { setSavingRepasse(false); }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.patch(`/team/${id}/toggle`);
      fetchMembers();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao alterar status');
    }
  };

  const handleRemove = async () => {
    if (!removeConfirm) return;
    try {
      await api.delete(`/team/${removeConfirm.id}`);
      showToast('Membro removido!');
      setRemoveConfirm(null);
      fetchMembers();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao remover');
    }
  };

  const resetForm = () => { setFormName(''); setFormEmail(''); setFormPhone(''); setFormRole('RECEPTIONIST'); setFormIsProvider(false); setFormEspecialidade(''); setFormRqe(''); };

  const openEdit = (m: TeamMember) => {
    setEditMember(m);
    setEditTab('dados');
    setFormName(m.name);
    setFormPhone(m.phone || '');
    setFormRole(m.role as any);
    setFormIsProvider(m.isProvider || false);
    setFormEspecialidade(m.especialidade || '');
    setFormRqe(m.rqe || '');
    const isProviderRole = m.role === 'DOCTOR' || m.role === 'HEALTH_PROFESSIONAL';
    const providerActive = isProviderRole || m.isProvider;
    if (providerActive) {
      loadRepasse(m.id);
      setHorarios(m.horarios ? migrateHorarios(m.horarios) : { ...DEFAULT_HORARIOS });
      setDuracaoConsulta(m.duracaoConsulta || 30);
    } else {
      setRepasseTuss([]);
      setRepassePrivate([]);
      setHorarios({ ...DEFAULT_HORARIOS });
      setDuracaoConsulta(30);
    }
  };

  const handleSaveHorarios = async () => {
    if (!editMember) return;
    setSavingHorarios(true);
    try {
      await api.put(`/team/${editMember.id}/horarios`, { horarios, duracaoConsulta });
      showToast('Horarios atualizados!');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao salvar horarios');
    } finally {
      setSavingHorarios(false);
    }
  };

  const roleLabel: Record<string, string> = { SUPER_ADMIN: 'Super Admin', OWNER: 'Proprietario', MANAGER: 'Gerente', DOCTOR: 'Medico', HEALTH_PROFESSIONAL: 'Prof. Saude', NURSE: 'Enfermeira', RECEPTIONIST: 'Recepcionista', FINANCIAL: 'Financeiro', STOCK: 'Estoque', EMPLOYEE: 'Funcionario' };
  const roleBadge: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-700',
    OWNER: 'bg-blue-100 text-[#1E3A5F]',
    MANAGER: 'bg-blue-100 text-blue-700',
    DOCTOR: 'bg-emerald-100 text-emerald-700',
    HEALTH_PROFESSIONAL: 'bg-teal-100 text-teal-700',
    NURSE: 'bg-pink-100 text-pink-700',
    RECEPTIONIST: 'bg-amber-100 text-amber-700',
    FINANCIAL: 'bg-cyan-100 text-cyan-700',
    STOCK: 'bg-orange-100 text-orange-700',
    EMPLOYEE: 'bg-slate-100 text-slate-700',
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle size={16} /> {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Equipe</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie os membros da sua equipe</p>
        </div>
        {canManage && (
          <button onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="btn-pill btn-primary">
            <Plus size={16} /> Adicionar Membro
          </button>
        )}
      </div>

      {/* Members list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Users size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">Nenhum membro encontrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">E-mail</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">Cargo</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">Ultimo Login</th>
                  {canManage && <th className="text-right px-4 py-3 text-slate-600 font-medium">Acoes</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                    <td className="px-4 py-3 text-slate-600">{m.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[m.role] || roleBadge.EMPLOYEE}`}>
                        {roleLabel[m.role] || m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.isActive ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs"><UserCheck size={14} /> Ativo</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-500 text-xs"><UserX size={14} /> Inativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString('pt-BR') : 'Nunca'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(m.role !== 'OWNER' || isOwner) && canManage && (
                            <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Editar">
                              <Edit2 size={15} />
                            </button>
                          )}
                          {m.role !== 'OWNER' && isOwner && (
                            <button onClick={() => handleToggle(m.id)} className={`p-1.5 rounded hover:bg-slate-100 ${m.isActive ? 'text-red-500' : 'text-emerald-500'}`} title={m.isActive ? 'Desativar' : 'Ativar'}>
                              {m.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                            </button>
                          )}
                          {m.role !== 'OWNER' && isOwner && (
                            <button onClick={() => setRemoveConfirm(m)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Remover">
                              <Trash2 size={15} />
                            </button>
                          )}
                          {m.role === 'OWNER' && <Shield size={15} className="text-[#1E3A5F]" />}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-800">Adicionar Membro</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail *</label>
                <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                <input value={formPhone} onChange={e => setFormPhone(e.target.value)} className={inputCls} placeholder="5571999999999" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cargo</label>
                <select value={formRole} onChange={e => { setFormRole(e.target.value as any); setFormIsProvider(false); }} className={inputCls}>
                  {isOwner && <option value="OWNER">Admin</option>}
                  <option value="MANAGER">Gerente</option>
                  <option value="DOCTOR">Medico</option>
                  <option value="HEALTH_PROFESSIONAL">Profissional da Saude</option>
                  <option value="NURSE">Enfermeira</option>
                  <option value="RECEPTIONIST">Recepcionista</option>
                  <option value="FINANCIAL">Financeiro</option>
                  <option value="STOCK">Estoque</option>
                  <option value="EMPLOYEE">Funcionario</option>
                </select>
              </div>
              {(formRole === 'OWNER' || formRole === 'MANAGER') && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formIsProvider} onChange={e => setFormIsProvider(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]" />
                  <span className="text-sm text-slate-700">Tambem atende pacientes (prestador)</span>
                </label>
              )}
              {(formRole === 'DOCTOR' || formRole === 'HEALTH_PROFESSIONAL' || ((formRole === 'OWNER' || formRole === 'MANAGER') && formIsProvider)) && (
                <div className="grid grid-cols-[7fr_3fr] gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Especialidade</label>
                    <SpecialtyCombobox value={formEspecialidade} onChange={setFormEspecialidade} type={formRole === 'HEALTH_PROFESSIONAL' ? 'health' : 'medical'} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{formRole === 'HEALTH_PROFESSIONAL' ? 'Registro' : 'RQE'}</label>
                    <input type="number" value={formRqe} onChange={e => setFormRqe(e.target.value)} className={inputCls} placeholder="Numero" />
                  </div>
                </div>
              )}
              <button onClick={handleCreate} disabled={submitting}
                className="w-full btn-pill btn-primary justify-center">
                {submitting ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRemoveConfirm(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Remover membro</h2>
            <p className="text-sm text-slate-600 mb-6">
              Tem certeza que deseja remover <strong>{removeConfirm.name}</strong> da equipe? Esta acao nao pode ser desfeita.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRemoveConfirm(null)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">
                Cancelar
              </button>
              <button onClick={handleRemove} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditMember(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Editar Membro</h2>
              <button onClick={() => setEditMember(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            {/* Tabs */}
            {(() => {
              const isProviderRole = formRole === 'DOCTOR' || formRole === 'HEALTH_PROFESSIONAL';
              const providerActive = isProviderRole || formIsProvider;
              return providerActive;
            })() && (
              <div className="border-b border-slate-200 flex gap-1 mb-4 overflow-x-auto">
                {([['dados', 'Dados'], ['horarios', 'Horarios'], ['repasse_tuss', 'Repasse TUSS'], ['repasse_particular', 'Repasse Particular']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => { setEditTab(k); setRepasseSearch(''); }}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${editTab === k ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Tab: Dados */}
              {editTab === 'dados' && (
                <>
                  {!isOwner && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
                      Apenas o Proprietario pode editar dados basicos. Voce pode ajustar horarios e repasse do medico.
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} disabled={!isOwner} className={inputCls + (!isOwner ? ' bg-slate-50 text-slate-400' : '')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                    <input value={editMember.email} disabled className={inputCls + ' bg-slate-50 text-slate-400'} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                    <input value={formPhone} onChange={e => setFormPhone(e.target.value)} disabled={!isOwner} className={inputCls + (!isOwner ? ' bg-slate-50 text-slate-400' : '')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cargo</label>
                    <select value={formRole} onChange={e => { setFormRole(e.target.value as any); setFormIsProvider(false); }} disabled={!isOwner} className={inputCls + (!isOwner ? ' bg-slate-50 text-slate-400' : '')}>
                      {isOwner && <option value="OWNER">Admin</option>}
                      <option value="MANAGER">Gerente</option>
                      <option value="DOCTOR">Medico</option>
                      <option value="HEALTH_PROFESSIONAL">Profissional da Saude</option>
                      <option value="NURSE">Enfermeira</option>
                      <option value="RECEPTIONIST">Recepcionista</option>
                      <option value="FINANCIAL">Financeiro</option>
                      <option value="STOCK">Estoque</option>
                      <option value="EMPLOYEE">Funcionario</option>
                    </select>
                  </div>
                  {(formRole === 'OWNER' || formRole === 'MANAGER') && isOwner && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formIsProvider} onChange={e => setFormIsProvider(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]" />
                      <span className="text-sm text-slate-700">Tambem atende pacientes (prestador)</span>
                    </label>
                  )}
                  {(formRole === 'DOCTOR' || formRole === 'HEALTH_PROFESSIONAL' || ((formRole === 'OWNER' || formRole === 'MANAGER') && formIsProvider)) && (
                    <div className="grid grid-cols-[7fr_3fr] gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Especialidade</label>
                        <SpecialtyCombobox value={formEspecialidade} onChange={setFormEspecialidade} type={formRole === 'HEALTH_PROFESSIONAL' ? 'health' : 'medical'} disabled={!isOwner} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{formRole === 'HEALTH_PROFESSIONAL' ? 'Registro' : 'RQE'}</label>
                        <input type="number" value={formRqe} onChange={e => setFormRqe(e.target.value)} disabled={!isOwner} className={inputCls + (!isOwner ? ' bg-slate-50 text-slate-400' : '')} placeholder="Numero" />
                      </div>
                    </div>
                  )}
                  <button onClick={handleUpdate} disabled={submitting}
                    className="w-full btn-pill btn-primary justify-center">
                    {submitting ? 'Salvando...' : 'Salvar'}
                  </button>
                </>
              )}

              {/* Tab: Horarios */}
              {editTab === 'horarios' && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={18} className="text-slate-600" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Dias e horarios de atendimento</h3>
                      <p className="text-xs text-slate-500">Configure os dias, horarios e duracao de consulta deste medico.</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 mb-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Duracao da consulta (minutos)</label>
                    <input type="number" min="5" max="240" step="5"
                      value={duracaoConsulta}
                      onChange={e => setDuracaoConsulta(Number(e.target.value) || 30)}
                      className="w-32 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                  </div>

                  <div className="space-y-3">
                    {DAY_KEYS.map(day => {
                      const d = horarios[day] || DEFAULT_HORARIOS[day];
                      return (
                        <div key={day} className={`p-3 rounded-lg border ${d.ativo ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                          <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input type="checkbox" checked={d.ativo}
                              onChange={e => setHorarios(h => ({ ...h, [day]: { ...d, ativo: e.target.checked } }))}
                              className="w-4 h-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]" />
                            <span className={`text-sm font-medium ${d.ativo ? 'text-slate-800' : 'text-slate-400'}`}>{DAY_LABELS[day]}</span>
                          </label>
                          {d.ativo && (
                            <div className="ml-6 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-500 w-12">Manha</span>
                                <input type="time" value={d.manha.inicio}
                                  onChange={e => setHorarios(h => ({ ...h, [day]: { ...d, manha: { ...d.manha, inicio: e.target.value } } }))}
                                  className="px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                                <span className="text-slate-400 text-xs">ate</span>
                                <input type="time" value={d.manha.fim}
                                  onChange={e => setHorarios(h => ({ ...h, [day]: { ...d, manha: { ...d.manha, fim: e.target.value } } }))}
                                  className="px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-amber-600 w-12">Almoco</span>
                                <input type="time" value={d.manha.fim}
                                  onChange={e => setHorarios(h => ({ ...h, [day]: { ...d, manha: { ...d.manha, fim: e.target.value } } }))}
                                  className="px-2 py-1 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50" />
                                <span className="text-slate-400 text-xs">ate</span>
                                <input type="time" value={d.tarde.inicio}
                                  onChange={e => setHorarios(h => ({ ...h, [day]: { ...d, tarde: { ...d.tarde, inicio: e.target.value } } }))}
                                  className="px-2 py-1 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-500 w-12">Tarde</span>
                                <input type="time" value={d.tarde.inicio}
                                  onChange={e => setHorarios(h => ({ ...h, [day]: { ...d, tarde: { ...d.tarde, inicio: e.target.value } } }))}
                                  className="px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                                <span className="text-slate-400 text-xs">ate</span>
                                <input type="time" value={d.tarde.fim}
                                  onChange={e => setHorarios(h => ({ ...h, [day]: { ...d, tarde: { ...d.tarde, fim: e.target.value } } }))}
                                  className="px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={handleSaveHorarios} disabled={savingHorarios}
                    className="w-full btn-pill btn-primary justify-center">
                    {savingHorarios ? 'Salvando...' : 'Salvar Horarios'}
                  </button>
                </>
              )}

              {/* Tab: Repasse TUSS */}
              {editTab === 'repasse_tuss' && (
                <>
                  <p className="text-xs text-slate-500 mb-3">Percentual de repasse por procedimento TUSS.</p>
                  {loadingRepasse ? (
                    <div className="text-xs text-slate-400 py-4">Carregando...</div>
                  ) : repasseTuss.length === 0 ? (
                    <div className="text-xs text-slate-400 py-4">Nenhum procedimento TUSS cadastrado.</div>
                  ) : (
                    <>
                      <input type="text" value={repasseSearch} onChange={e => setRepasseSearch(e.target.value)}
                        placeholder="Buscar procedimento..." className={inputCls + ' mb-3'} />
                      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                        {repasseTuss
                          .filter(r => !repasseSearch || r.name.toLowerCase().includes(repasseSearch.toLowerCase()) || r.code?.includes(repasseSearch))
                          .map(r => (
                          <div key={r.procedureId} className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-800 truncate">{r.code ? `${r.code} - ` : ''}{r.name}</p>
                              <p className="text-xs text-slate-400">R$ {(r.value ?? 0).toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <input type="number" min="0" max="100" step="0.5"
                                value={r.percentage}
                                onChange={e => setRepasseTuss(prev => prev.map(p => p.procedureId === r.procedureId ? { ...p, percentage: Number(e.target.value) || 0 } : p))}
                                className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                              <span className="text-xs text-slate-500">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <button onClick={handleSaveRepasseTuss} disabled={savingRepasse}
                    className="w-full btn-pill btn-primary justify-center mt-3">
                    {savingRepasse ? 'Salvando...' : 'Salvar Repasse TUSS'}
                  </button>
                </>
              )}

              {/* Tab: Repasse Particular */}
              {editTab === 'repasse_particular' && (
                <>
                  <p className="text-xs text-slate-500 mb-3">Percentual de repasse por procedimento particular.</p>
                  {loadingRepasse ? (
                    <div className="text-xs text-slate-400 py-4">Carregando...</div>
                  ) : repassePrivate.length === 0 ? (
                    <div className="text-xs text-slate-400 py-4">Nenhum procedimento particular cadastrado.</div>
                  ) : (
                    <>
                      <input type="text" value={repasseSearch} onChange={e => setRepasseSearch(e.target.value)}
                        placeholder="Buscar procedimento..." className={inputCls + ' mb-3'} />
                      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                        {repassePrivate
                          .filter(r => !repasseSearch || r.name.toLowerCase().includes(repasseSearch.toLowerCase()))
                          .map(r => (
                          <div key={r.procedureId} className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-800 truncate">{r.name}</p>
                              <p className="text-xs text-slate-400">{r.value ? `R$ ${r.value.toFixed(2)}` : 'Sem valor definido'}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <input type="number" min="0" max="100" step="0.5"
                                value={r.percentage}
                                onChange={e => setRepassePrivate(prev => prev.map(p => p.procedureId === r.procedureId ? { ...p, percentage: Number(e.target.value) || 0 } : p))}
                                className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                              <span className="text-xs text-slate-500">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <button onClick={handleSaveRepassePrivate} disabled={savingRepasse}
                    className="w-full btn-pill btn-primary justify-center mt-3">
                    {savingRepasse ? 'Salvando...' : 'Salvar Repasse Particular'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
