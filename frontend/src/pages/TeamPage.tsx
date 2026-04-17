import { useState, useEffect } from 'react';
import { Users, Plus, X, CheckCircle, UserCheck, UserX, Shield, Edit2, Trash2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  especialidade?: string | null;
  rqe?: string | null;
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
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<'MANAGER' | 'DOCTOR' | 'RECEPTIONIST' | 'FINANCIAL' | 'STOCK' | 'EMPLOYEE'>('RECEPTIONIST');
  const [formEspecialidade, setFormEspecialidade] = useState('');
  const [formRqe, setFormRqe] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Repasse (only visible when editing a DOCTOR)
  const [repasseTypes, setRepasseTypes] = useState<Array<{ id: string; name: string; isDefault: boolean }>>([]);
  const [repasse, setRepasse] = useState<Record<string, number>>({});
  const [loadingRepasse, setLoadingRepasse] = useState(false);

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

  const fetchRepasseTypes = async () => {
    try {
      const { data } = await api.get('/repasse-types');
      setRepasseTypes(data.data || []);
      return data.data || [];
    } catch {
      return [];
    }
  };

  const handleCreate = async () => {
    if (!formName || !formEmail || !formPassword) { showToast('Preencha todos os campos obrigatorios'); return; }
    setSubmitting(true);
    try {
      await api.post('/team', {
        name: formName,
        email: formEmail,
        password: formPassword,
        phone: formPhone || undefined,
        role: formRole,
        especialidade: formRole === 'DOCTOR' ? (formEspecialidade || undefined) : undefined,
        rqe: formRole === 'DOCTOR' ? (formRqe || undefined) : undefined,
      });
      showToast('Membro adicionado!');
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
      if (isOwner) {
        await api.put(`/team/${editMember.id}`, {
          name: formName,
          phone: formPhone || undefined,
          role: formRole,
          especialidade: formRole === 'DOCTOR' ? (formEspecialidade || undefined) : undefined,
          rqe: formRole === 'DOCTOR' ? (formRqe || undefined) : undefined,
        });
      }
      // Save repasse for doctors (OWNER or MANAGER)
      if ((editMember.role === 'DOCTOR' || formRole === 'DOCTOR') && canManage) {
        const repasses = repasseTypes.map((t) => ({
          procedureType: t.name,
          percentage: Number(repasse[t.name]) || 0,
        }));
        await api.put(`/doctors/${editMember.id}/repasse`, { repasses });
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
      const types = await fetchRepasseTypes();
      const map: Record<string, number> = {};
      for (const t of types) {
        map[t.name] = 0;
      }
      const { data } = await api.get(`/doctors/${doctorId}/repasse`);
      for (const r of data.data || []) {
        map[r.procedureType] = r.percentage;
      }
      setRepasse(map);
    } catch {
      setRepasse({});
    } finally {
      setLoadingRepasse(false);
    }
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

  const resetForm = () => { setFormName(''); setFormEmail(''); setFormPassword(''); setFormPhone(''); setFormRole('RECEPTIONIST'); setFormEspecialidade(''); setFormRqe(''); };

  const openEdit = (m: TeamMember) => {
    setEditMember(m);
    setFormName(m.name);
    setFormPhone(m.phone || '');
    setFormRole(m.role === 'OWNER' ? 'MANAGER' : (m.role as any));
    setFormEspecialidade(m.especialidade || '');
    setFormRqe(m.rqe || '');
    if (m.role === 'DOCTOR') {
      loadRepasse(m.id);
    } else {
      setRepasse({});
    }
  };

  const roleLabel: Record<string, string> = { SUPER_ADMIN: 'Super Admin', OWNER: 'Proprietario', MANAGER: 'Gerente', DOCTOR: 'Medico', RECEPTIONIST: 'Recepcionista', FINANCIAL: 'Financeiro', STOCK: 'Estoque', EMPLOYEE: 'Funcionario' };
  const roleBadge: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-700',
    OWNER: 'bg-blue-100 text-[#1E3A5F]',
    MANAGER: 'bg-blue-100 text-blue-700',
    DOCTOR: 'bg-emerald-100 text-emerald-700',
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
        {isOwner && (
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
                          {m.role !== 'OWNER' && (
                            <>
                              {canManage && (
                                <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Editar">
                                  <Edit2 size={15} />
                                </button>
                              )}
                              {isOwner && (
                                <button onClick={() => handleToggle(m.id)} className={`p-1.5 rounded hover:bg-slate-100 ${m.isActive ? 'text-red-500' : 'text-emerald-500'}`} title={m.isActive ? 'Desativar' : 'Ativar'}>
                                  {m.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                                </button>
                              )}
                              {isOwner && (
                                <button onClick={() => setRemoveConfirm(m)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Remover">
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Senha *</label>
                <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                <input value={formPhone} onChange={e => setFormPhone(e.target.value)} className={inputCls} placeholder="5571999999999" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cargo</label>
                <select value={formRole} onChange={e => setFormRole(e.target.value as any)} className={inputCls}>
                  <option value="MANAGER">Gerente</option>
                  <option value="DOCTOR">Medico</option>
                  <option value="RECEPTIONIST">Recepcionista</option>
                  <option value="FINANCIAL">Financeiro</option>
                  <option value="STOCK">Estoque</option>
                  <option value="EMPLOYEE">Funcionario</option>
                </select>
              </div>
              {formRole === 'DOCTOR' && (
                <div className="grid grid-cols-[7fr_3fr] gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Especialidade</label>
                    <input value={formEspecialidade} onChange={e => setFormEspecialidade(e.target.value)} className={inputCls} placeholder="Ex: Oftalmologia" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">RQE</label>
                    <input type="number" value={formRqe} onChange={e => setFormRqe(e.target.value)} className={inputCls} placeholder="Número" />
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-800">Editar Membro</h2>
              <button onClick={() => setEditMember(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {!isOwner && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
                  Apenas o Proprietario pode editar dados basicos. Voce pode ajustar o repasse do medico.
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
                <select value={formRole} onChange={e => setFormRole(e.target.value as any)} disabled={!isOwner} className={inputCls + (!isOwner ? ' bg-slate-50 text-slate-400' : '')}>
                  <option value="MANAGER">Gerente</option>
                  <option value="DOCTOR">Medico</option>
                  <option value="RECEPTIONIST">Recepcionista</option>
                  <option value="FINANCIAL">Financeiro</option>
                  <option value="STOCK">Estoque</option>
                  <option value="EMPLOYEE">Funcionario</option>
                </select>
              </div>

              {(editMember.role === 'DOCTOR' || formRole === 'DOCTOR') && (
                <div className="grid grid-cols-[7fr_3fr] gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Especialidade</label>
                    <input value={formEspecialidade} onChange={e => setFormEspecialidade(e.target.value)} disabled={!isOwner} className={inputCls + (!isOwner ? ' bg-slate-50 text-slate-400' : '')} placeholder="Ex: Oftalmologia" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">RQE</label>
                    <input type="number" value={formRqe} onChange={e => setFormRqe(e.target.value)} disabled={!isOwner} className={inputCls + (!isOwner ? ' bg-slate-50 text-slate-400' : '')} placeholder="Número" />
                  </div>
                </div>
              )}

              {(editMember.role === 'DOCTOR' || formRole === 'DOCTOR') && (
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-800 mb-1">Repasse por tipo de procedimento</h3>
                  <p className="text-xs text-slate-500 mb-3">Percentual do valor do procedimento repassado ao medico.</p>
                  {loadingRepasse ? (
                    <div className="text-xs text-slate-400">Carregando repasses...</div>
                  ) : repasseTypes.length === 0 ? (
                    <div className="text-xs text-slate-400">Nenhum tipo de repasse cadastrado. Configure em Configurações {'>'} Repasse.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {repasseTypes.map((t) => (
                        <div key={t.id}>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            {t.name.charAt(0) + t.name.slice(1).toLowerCase()} %
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={repasse[t.name] ?? 0}
                            onChange={e => setRepasse(r => ({ ...r, [t.name]: Number(e.target.value) }))}
                            className={inputCls}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button onClick={handleUpdate} disabled={submitting}
                className="w-full btn-pill btn-primary justify-center">
                {submitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
