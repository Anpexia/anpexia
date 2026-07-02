import { useEffect, useState } from 'react';
import { Plus, ChevronLeft } from 'lucide-react';
import api from '../services/api';

interface Template {
  id: string;
  title: string;
  content: string;
  context: string | null;
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
  return 'bg-violet-50 text-violet-600';
}
function badgeLabel(ctx: string | null): string {
  if (ctx === 'ANAMNESE') return 'Anamnese';
  if (ctx === 'EVOLUCAO') return 'Evolução';
  if (ctx === 'GERAL') return 'Geral';
  return 'Sem contexto';
}

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

/**
 * Seletor de Modelos de Conduta (biblioteca privada do médico logado).
 * Ao escolher, chama onSelect(content) para inserir no campo de texto.
 * Também permite CRIAR um modelo novo sem sair do atendimento (atalho), já
 * pré-preenchido com o texto atual do campo (initialContent).
 */
export function ConductaTemplatePicker({
  onSelect,
  onClose,
  initialContent = '',
}: {
  onSelect: (content: string) => void;
  onClose: () => void;
  initialContent?: string;
}) {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ctx, setCtx] = useState('');
  const [reload, setReload] = useState(0);

  // Modo criação (atalho "+ Novo modelo")
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', context: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (creating) return;
    let cancelled = false;
    setLoading(true);
    const params: any = {};
    if (ctx) params.context = ctx;
    if (search.trim()) params.search = search.trim();
    const t = setTimeout(() => {
      api
        .get('/conducta-templates', { params })
        .then(({ data }) => { if (!cancelled) setItems(data.data || []); })
        .catch(() => { if (!cancelled) setItems([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, ctx, creating, reload]);

  const startCreate = () => {
    setForm({ title: '', context: '', content: initialContent.trim() });
    setError('');
    setCreating(true);
  };

  const saveNew = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Preencha o título e o conteúdo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/conducta-templates', {
        title: form.title.trim(),
        content: form.content,
        context: form.context || null,
      });
      setCreating(false);
      setSearch('');
      setCtx('');
      setReload((r) => r + 1);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Erro ao salvar o modelo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-[9vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[520px] max-w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {creating ? (
          /* ---------- MODO CRIAR (atalho no atendimento) ---------- */
          <>
            <div className="p-4 border-b border-slate-200 flex items-center gap-2">
              <button type="button" onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600" title="Voltar">
                <ChevronLeft size={18} />
              </button>
              <div>
                <h3 className="text-[15px] font-semibold text-[#1E3A5F]">Novo modelo</h3>
                <p className="text-xs text-slate-500 mt-0.5">Salve como modelo para reutilizar depois.</p>
              </div>
            </div>
            <div className="p-4 space-y-3 overflow-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Título</label>
                <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Ex: Anamnese Otorrino" maxLength={120} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contexto (opcional)</label>
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
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className={inputCls + ' min-h-[140px] resize-y'} placeholder="Texto do modelo..." />
                <p className="text-xs text-slate-400 mt-1">Pré-preenchido com o texto do campo — ajuste como quiser.</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="p-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-white">Cancelar</button>
              <button type="button" onClick={saveNew} disabled={saving} className="px-4 py-1.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-semibold hover:bg-[#2A4D7A] disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar modelo'}
              </button>
            </div>
          </>
        ) : (
          /* ---------- MODO LISTA (usar/inserir) ---------- */
          <>
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1E3A5F]">Inserir modelo de conduta</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Seus modelos — clique para inserir no campo.</p>
                </div>
                <button
                  type="button"
                  onClick={startCreate}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1E3A5F] text-white hover:bg-[#2A4D7A] shrink-0"
                >
                  <Plus size={14} /> Novo modelo
                </button>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {CONTEXTS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCtx(c.key)}
                    className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                      ctx === c.key ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-auto p-2 flex-1">
              {loading ? (
                <p className="text-sm text-slate-400 text-center py-8">Carregando...</p>
              ) : items.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-sm text-slate-500">Nenhum modelo encontrado.</p>
                  <button type="button" onClick={startCreate} className="mt-2 text-xs font-semibold text-[#2563EB] hover:underline">Criar um modelo agora</button>
                </div>
              ) : (
                items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onSelect(t.content); onClose(); }}
                    className="w-full text-left p-3 rounded-lg border border-transparent hover:bg-blue-50 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13.5px] font-semibold text-[#1E3A5F]">{t.title}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass(t.context)}`}>{badgeLabel(t.context)}</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-line">{t.content}</p>
                  </button>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-200 flex justify-end bg-slate-50">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-white"
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
