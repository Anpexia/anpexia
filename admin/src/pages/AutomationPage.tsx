import { useState, useEffect, useCallback } from 'react';
import { Zap, Save, X, RefreshCw, Info } from 'lucide-react';
import api from '../services/api';

interface Template {
  id: string;
  key: string;
  name: string;
  trigger: string;
  body: string;
  delayMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  on_new_lead: 'Novo lead criado',
  on_no_response_48h: 'Sem resposta (48h)',
  on_no_response_96h: 'Sem resposta (96h)',
  on_call_scheduled: 'Call agendada',
  on_call_reminder: 'Lembrete de call',
  on_contracted: 'Lead contratou',
  on_onboarding: 'Inicio onboarding',
};

export default function AutomationPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Template>>({});
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const { data } = await api.get('/sales/templates');
      setTemplates(data.data || []);
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleEdit = (template: Template) => {
    setEditingId(template.id);
    setEditForm({
      name: template.name,
      body: template.body,
      delayMinutes: template.delayMinutes,
      isActive: template.isActive,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    try {
      await api.put(`/sales/templates/${id}`, editForm);
      setEditingId(null);
      setEditForm({});
      fetchTemplates();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (template: Template) => {
    try {
      await api.put(`/sales/templates/${template.id}`, {
        isActive: !template.isActive,
      });
      fetchTemplates();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao alterar status');
    }
  };

  const handleSeedTemplates = async () => {
    if (!confirm('Isso vai criar/atualizar os templates padrao. Continuar?')) return;
    setSeeding(true);
    try {
      await api.post('/sales/templates/seed');
      fetchTemplates();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao popular templates');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Automacao de mensagens</h2>
          <p className="text-gray-600 mt-1">
            Templates de mensagens automaticas para o pipeline de vendas
          </p>
        </div>
        <button
          onClick={handleSeedTemplates}
          disabled={seeding}
          className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={seeding ? 'animate-spin' : ''} />
          {seeding ? 'Populando...' : 'Popular templates padrao'}
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex gap-3">
        <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">Como funciona a automacao</p>
          <p>
            As mensagens sao enviadas automaticamente via WhatsApp quando leads mudam de estagio no
            pipeline. Cada template tem um gatilho (trigger) que define quando a mensagem e
            disparada. Voce pode usar variaveis como{' '}
            <code className="bg-blue-100 px-1 rounded">{'{nome}'}</code>,{' '}
            <code className="bg-blue-100 px-1 rounded">{'{empresa}'}</code> e{' '}
            <code className="bg-blue-100 px-1 rounded">{'{segmento}'}</code> no corpo da mensagem.
          </p>
        </div>
      </div>

      {/* Templates Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando templates...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Zap size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm mb-4">
            Nenhum template cadastrado ainda. Clique no botao acima para popular com os templates
            padrao.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  Chave
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  Nome
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  Gatilho
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  Mensagem
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  Delay
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  Ativo
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.id} className="border-b border-gray-100 hover:bg-gray-50">
                  {editingId === tpl.id ? (
                    <>
                      <td className="px-6 py-4 text-xs font-mono text-gray-500">{tpl.key}</td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {TRIGGER_LABELS[tpl.trigger] || tpl.trigger}
                      </td>
                      <td className="px-6 py-4">
                        <textarea
                          value={editForm.body || ''}
                          onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          rows={3}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          value={editForm.delayMinutes ?? 0}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              delayMinutes: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                          min={0}
                        />
                        <span className="text-xs text-gray-400 ml-1">min</span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() =>
                            setEditForm({ ...editForm, isActive: !editForm.isActive })
                          }
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            editForm.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {editForm.isActive ? 'Sim' : 'Nao'}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSave(tpl.id)}
                            disabled={saving}
                            className="text-green-600 hover:text-green-800"
                            title="Salvar"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-gray-400 hover:text-gray-600"
                            title="Cancelar"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 text-xs font-mono text-gray-500">{tpl.key}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{tpl.name}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {TRIGGER_LABELS[tpl.trigger] || tpl.trigger}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                        <p className="truncate" title={tpl.body}>
                          {tpl.body}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {tpl.delayMinutes > 0 ? `${tpl.delayMinutes} min` : 'Imediato'}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggle(tpl)}
                          className={`text-xs font-medium px-2 py-1 rounded cursor-pointer ${
                            tpl.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {tpl.isActive ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleEdit(tpl)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Editar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
