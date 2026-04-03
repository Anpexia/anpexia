import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Phone, Building, Clock, TrendingUp, Users, DollarSign, Target } from 'lucide-react';
import api from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STAGES = [
  { key: 'NEW', label: 'Novo', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { key: 'CONTACTED', label: 'Contatado', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { key: 'QUALIFIED', label: 'Qualificado', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { key: 'CALL_SCHEDULED', label: 'Call Agendada', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { key: 'CALL_DONE', label: 'Call Realizada', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { key: 'PROPOSAL_SENT', label: 'Proposta Enviada', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { key: 'NEGOTIATION', label: 'Negociacao', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'CONTRACTED', label: 'Contratado', color: 'bg-blue-200 text-blue-900 border-blue-400' },
  { key: 'ONBOARDING', label: 'Onboarding', color: 'bg-teal-100 text-teal-800 border-teal-300' },
  { key: 'ACTIVE', label: 'Ativo', color: 'bg-green-100 text-green-800 border-green-300' },
  { key: 'LOST', label: 'Perdido', color: 'bg-red-100 text-red-800 border-red-300' },
];

const SOURCES = [
  'Landing Page',
  'Google Ads',
  'Facebook Ads',
  'WhatsApp',
  'Indicacao',
  'Manual',
];

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function CrmPage() {
  const navigate = useNavigate();
  const [pipeline, setPipeline] = useState<Record<string, any[]>>({});
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStage, setChangingStage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    segment: '',
    source: 'Manual',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [pipelineRes, statsRes] = await Promise.all([
        api.get('/sales/pipeline'),
        api.get('/sales/stats'),
      ]);
      setPipeline(pipelineRes.data.data || {});
      setStats(statsRes.data.data || {});
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/sales', form);
      setShowModal(false);
      setForm({ name: '', phone: '', email: '', company: '', segment: '', source: 'Manual', notes: '' });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao criar lead');
    } finally {
      setSaving(false);
    }
  };

  const handleStageChange = async (leadId: string, newStage: string) => {
    setChangingStage(leadId);
    try {
      await api.patch(`/sales/${leadId}/stage`, { stage: newStage });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao mudar estagio');
    } finally {
      setChangingStage(null);
    }
  };

  const getStageLeads = (stageKey: string): any[] => {
    return pipeline[stageKey] || [];
  };

  const totalLeads = Object.values(pipeline).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leads / CRM</h2>
          <p className="text-gray-600 mt-1">Pipeline de vendas e gestao de leads</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={18} />
          Novo lead
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Users size={20} className="text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total de leads</p>
              <p className="text-xl font-bold text-gray-900">{stats.totalLeads ?? totalLeads}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <TrendingUp size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Leads este mes</p>
              <p className="text-xl font-bold text-gray-900">{stats.leadsThisMonth ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Target size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Taxa de conversao</p>
              <p className="text-xl font-bold text-gray-900">{stats.conversionRate ?? '0'}%</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <DollarSign size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">MRR potencial</p>
              <p className="text-xl font-bold text-gray-900">
                R$ {(stats.mrrPotential ?? 0).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Kanban Pipeline */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando pipeline...</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: `${STAGES.length * 260}px` }}>
            {STAGES.map((stage) => {
              const leads = getStageLeads(stage.key);
              return (
                <div
                  key={stage.key}
                  className="flex-shrink-0 w-[250px] bg-gray-100 rounded-xl"
                >
                  {/* Column Header */}
                  <div className="px-3 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold px-2 py-1 rounded border ${stage.color}`}>
                        {stage.label}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">{leads.length}</span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                    {leads.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Nenhum lead</p>
                    )}
                    {leads.map((lead: any) => (
                      <div
                        key={lead.id}
                        className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-shadow cursor-pointer group"
                        onClick={() => navigate(`/leads/${lead.id}`)}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="text-sm font-medium text-gray-900 truncate flex-1">
                            {lead.name}
                          </h4>
                        </div>
                        {lead.company && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                            <Building size={12} />
                            <span className="truncate">{lead.company}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                            <Phone size={12} />
                            <span>{lead.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
                          <Clock size={12} />
                          <span>
                            {formatDistanceToNow(new Date(lead.createdAt), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                          <span className="ml-auto text-gray-400">
                            {daysSince(lead.createdAt)}d
                          </span>
                        </div>

                        {/* Stage change buttons (visible on hover) */}
                        <div className="mt-2 pt-2 border-t border-gray-100 hidden group-hover:block">
                          <select
                            className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1"
                            value={lead.stage}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleStageChange(lead.id, e.target.value);
                            }}
                            disabled={changingStage === lead.id}
                          >
                            {STAGES.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Novo Lead */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Novo lead</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone *
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Empresa
                  </label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Segmento
                  </label>
                  <input
                    type="text"
                    value={form.segment}
                    onChange={(e) => setForm({ ...form, segment: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Ex: Clinica, Loja..."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Origem
                </label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observacoes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  rows={3}
                  placeholder="Anotacoes iniciais sobre o lead..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Criando...' : 'Criar lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
