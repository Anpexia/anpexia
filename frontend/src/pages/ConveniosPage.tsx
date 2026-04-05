import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, Shield, ToggleLeft, ToggleRight, Pencil, Trash2 } from 'lucide-react';
import api from '../services/api';

interface Convenio {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  createdAt: string;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

export function ConveniosPage() {
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', codigo: '', ativo: true });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/convenios');
      setConvenios(data.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSeed = async () => {
    try {
      await api.post('/convenios/seed');
      await fetch();
      showToast('Convenios padrao criados!');
    } catch { showToast('Erro ao criar convenios padrao'); }
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { showToast('Nome e obrigatorio'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/convenios/${editId}`, form);
        showToast('Convenio atualizado!');
      } else {
        await api.post('/convenios', form);
        showToast('Convenio criado!');
      }
      setShowModal(false);
      setEditId(null);
      setForm({ nome: '', codigo: '', ativo: true });
      await fetch();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleToggle = async (c: Convenio) => {
    try {
      await api.put(`/convenios/${c.id}`, { ativo: !c.ativo });
      await fetch();
    } catch { showToast('Erro ao alterar status'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/convenios/${id}`);
      setDeleteConfirm(null);
      await fetch();
      showToast('Convenio removido!');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao remover');
    }
  };

  const openEdit = (c: Convenio) => {
    setEditId(c.id);
    setForm({ nome: c.nome, codigo: c.codigo || '', ativo: c.ativo });
    setShowModal(true);
  };

  const filtered = convenios.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.codigo && c.codigo.includes(search))
  );

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Convenios</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie os convenios aceitos pela clinica</p>
        </div>
        <div className="flex gap-2">
          {convenios.length === 0 && !loading && (
            <button onClick={handleSeed} className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              Carregar padrao
            </button>
          )}
          <button onClick={() => { setEditId(null); setForm({ nome: '', codigo: '', ativo: true }); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A]">
            <Plus size={16} /> Adicionar Convenio
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou codigo..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Shield size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">{search ? 'Nenhum convenio encontrado' : 'Nenhum convenio cadastrado'}</p>
          {!search && <p className="text-xs text-slate-400 mt-1">Clique em "Carregar padrao" para adicionar os principais</p>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Nome</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Codigo</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Status</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className={c.ativo ? 'text-blue-500' : 'text-slate-300'} />
                      <span className="text-sm font-medium text-slate-800">{c.nome}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{c.codigo || '-'}</td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => handleToggle(c)} title={c.ativo ? 'Desativar' : 'Ativar'}>
                      {c.ativo ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <ToggleRight size={20} /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                          <ToggleLeft size={20} /> Inativo
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-[#1E3A5F]" title="Editar">
                        <Pencil size={14} />
                      </button>
                      {deleteConfirm === c.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(c.id)} className="text-xs text-red-600 font-medium">Confirmar</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-xs text-slate-400">Cancelar</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(c.id)} className="p-1.5 text-slate-400 hover:text-red-500" title="Remover">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{editId ? 'Editar Convenio' : 'Novo Convenio'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                <input type="text" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className={inputCls} placeholder="Ex: Unimed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Codigo da operadora</label>
                <input type="text" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} className={inputCls} placeholder="Ex: 000701" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-700">Ativo</label>
                <button type="button" onClick={() => setForm({ ...form, ativo: !form.ativo })}>
                  {form.ativo ? <ToggleRight size={28} className="text-emerald-500" /> : <ToggleLeft size={28} className="text-slate-300" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                {saving ? 'Salvando...' : editId ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
