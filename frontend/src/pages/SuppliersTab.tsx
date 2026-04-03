import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, Pencil, Trash2, Link2Off } from 'lucide-react';
import api from '../services/api';

interface SupplierProduct {
  id: string;
  productId: string;
  isPrimary: boolean;
  product: { id: string; name: string; sku: string | null };
}

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  notificationMethod: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  autoDispatch: boolean;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  products?: SupplierProduct[];
}

type ModalMode = 'closed' | 'create' | 'edit';

const emptyForm = {
  name: '',
  contactName: '',
  email: '',
  whatsapp: '',
  phone: '',
  notificationMethod: 'WHATSAPP' as 'EMAIL' | 'WHATSAPP' | 'BOTH',
  autoDispatch: false,
  notes: '',
};

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export function SuppliersTab() {
  const [search, setSearch] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [linkedProducts, setLinkedProducts] = useState<SupplierProduct[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const { data } = await api.get('/suppliers', { params });
      setSuppliers(data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchSuppliers, 300);
    return () => clearTimeout(timer);
  }, [fetchSuppliers]);

  const openCreate = () => {
    setFormData(emptyForm);
    setSelectedSupplier(null);
    setLinkedProducts([]);
    setModalMode('create');
  };

  const openEdit = async (s: Supplier) => {
    setFormData({
      name: s.name,
      contactName: s.contactName || '',
      email: s.email || '',
      whatsapp: s.whatsapp || '',
      phone: s.phone || '',
      notificationMethod: s.notificationMethod,
      autoDispatch: s.autoDispatch,
      notes: s.notes || '',
    });
    setSelectedSupplier(s);
    setModalMode('edit');
    try {
      const { data } = await api.get(`/suppliers/${s.id}/products`);
      setLinkedProducts(data.data);
    } catch {
      setLinkedProducts([]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        contactName: formData.contactName || undefined,
        email: formData.email || undefined,
        whatsapp: formData.whatsapp || undefined,
        phone: formData.phone || undefined,
        notificationMethod: formData.notificationMethod,
        autoDispatch: formData.autoDispatch,
        notes: formData.notes || undefined,
      };
      if (modalMode === 'create') {
        await api.post('/suppliers', payload);
        setToast({ message: 'Fornecedor criado com sucesso!', type: 'success' });
      } else {
        await api.put(`/suppliers/${selectedSupplier!.id}`, payload);
        setToast({ message: 'Fornecedor atualizado com sucesso!', type: 'success' });
      }
      setModalMode('closed');
      fetchSuppliers();
    } catch {
      setToast({ message: 'Erro ao salvar fornecedor.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/suppliers/${id}`);
      setDeleteConfirm(null);
      setToast({ message: 'Fornecedor excluido.', type: 'success' });
      fetchSuppliers();
    } catch {
      setToast({ message: 'Erro ao excluir fornecedor.', type: 'error' });
    }
  };

  const handleToggleAutoDispatch = async (s: Supplier) => {
    try {
      await api.put(`/suppliers/${s.id}`, { autoDispatch: !s.autoDispatch });
      fetchSuppliers();
    } catch {
      setToast({ message: 'Erro ao atualizar auto-despacho.', type: 'error' });
    }
  };

  const handleUnlinkProduct = async (supplierProductId: string, productId: string) => {
    if (!selectedSupplier) return;
    try {
      await api.delete(`/suppliers/${selectedSupplier.id}/products/${productId}`);
      setLinkedProducts((prev) => prev.filter((p) => p.id !== supplierProductId));
      setToast({ message: 'Produto desvinculado.', type: 'success' });
    } catch {
      setToast({ message: 'Erro ao desvincular produto.', type: 'error' });
    }
  };

  const notifLabel = (m: string) => {
    if (m === 'EMAIL') return 'Email';
    if (m === 'WHATSAPP') return 'WhatsApp';
    return 'Os dois';
  };

  const notifBadgeCls = (m: string) => {
    if (m === 'EMAIL') return 'bg-blue-100 text-blue-700';
    if (m === 'WHATSAPP') return 'bg-green-100 text-green-700';
    return 'bg-purple-100 text-purple-700';
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Fornecedores</h2>
          <p className="text-slate-500 mt-1">Gerencie seus fornecedores e vincule a produtos</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
          <Plus size={18} />
          Novo fornecedor
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou contato..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Contato</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Email</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">WhatsApp</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden xl:table-cell">Notificacao</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden xl:table-cell">Auto-despacho</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Status</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">Carregando...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">Nenhum fornecedor cadastrado ainda.</td></tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-blue-50/50 even:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-800">{s.name}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">{s.contactName || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">{s.email || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">{s.whatsapp || '-'}</td>
                  <td className="px-6 py-4 hidden xl:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${notifBadgeCls(s.notificationMethod)}`}>
                      {notifLabel(s.notificationMethod)}
                    </span>
                  </td>
                  <td className="px-6 py-4 hidden xl:table-cell">
                    <button
                      onClick={() => handleToggleAutoDispatch(s)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${s.autoDispatch ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${s.autoDispatch ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Editar"><Pencil size={16} /></button>
                      <button onClick={() => setDeleteConfirm(s.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600" title="Excluir"><Trash2 size={16} /></button>
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
            <h3 className="font-semibold text-slate-800 mb-2">Excluir fornecedor?</h3>
            <p className="text-sm text-slate-500 mb-6">Esta acao nao pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">{modalMode === 'create' ? 'Novo fornecedor' : 'Editar fornecedor'}</h3>
              <button onClick={() => setModalMode('closed')} className="text-slate-400 hover:text-slate-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} required />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome do contato</label>
                  <input type="text" value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp</label>
                  <input type="text" value={formData.whatsapp} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })} className={inputCls} placeholder="5511999999999" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                  <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Metodo de notificacao</label>
                  <select value={formData.notificationMethod} onChange={(e) => setFormData({ ...formData, notificationMethod: e.target.value as 'EMAIL' | 'WHATSAPP' | 'BOTH' })} className={inputCls}>
                    <option value="EMAIL">Email</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="BOTH">Os dois</option>
                  </select>
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-700">Auto-despacho</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, autoDispatch: !formData.autoDispatch })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formData.autoDispatch ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${formData.autoDispatch ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-xs text-slate-500">Enviar pedidos automaticamente quando estoque estiver baixo</span>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Observacoes</label>
                  <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={inputCls} rows={3} />
                </div>
              </div>

              {/* Linked products section (edit mode only) */}
              {modalMode === 'edit' && (
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-3">Produtos vinculados</h4>
                  {linkedProducts.length === 0 ? (
                    <p className="text-sm text-slate-400">Nenhum produto vinculado a este fornecedor.</p>
                  ) : (
                    <div className="space-y-2">
                      {linkedProducts.map((lp) => (
                        <div key={lp.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-800">{lp.product.name}</span>
                            {lp.product.sku && <span className="text-xs text-slate-400">({lp.product.sku})</span>}
                            {lp.isPrimary && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">Principal</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUnlinkProduct(lp.id, lp.productId)}
                            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                            title="Desvincular"
                          >
                            <Link2Off size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalMode('closed')} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
