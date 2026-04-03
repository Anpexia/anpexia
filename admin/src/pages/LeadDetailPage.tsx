import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  Building,
  Tag,
  Globe,
  Calendar,
  Star,
  MessageSquare,
  FileText,
  ChevronDown,
  Send,
  UserCheck,
  X,
  Plus,
} from 'lucide-react';
import api from '../services/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STAGES = [
  { key: 'NEW', label: 'Novo', color: 'bg-blue-100 text-blue-800' },
  { key: 'CONTACTED', label: 'Contatado', color: 'bg-yellow-100 text-yellow-800' },
  { key: 'QUALIFIED', label: 'Qualificado', color: 'bg-orange-100 text-orange-800' },
  { key: 'CALL_SCHEDULED', label: 'Call Agendada', color: 'bg-purple-100 text-purple-800' },
  { key: 'CALL_DONE', label: 'Call Realizada', color: 'bg-indigo-100 text-indigo-800' },
  { key: 'PROPOSAL_SENT', label: 'Proposta Enviada', color: 'bg-cyan-100 text-cyan-800' },
  { key: 'NEGOTIATION', label: 'Negociacao', color: 'bg-amber-100 text-amber-800' },
  { key: 'CONTRACTED', label: 'Contratado', color: 'bg-blue-200 text-blue-900' },
  { key: 'ONBOARDING', label: 'Onboarding', color: 'bg-teal-100 text-teal-800' },
  { key: 'ACTIVE', label: 'Ativo', color: 'bg-green-100 text-green-800' },
  { key: 'LOST', label: 'Perdido', color: 'bg-red-100 text-red-800' },
];

function getStageInfo(key: string) {
  return STAGES.find((s) => s.key === key) || { key, label: key, color: 'bg-gray-100 text-gray-800' };
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Note form
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Stage change
  const [changingStage, setChangingStage] = useState(false);

  // Convert modal
  const [showConvert, setShowConvert] = useState(false);
  const [convertForm, setConvertForm] = useState({ ownerName: '', ownerEmail: '', ownerPassword: '' });
  const [converting, setConverting] = useState(false);

  // Proposal modal (placeholder)
  const [showProposal, setShowProposal] = useState(false);

  const fetchLead = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/sales/${id}`);
      setLead(data.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao carregar lead');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  const handleStageChange = async (newStage: string) => {
    setChangingStage(true);
    try {
      await api.patch(`/sales/${id}/stage`, { stage: newStage });
      fetchLead();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao mudar estagio');
    } finally {
      setChangingStage(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/sales/${id}/notes`, { note: noteText.trim() });
      setNoteText('');
      fetchLead();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao adicionar nota');
    } finally {
      setSavingNote(false);
    }
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setConverting(true);
    try {
      await api.post(`/onboarding/convert/${id}`, convertForm);
      alert('Lead convertido em cliente com sucesso!');
      setShowConvert(false);
      fetchLead();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao converter lead');
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Carregando...</div>
    );
  }

  if (error || !lead) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || 'Lead nao encontrado'}</p>
        <button
          onClick={() => navigate('/leads')}
          className="text-sm text-blue-600 hover:underline"
        >
          Voltar para leads
        </button>
      </div>
    );
  }

  const stageInfo = getStageInfo(lead.stage);
  const activities = lead.activities || [];
  const messages = lead.messages || [];
  const proposals = lead.proposals || [];

  return (
    <div>
      {/* Back button + Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/leads')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={16} />
          Voltar para leads
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{lead.name}</h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded ${stageInfo.color}`}>
                {stageInfo.label}
              </span>
            </div>
            {lead.company && (
              <p className="text-gray-600 mt-1 flex items-center gap-1">
                <Building size={16} />
                {lead.company}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {(lead.stage === 'CONTRACTED' || lead.stage === 'ONBOARDING') && (
              <button
                onClick={() => setShowConvert(true)}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-500"
              >
                <UserCheck size={16} />
                Converter em cliente
              </button>
            )}
            <button
              onClick={() => setShowProposal(true)}
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              <FileText size={16} />
              Enviar proposta
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Info + Actions */}
        <div className="space-y-6">
          {/* Info Panel */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Informacoes</h3>
            <div className="space-y-3">
              {lead.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">{lead.phone}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">{lead.email}</span>
                </div>
              )}
              {lead.company && (
                <div className="flex items-center gap-3 text-sm">
                  <Building size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">{lead.company}</span>
                </div>
              )}
              {lead.segment && (
                <div className="flex items-center gap-3 text-sm">
                  <Tag size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">{lead.segment}</span>
                </div>
              )}
              {lead.source && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">{lead.source}</span>
                </div>
              )}
              {lead.score != null && (
                <div className="flex items-center gap-3 text-sm">
                  <Star size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">Score: {lead.score}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Calendar size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">Criado em {formatDate(lead.createdAt)}</span>
              </div>
            </div>

            {/* UTM data */}
            {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Dados UTM
                </h4>
                <div className="space-y-1 text-xs text-gray-600">
                  {lead.utmSource && <p>Source: {lead.utmSource}</p>}
                  {lead.utmMedium && <p>Medium: {lead.utmMedium}</p>}
                  {lead.utmCampaign && <p>Campaign: {lead.utmCampaign}</p>}
                  {lead.utmTerm && <p>Term: {lead.utmTerm}</p>}
                  {lead.utmContent && <p>Content: {lead.utmContent}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Stage Change */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Mudar estagio</h3>
            <div className="relative">
              <select
                value={lead.stage}
                onChange={(e) => handleStageChange(e.target.value)}
                disabled={changingStage}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm appearance-none bg-white pr-8 disabled:opacity-50"
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Add Note */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Adicionar nota</h3>
            <form onSubmit={handleAddNote}>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                rows={3}
                placeholder="Escreva uma anotacao..."
              />
              <button
                type="submit"
                disabled={savingNote || !noteText.trim()}
                className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 w-full justify-center"
              >
                <Plus size={16} />
                {savingNote ? 'Salvando...' : 'Adicionar nota'}
              </button>
            </form>
          </div>
        </div>

        {/* Middle + Right column - Timeline, Proposals, Messages */}
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Historico de atividades</h3>
            {activities.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                Nenhuma atividade registrada ainda.
              </p>
            ) : (
              <div className="space-y-4">
                {[...activities]
                  .sort(
                    (a: any, b: any) =>
                      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                  )
                  .map((act: any, idx: number) => (
                    <div key={act.id || idx} className="flex gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                            act.type === 'STAGE_CHANGE'
                              ? 'bg-blue-100 text-blue-700'
                              : act.type === 'NOTE'
                              ? 'bg-yellow-100 text-yellow-700'
                              : act.type === 'MESSAGE'
                              ? 'bg-green-100 text-green-700'
                              : act.type === 'PROPOSAL'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {act.type === 'STAGE_CHANGE' ? (
                            <Tag size={14} />
                          ) : act.type === 'NOTE' ? (
                            <FileText size={14} />
                          ) : act.type === 'MESSAGE' ? (
                            <MessageSquare size={14} />
                          ) : (
                            <FileText size={14} />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            {act.type === 'STAGE_CHANGE'
                              ? 'Mudanca de estagio'
                              : act.type === 'NOTE'
                              ? 'Nota'
                              : act.type === 'MESSAGE'
                              ? 'Mensagem'
                              : act.type === 'PROPOSAL'
                              ? 'Proposta'
                              : act.type}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDate(act.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{act.description}</p>
                        {act.metadata && act.type === 'STAGE_CHANGE' && (
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                getStageInfo(act.metadata.from).color
                              }`}
                            >
                              {getStageInfo(act.metadata.from).label}
                            </span>
                            <span className="text-xs text-gray-400">→</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                getStageInfo(act.metadata.to).color
                              }`}
                            >
                              {getStageInfo(act.metadata.to).label}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Proposals */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Propostas</h3>
            {proposals.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                Nenhuma proposta enviada ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {proposals.map((prop: any) => (
                  <div
                    key={prop.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {prop.plan || 'Proposta'} — R${' '}
                        {(prop.value || 0).toLocaleString('pt-BR')}
                        /mes
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(prop.createdAt)}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        prop.status === 'ACCEPTED'
                          ? 'bg-green-100 text-green-700'
                          : prop.status === 'REJECTED'
                          ? 'bg-red-100 text-red-700'
                          : prop.status === 'EXPIRED'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {prop.status === 'ACCEPTED'
                        ? 'Aceita'
                        : prop.status === 'REJECTED'
                        ? 'Rejeitada'
                        : prop.status === 'EXPIRED'
                        ? 'Expirada'
                        : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Mensagens</h3>
            {messages.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                Nenhuma mensagem registrada.
              </p>
            ) : (
              <div className="space-y-3">
                {[...messages]
                  .sort(
                    (a: any, b: any) =>
                      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                  )
                  .map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${
                        msg.direction === 'outgoing'
                          ? 'bg-blue-50 border border-blue-100'
                          : 'bg-gray-50 border border-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Send
                            size={12}
                            className={
                              msg.direction === 'outgoing' ? 'text-blue-500' : 'text-gray-500'
                            }
                          />
                          <span className="text-xs font-medium text-gray-600">
                            {msg.direction === 'outgoing' ? 'Enviada' : 'Recebida'} via{' '}
                            {msg.channel || 'whatsapp'}
                          </span>
                        </div>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            msg.status === 'sent'
                              ? 'bg-green-100 text-green-700'
                              : msg.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : msg.status === 'scheduled'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {msg.status === 'sent'
                            ? 'Enviada'
                            : msg.status === 'failed'
                            ? 'Falhou'
                            : msg.status === 'scheduled'
                            ? 'Agendada'
                            : msg.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{msg.body}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(msg.createdAt)}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Convert Modal */}
      {showConvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Converter em cliente</h3>
              <button
                onClick={() => setShowConvert(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Isso vai criar um novo tenant (empresa) na plataforma Anpexia e um usuario owner para o
              cliente.
            </p>
            <form onSubmit={handleConvert} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do responsavel *
                </label>
                <input
                  type="text"
                  value={convertForm.ownerName}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, ownerName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail de acesso *
                </label>
                <input
                  type="email"
                  value={convertForm.ownerEmail}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, ownerEmail: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha inicial *
                </label>
                <input
                  type="password"
                  value={convertForm.ownerPassword}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, ownerPassword: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                  minLength={6}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConvert(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={converting}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {converting ? 'Convertendo...' : 'Converter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Proposal Modal (Placeholder) */}
      {showProposal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Enviar proposta</h3>
              <button
                onClick={() => setShowProposal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="py-8 text-center">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-sm">
                Modulo de propostas em desenvolvimento. Em breve voce podera criar e enviar propostas
                comerciais diretamente por aqui.
              </p>
            </div>
            <button
              onClick={() => setShowProposal(false)}
              className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
