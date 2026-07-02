import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, X, FileText } from 'lucide-react';
import api from '../services/api';

interface Template {
  id: string;
  title: string;
  content: string;
  context: string | null;
  updatedAt: string;
}

const CONTEXTS = [
  { key: '', label: 'Todos' },
  { key: 'ANAMNESE', label: 'Anamnese' },
  { key: 'EVOLUCAO', label: 'Evolução' },
  { key: 'GERAL', label: 'Geral' },
];

function badgeClass(ctx: string | null): string {
  if (ctx === 'ANAMNESE') return 'bg-emerald-50 text-emerald-600';
  if (ctx === 'EVOLUCAO') return 'bg-blue-50 text-blue-600';
  if (ctx === 'GERAL') return 'bg-violet-50 text-violet-600';
  return 'bg-slate-100 text-slate-500';
}
function badgeLabel(ctx: string | null): string {
  const f = CONTEXTS.find((c) => c.key === ctx);
  return f && f.key ? f.label : 'Sem contexto';
}

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';
const emptyForm = { title: '', context: '', content: '' };

export function ModelosPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCtx, setFilterCtx] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterCtx) params.context = filterCtx;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/conducta-templates', { params });
      setItems(data.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterCtx]);

  useEffect(() => {
    const t = setTimeout(fetchItems, 250);
    return () => clearTimeout(t);
  }, [fetchItems]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setError(''); setModalOpen(true); };
  const openEdit = (t: Template) => {
    setEditingId(t.id);
    setForm({ title: t.title, context: t.context || '', content: t.content });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Preencha o título e o conteúdo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content,
        context: form.context || null,
      };
      if (editingId) await api.put(`/conducta-templates/${editingId}`, payload);
      else await api.post('/conducta-templates', payload);
      setModalOpen(false);
      fetchItems();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Erro ao salvar o modelo.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Template) => {
    if (!window.confirm(`Excluir o modelo "${t.title}"?`)) return;
    try {
      await api.delete(`/conducta-templates/${t.id}`);
      fetchItems();
    } catch {
      /* silencioso */
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-[#1E3A5F]">Modelos de Conduta</h1>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-semibold hover:bg-[#2A4D7A]">
          <Plus size={16} /> Novo modelo
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-5">Seus modelos são privados — só você vê e edita. Insira-os com um clique nos campos de texto livre do atendimento.</p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou conteúdo..."
            className={inputCls + ' pl-9'}
          />
        </div>
        <div className="flex gap-1.5">
          {CONTEXTS.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilterCtx(c.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                filterCtx === c.key ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-16 text-center">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <FileText size={28} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Nenhum modelo cadastrado ainda.</p>
          <button onClick={openNew} className="mt-3 text-sm font-semibold text-[#2563EB] hover:underline">Criar meu primeiro modelo</button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((t) => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between gap-4 hover:border-blue-300 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-[#1E3A5F] truncate">{t.title}</h3>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${badgeClass(t.context)}`}>{badgeLabel(t.context)}</span>
                </div>
                <p className="text-xs text-slate-500 whitespace-pre-line line-clamp-2">{t.content}</p>
              </div>
              <div className="flex items-start gap-1 shrink-0">
                <button onClick={() => openEdit(t)} title="Editar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil size={15} /></button>
                <button onClick={() => remove(t)} title="Excluir" className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[7vh] px-4" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="w-[560px] max-w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-[15px] font-semibold text-[#1E3A5F]">{editingId ? 'Editar modelo' : 'Novo modelo'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Título</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Ex: Anamnese Otorrino" maxLength={120} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contexto (opcional — filtra no seletor)</label>
                <div className="flex gap-1.5">
                  {CONTEXTS.filter((c) => c.key).map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setForm({ ...form, context: form.context === c.key ? '' : c.key })}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                        form.context === c.key ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Conteúdo</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className={inputCls + ' min-h-[160px] resize-y'} placeholder="Texto do modelo..." />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200 bg-slate-50">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-white">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-semibold hover:bg-[#2A4D7A] disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar modelo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
