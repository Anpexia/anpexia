import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import api from '../services/api';

interface TemplateMaterial {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
}

interface ProcedureTemplate {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  materials: TemplateMaterial[];
}

interface ProductOption {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface TussOption {
  id: string;
  code: string;
  description: string;
}

interface MaterialRow {
  productId: string;
  quantity: number;
}

type ModalMode = 'closed' | 'create' | 'edit';

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

export function ProcedureTemplatesTab() {
  const [templates, setTemplates] = useState<ProcedureTemplate[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [tussList, setTussList] = useState<TussOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [selected, setSelected] = useState<ProcedureTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [selectedTuss, setSelectedTuss] = useState<string>('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/procedure-templates');
      setTemplates(data.data || []);
    } catch {
      setToast({ message: 'Erro ao carregar templates', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const { data } = await api.get('/inventory/products', { params: { limit: 500 } });
      const raw = Array.isArray(data?.data) ? data.data : [];
      const items = raw.map((p: any) => ({
        id: p.id,
        name: p.name ?? '(sem nome)',
        quantity: typeof p.quantity === 'number' ? p.quantity : 0,
        unit: p.unit || 'un',
      }));
      setProducts(items);
    } catch (err) {
      console.error('[Templates] Falha ao carregar produtos:', err);
    }
  }, []);

  const fetchTuss = useCallback(async () => {
    try {
      const { data } = await api.get('/tuss/procedures');
      const items = (data.data || []).map((t: any) => ({
        id: t.id,
        code: t.code,
        description: t.description,
      }));
      setTussList(items);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchProducts();
    fetchTuss();
  }, [fetchTemplates, fetchProducts, fetchTuss]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setMaterials([]);
    setSelectedTuss('');
    setSelected(null);
  };

  const openCreate = () => {
    resetForm();
    setModalMode('create');
  };

  const openEdit = (tpl: ProcedureTemplate) => {
    setSelected(tpl);
    setName(tpl.name);
    setDescription(tpl.description || '');
    setMaterials(
      (tpl.materials || []).map((m) => ({ productId: m.productId, quantity: m.quantity })),
    );
    setSelectedTuss('');
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode('closed');
    resetForm();
  };

  const addMaterial = () => {
    setMaterials([...materials, { productId: '', quantity: 1 }]);
  };

  const updateMaterial = (idx: number, patch: Partial<MaterialRow>) => {
    setMaterials(materials.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const removeMaterial = (idx: number) => {
    setMaterials(materials.filter((_, i) => i !== idx));
  };

  const handleTussSelect = (tussId: string) => {
    setSelectedTuss(tussId);
    if (!tussId) return;
    const tuss = tussList.find((t) => t.id === tussId);
    if (tuss) setName(tuss.description);
  };

  const canSave =
    name.trim().length > 0 &&
    materials.length > 0 &&
    materials.every((m) => m.productId && m.quantity > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        materials: materials.map((m) => ({ productId: m.productId, quantity: Number(m.quantity) })),
      };
      if (modalMode === 'create') {
        await api.post('/procedure-templates', payload);
        setToast({ message: 'Template criado com sucesso', type: 'success' });
      } else if (selected) {
        await api.put(`/procedure-templates/${selected.id}`, payload);
        setToast({ message: 'Template atualizado com sucesso', type: 'success' });
      }
      closeModal();
      fetchTemplates();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Erro ao salvar template';
      setToast({ message: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/procedure-templates/${id}`);
      setToast({ message: 'Template excluido', type: 'success' });
      setDeleteConfirm(null);
      fetchTemplates();
    } catch {
      setToast({ message: 'Erro ao excluir template', type: 'error' });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Templates de Procedimentos</h2>
          <p className="text-slate-500 mt-1">Cadastre procedimentos com seus materiais para agilizar o registro</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors shadow-sm"
        >
          <Plus size={18} />
          Novo Template
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Descricao</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Materiais</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-slate-400 text-sm">Carregando...</td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-slate-400 text-sm">Nenhum template cadastrado</td>
              </tr>
            ) : (
              templates.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-800">{tpl.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">{tpl.description || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{tpl.materials.length}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(tpl)}
                        className="p-1.5 text-slate-400 hover:text-[#2563EB] rounded-lg hover:bg-slate-100"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(tpl.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
      {modalMode !== 'closed' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">
                {modalMode === 'create' ? 'Novo Template' : 'Editar Template'}
              </h3>
              <button onClick={closeModal} className="p-1 text-slate-400 hover:text-slate-700 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do Procedimento *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Digite o nome ou selecione um procedimento TUSS abaixo"
                  className={inputCls}
                />
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={selectedTuss}
                    onChange={(e) => handleTussSelect(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Selecionar procedimento TUSS (opcional)</option>
                    {tussList.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.code}] {t.description}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-400 mt-1">Voce pode digitar manualmente ou escolher um procedimento da tabela TUSS para preencher o nome.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descricao</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Informacoes adicionais sobre o procedimento"
                  className={inputCls}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Materiais *</label>
                  <button
                    type="button"
                    onClick={addMaterial}
                    className="flex items-center gap-1 text-sm text-[#2563EB] hover:text-[#1E3A5F]"
                  >
                    <Plus size={14} />
                    Adicionar material
                  </button>
                </div>

                {materials.length === 0 ? (
                  <div className="text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg py-6 text-center">
                    Nenhum material adicionado. Adicione ao menos 1 material para salvar.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {products.length === 0 && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        Nenhum produto carregado do estoque. Verifique se ha produtos cadastrados na aba Produtos.
                      </div>
                    )}
                    {materials.map((m, idx) => (
                      <div key={idx} className="grid grid-cols-[8fr_2fr_auto] gap-2 items-center">
                        <select
                          value={m.productId}
                          onChange={(e) => updateMaterial(idx, { productId: e.target.value })}
                          className={`${inputCls} min-w-0`}
                        >
                          <option value="">Selecione um produto</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.quantity} {p.unit})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={m.quantity}
                          onChange={(e) => updateMaterial(idx, { quantity: Number(e.target.value) })}
                          className={`${inputCls} min-w-0`}
                          placeholder="Qtd"
                        />
                        <button
                          type="button"
                          onClick={() => removeMaterial(idx)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                          title="Remover"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Excluir template?</h3>
            <p className="text-sm text-slate-500 mb-5">Esta acao nao pode ser desfeita.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
