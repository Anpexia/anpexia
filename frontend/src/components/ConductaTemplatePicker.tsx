import { useEffect, useState } from 'react';
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

/**
 * Seletor de Modelos de Conduta (biblioteca privada do médico logado).
 * Ao escolher, chama onSelect(content) para inserir no campo de texto.
 */
export function ConductaTemplatePicker({
  onSelect,
  onClose,
}: {
  onSelect: (content: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ctx, setCtx] = useState('');

  useEffect(() => {
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
  }, [search, ctx]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-[9vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[520px] max-w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-[15px] font-semibold text-[#1E3A5F]">Inserir modelo de conduta</h3>
          <p className="text-xs text-slate-500 mt-0.5">Seus modelos — clique para inserir no campo.</p>
          <input
            autoFocus
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
                  ctx === c.key
                    ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
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
              <p className="text-xs text-slate-400 mt-1">Cadastre seus modelos no menu "Modelos de Conduta".</p>
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
      </div>
    </div>
  );
}
