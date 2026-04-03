import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, X, Pencil, Trash2, Copy, Check, ArrowLeft, Calendar, FlaskConical, Pill, DollarSign, MapPin, HelpCircle, AlertTriangle, FileText } from 'lucide-react';
import api from '../services/api';

interface Category {
  id: string;
  name: string;
  icon: string;
  order: number;
  _count: { scripts: number };
}

interface Script {
  id: string;
  categoryId: string;
  title: string;
  content: string;
  tags: string[];
  category: { id: string; name: string; icon: string };
}

type ModalMode = 'closed' | 'create-script' | 'edit-script' | 'create-category';

const iconMap: Record<string, React.ElementType> = {
  Calendar, FlaskConical, Pill, DollarSign, MapPin, HelpCircle, AlertTriangle, FileText,
};

const categoryColors: Record<string, string> = {
  'Agendamento': 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  'Exames': 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
  'Medicamentos e Receitas': 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  'Valores e Convenios': 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  'Localizacao e Horarios': 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
  'Duvidas Frequentes': 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
  'Urgencias e Emergencias': 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
};

const defaultCategoryColor = 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100';

const emptyScriptForm = { title: '', content: '', categoryId: '', tags: '' };
const emptyCategoryForm = { name: '', icon: 'FileText' };

export function ScriptsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [scriptForm, setScriptForm] = useState(emptyScriptForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'script' | 'category'; id: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/scripts/categories');
      setCategories(data.data);
    } catch {}
  }, []);

  const fetchScripts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (selectedCategory) params.categoryId = selectedCategory;
      const { data } = await api.get('/scripts', { params });
      setScripts(data.data);
    } catch {}
  }, [search, selectedCategory]);

  useEffect(() => {
    fetchCategories().finally(() => setLoading(false));
  }, [fetchCategories]);

  useEffect(() => {
    const timer = setTimeout(fetchScripts, 300);
    return () => clearTimeout(timer);
  }, [fetchScripts]);

  const handleCopy = (script: Script) => {
    navigator.clipboard.writeText(script.content);
    setCopiedId(script.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openCreateScript = () => {
    setScriptForm({ ...emptyScriptForm, categoryId: selectedCategory || '' });
    setEditingScript(null);
    setModalMode('create-script');
  };

  const openEditScript = (s: Script) => {
    setScriptForm({ title: s.title, content: s.content, categoryId: s.categoryId, tags: s.tags.join(', ') });
    setEditingScript(s);
    setModalMode('edit-script');
  };

  const openCreateCategory = () => {
    setCategoryForm(emptyCategoryForm);
    setModalMode('create-category');
  };

  const handleSaveScript = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: scriptForm.title,
        content: scriptForm.content,
        categoryId: scriptForm.categoryId,
        tags: scriptForm.tags ? scriptForm.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [],
      };
      if (modalMode === 'create-script') {
        await api.post('/scripts', payload);
      } else {
        await api.put(`/scripts/${editingScript!.id}`, payload);
      }
      setModalMode('closed');
      fetchScripts();
      fetchCategories();
    } catch {} finally { setSaving(false); }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/scripts/categories', categoryForm);
      setModalMode('closed');
      fetchCategories();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'script') {
        await api.delete(`/scripts/${deleteConfirm.id}`);
      } else {
        await api.delete(`/scripts/categories/${deleteConfirm.id}`);
      }
      setDeleteConfirm(null);
      fetchScripts();
      fetchCategories();
    } catch {}
  };

  const handleSeedScripts = async () => {
    setSeeding(true);
    try {
      await api.post('/scripts/seed');
      fetchCategories();
      fetchScripts();
    } catch {} finally { setSeeding(false); }
  };

  const getIcon = (iconName: string) => {
    const Icon = iconMap[iconName] || FileText;
    return <Icon size={24} />;
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  const filteredScripts = scripts;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Scripts de Atendimento</h2>
          <p className="text-slate-500 mt-1">Base de conhecimento para atendimento ao paciente</p>
        </div>
        <div className="flex gap-2">
          {categories.length === 0 && !loading && (
            <button onClick={handleSeedScripts} disabled={seeding} className="flex items-center gap-2 px-4 py-2.5 border border-indigo-300 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors disabled:opacity-50">
              {seeding ? 'Criando...' : 'Carregar scripts padrao'}
            </button>
          )}
          <button onClick={openCreateCategory} className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            <Plus size={18} />
            Nova categoria
          </button>
          <button onClick={openCreateScript} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus size={18} />
            Novo script
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar em todos os scripts..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <>
          {/* Categories Grid */}
          {!selectedCategory && !search && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
              {categories.map((cat) => {
                const colorCls = categoryColors[cat.name] || defaultCategoryColor;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border transition-all ${colorCls}`}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'category', id: cat.id }); }}
                      className="absolute top-2 right-2 p-1 rounded hover:bg-black/10 text-current opacity-40 hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                    {getIcon(cat.icon)}
                    <span className="font-medium text-sm text-center">{cat.name}</span>
                    <span className="text-xs opacity-70">{cat._count.scripts} scripts</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Back to categories + category header */}
          {(selectedCategory || search) && (
            <div className="flex items-center gap-3 mb-6">
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  <ArrowLeft size={16} />
                  Todas as categorias
                </button>
              )}
              {selectedCategory && (
                <span className="text-sm text-slate-500">
                  {categories.find(c => c.id === selectedCategory)?.name}
                </span>
              )}
              {search && (
                <span className="text-sm text-slate-500">
                  {filteredScripts.length} resultado(s) para "{search}"
                </span>
              )}
            </div>
          )}

          {/* Scripts List */}
          {(selectedCategory || search) && (
            <div className="space-y-3">
              {filteredScripts.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                  <FileText size={40} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">Nenhum script encontrado.</p>
                  <button onClick={openCreateScript} className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                    Criar novo script
                  </button>
                </div>
              ) : (
                filteredScripts.map((s) => (
                  <div key={s.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Script Header */}
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedScript(expandedScript === s.id ? null : s.id)}
                    >
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-800">{s.title}</h4>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {s.category.name}
                          </span>
                          {s.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleCopy(s)}
                          className={`p-2 rounded-lg transition-colors ${copiedId === s.id ? 'bg-green-50 text-green-600' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`}
                          title="Copiar texto"
                        >
                          {copiedId === s.id ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                        <button
                          onClick={() => openEditScript(s)}
                          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'script', id: s.id })}
                          className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Script Content (expanded) */}
                    {expandedScript === s.id && (
                      <div className="px-5 pb-4 border-t border-slate-100">
                        <div className="mt-3 p-4 bg-slate-50 rounded-lg">
                          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">
                            {s.content}
                          </pre>
                        </div>
                        <div className="flex justify-end mt-3">
                          <button
                            onClick={() => handleCopy(s)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${copiedId === s.id ? 'bg-green-100 text-green-700' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                          >
                            {copiedId === s.id ? <><Check size={16} /> Copiado!</> : <><Copy size={16} /> Copiar texto</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Empty state — no categories */}
          {!selectedCategory && !search && categories.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
              <FileText size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="font-semibold text-slate-800 mb-2">Nenhum script cadastrado</h3>
              <p className="text-sm text-slate-500 mb-6">Carregue os scripts padrao para clinica ou crie os seus do zero.</p>
              <div className="flex justify-center gap-3">
                <button onClick={handleSeedScripts} disabled={seeding} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {seeding ? 'Criando...' : 'Carregar scripts padrao'}
                </button>
                <button onClick={openCreateCategory} className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Criar do zero
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Script Modal */}
      {(modalMode === 'create-script' || modalMode === 'edit-script') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">{modalMode === 'create-script' ? 'Novo script' : 'Editar script'}</h3>
              <button onClick={() => setModalMode('closed')} className="text-slate-400 hover:text-slate-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveScript} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoria *</label>
                <select value={scriptForm.categoryId} onChange={(e) => setScriptForm({ ...scriptForm, categoryId: e.target.value })} className={inputCls} required>
                  <option value="">Selecione...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Titulo *</label>
                <input type="text" value={scriptForm.title} onChange={(e) => setScriptForm({ ...scriptForm, title: e.target.value })} className={inputCls} placeholder="Ex: Paciente pergunta sobre resultado de exame" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Script completo *</label>
                <textarea value={scriptForm.content} onChange={(e) => setScriptForm({ ...scriptForm, content: e.target.value })} className={`${inputCls} min-h-[200px]`} placeholder="Digite o texto que a atendente deve ler/falar..." required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tags (separadas por virgula)</label>
                <input type="text" value={scriptForm.tags} onChange={(e) => setScriptForm({ ...scriptForm, tags: e.target.value })} className={inputCls} placeholder="Ex: agendar, consulta, marcar" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalMode('closed')} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Category Modal */}
      {modalMode === 'create-category' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Nova categoria</h3>
              <button onClick={() => setModalMode('closed')} className="text-slate-400 hover:text-slate-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                <input type="text" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} className={inputCls} placeholder="Ex: Procedimentos" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Icone</label>
                <select value={categoryForm.icon} onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })} className={inputCls}>
                  <option value="FileText">Documento</option>
                  <option value="Calendar">Calendario</option>
                  <option value="FlaskConical">Laboratorio</option>
                  <option value="Pill">Medicamento</option>
                  <option value="DollarSign">Financeiro</option>
                  <option value="MapPin">Localizacao</option>
                  <option value="HelpCircle">Duvidas</option>
                  <option value="AlertTriangle">Urgencia</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalMode('closed')} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Salvando...' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-slate-800 mb-2">
              Excluir {deleteConfirm.type === 'script' ? 'script' : 'categoria'}?
            </h3>
            <p className="text-sm text-slate-500 mb-6">Esta acao nao pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
