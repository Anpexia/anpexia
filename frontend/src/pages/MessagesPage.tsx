import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, FileText, X, Plus, Pencil, Bot, Settings, Search } from 'lucide-react';
import api from '../services/api';

interface Template {
  id: string;
  name: string;
  type: string;
  body: string;
  isActive: boolean;
}

interface Stats {
  sentToday: number;
  sentThisWeek: number;
  sentTotal: number;
  failedCount: number;
}

interface Message {
  id: string;
  phone: string;
  body: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
  customer?: { name: string } | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface ChatbotConfig {
  id?: string;
  isActive: boolean;
  instanceName: string;
  businessName: string;
  businessDescription: string;
  businessHours: string;
  businessAddress: string;
  businessPhone: string;
  servicesOffered: string;
  priceInfo: string;
  customInstructions: string;
  greetingMessage: string;
  fallbackMessage: string;
  humanHandoffMessage: string;
  allowScheduling: boolean;
}

interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  isActive: boolean;
}

type ActiveTab = 'overview' | 'templates' | 'chatbot';

const defaultChatbotConfig: ChatbotConfig = {
  isActive: false, instanceName: '', businessName: '', businessDescription: '',
  businessHours: '', businessAddress: '', businessPhone: '', servicesOffered: '',
  priceInfo: '', customInstructions: '', greetingMessage: '', fallbackMessage: '',
  humanHandoffMessage: '', allowScheduling: false,
};

const typeLabels: Record<string, string> = {
  APPOINTMENT_REMINDER: 'Lembrete de agendamento',
  RETURN_REMINDER: 'Aviso de retorno',
  BIRTHDAY: 'Aniversario',
  WELCOME: 'Boas-vindas',
  LOW_STOCK_ALERT: 'Alerta de estoque baixo',
  CONFIRMATION: 'Confirmacao',
  POST_SERVICE: 'Pos-servico',
  CUSTOM: 'Personalizada',
};

export function MessagesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<Stats>({ sentToday: 0, sentThisWeek: 0, sentTotal: 0, failedCount: 0 });
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // Send message
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendPhone, setSendPhone] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sendCustomerId, setSendCustomerId] = useState('');
  const [sending, setSending] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

  // Template edit
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', type: 'CUSTOM', body: '', isActive: true });

  // Chatbot
  const [chatbotConfig, setChatbotConfig] = useState<ChatbotConfig>(defaultChatbotConfig);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [savingChatbot, setSavingChatbot] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: '' });

  const fetchData = useCallback(async () => {
    try {
      const [tpl, st, hist] = await Promise.all([
        api.get('/messaging/templates').catch(() => ({ data: { data: [] } })),
        api.get('/messaging/stats').catch(() => ({ data: { data: { sentToday: 0, sentThisWeek: 0, sentTotal: 0, failedCount: 0 } } })),
        api.get('/messaging/history?limit=20').catch(() => ({ data: { data: [] } })),
      ]);
      setTemplates(tpl.data.data);
      setStats(st.data.data);
      setMessages(hist.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchChatbot = useCallback(async () => {
    try {
      const [cfg, fq] = await Promise.all([
        api.get('/chatbot/config').catch(() => ({ data: { data: defaultChatbotConfig } })),
        api.get('/chatbot/faqs').catch(() => ({ data: { data: [] } })),
      ]);
      setChatbotConfig({ ...defaultChatbotConfig, ...cfg.data.data });
      setFaqs(fq.data.data);
    } catch {}
  }, []);

  useEffect(() => { if (activeTab === 'chatbot') fetchChatbot(); }, [activeTab, fetchChatbot]);

  // Search customers for send modal
  useEffect(() => {
    if (!showSendModal) return;
    const timer = setTimeout(async () => {
      try {
        const params: Record<string, string> = {};
        if (customerSearch) params.search = customerSearch;
        const { data } = await api.get('/customers', { params });
        setCustomers(data.data);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [showSendModal, customerSearch]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post('/messaging/send', {
        phone: sendPhone,
        body: sendBody,
        customerId: sendCustomerId || undefined,
      });
      setShowSendModal(false);
      setSendPhone(''); setSendBody(''); setSendCustomerId('');
      fetchData();
      showToast('Mensagem enviada!');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Erro ao enviar mensagem. Verifique se o WhatsApp esta conectado.';
      showToast(msg);
    } finally { setSending(false); }
  };

  const selectCustomerForSend = (c: Customer) => {
    setSendCustomerId(c.id);
    setSendPhone(c.phone || '');
    setCustomerSearch(c.name);
  };

  // Templates
  const openTemplateCreate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', type: 'CUSTOM', body: '', isActive: true });
    setShowTemplateModal(true);
  };

  const openTemplateEdit = (t: Template) => {
    setEditingTemplate(t);
    setTemplateForm({ name: t.name, type: t.type, body: t.body, isActive: t.isActive });
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await api.put(`/messaging/templates/${editingTemplate.id}`, templateForm);
      } else {
        await api.post('/messaging/templates', templateForm);
      }
      setShowTemplateModal(false);
      fetchData();
    } catch {}
  };

  // Chatbot
  const handleSaveChatbot = async () => {
    setSavingChatbot(true);
    try {
      await api.put('/chatbot/config', chatbotConfig);
    } catch {} finally { setSavingChatbot(false); }
  };

  const openFaqCreate = () => {
    setEditingFaq(null);
    setFaqForm({ question: '', answer: '', category: '' });
    setShowFaqModal(true);
  };

  const openFaqEdit = (f: Faq) => {
    setEditingFaq(f);
    setFaqForm({ question: f.question, answer: f.answer, category: f.category || '' });
    setShowFaqModal(true);
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingFaq) {
        await api.put(`/chatbot/faqs/${editingFaq.id}`, faqForm);
      } else {
        await api.post('/chatbot/faqs', { ...faqForm, category: faqForm.category || undefined });
      }
      setShowFaqModal(false);
      fetchChatbot();
    } catch {}
  };

  const handleDeleteFaq = async (id: string) => {
    try {
      await api.delete(`/chatbot/faqs/${id}`);
      fetchChatbot();
    } catch {}
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      SENT: { label: 'Enviada', cls: 'bg-green-100 text-green-700' },
      DELIVERED: { label: 'Entregue', cls: 'bg-green-100 text-green-700' },
      READ: { label: 'Lida', cls: 'bg-blue-100 text-blue-700' },
      FAILED: { label: 'Falhou', cls: 'bg-red-100 text-red-700' },
      PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-700' },
    };
    const st = map[s] || { label: s, cls: 'bg-gray-100 text-gray-600' };
    return <span className={`text-xs px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>;
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Mensagens</h2>
          <p className="text-slate-500 mt-1">Mensagens automaticas via WhatsApp</p>
        </div>
        <button onClick={() => setShowSendModal(true)} className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors">
          <Send size={18} />
          Enviar mensagem
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Enviadas hoje</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.sentToday}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Esta semana</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.sentThisWeek}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-2xl font-bold text-[#1E3A5F] mt-1">{stats.sentTotal}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Falhas</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.failedCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <button onClick={() => setActiveTab('overview')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <MessageSquare size={14} className="inline mr-1.5 -mt-0.5" />Historico
        </button>
        <button onClick={() => setActiveTab('templates')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'templates' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <FileText size={14} className="inline mr-1.5 -mt-0.5" />Templates
        </button>
        <button onClick={() => setActiveTab('chatbot')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'chatbot' ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Bot size={14} className="inline mr-1.5 -mt-0.5" />Chatbot IA
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A5F]" /></div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Historico de envios</h3>
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Nenhuma mensagem enviada ainda.</p>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className="flex items-start justify-between p-3 border border-slate-200 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-800">{m.customer?.name || m.phone}</span>
                          {statusBadge(m.status)}
                        </div>
                        <p className="text-sm text-slate-500 truncate">{m.body}</p>
                      </div>
                      <span className="text-xs text-slate-400 ml-3 whitespace-nowrap">
                        {m.sentAt ? new Date(m.sentAt).toLocaleDateString('pt-BR') : new Date(m.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Templates de mensagem</h3>
                <button onClick={openTemplateCreate} className="flex items-center gap-1.5 text-sm font-medium text-[#1E3A5F] hover:text-[#1E3A5F]">
                  <Plus size={16} />Novo template
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">Variaveis disponiveis: {'{nome}'}, {'{data}'}, {'{hora}'}, {'{empresa}'}</p>
              <div className="space-y-3">
                {templates.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Nenhum template criado. Crie seu primeiro template.</p>
                ) : (
                  templates.map((t) => (
                    <div key={t.id} className="flex items-start justify-between p-4 border border-slate-200 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-800">{t.name}</span>
                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">{typeLabels[t.type] || t.type}</span>
                          {!t.isActive && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded">Inativo</span>}
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{t.body}</p>
                      </div>
                      <button onClick={() => openTemplateEdit(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 ml-3">
                        <Pencil size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Chatbot Tab */}
          {activeTab === 'chatbot' && (
            <div className="space-y-6">
              {/* Config */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Settings size={18} className="text-slate-500" />
                    <h3 className="font-semibold text-slate-800">Configuracao do Chatbot</h3>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm text-slate-500">{chatbotConfig.isActive ? 'Ativo' : 'Inativo'}</span>
                    <div className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${chatbotConfig.isActive ? 'bg-green-500' : 'bg-slate-300'}`} onClick={() => setChatbotConfig({ ...chatbotConfig, isActive: !chatbotConfig.isActive })}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${chatbotConfig.isActive ? 'translate-x-5.5 left-0.5' : 'left-0.5'}`} style={{ transform: chatbotConfig.isActive ? 'translateX(22px)' : 'translateX(0)' }} />
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome do negocio</label>
                    <input type="text" value={chatbotConfig.businessName} onChange={(e) => setChatbotConfig({ ...chatbotConfig, businessName: e.target.value })} className={inputCls} placeholder="Ex: Clinica Vida" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                    <input type="text" value={chatbotConfig.businessPhone} onChange={(e) => setChatbotConfig({ ...chatbotConfig, businessPhone: e.target.value })} className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descricao do negocio</label>
                    <textarea value={chatbotConfig.businessDescription} onChange={(e) => setChatbotConfig({ ...chatbotConfig, businessDescription: e.target.value })} className={inputCls + ' h-20 resize-none'} placeholder="Descreva o que seu negocio faz..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Horario de funcionamento</label>
                    <input type="text" value={chatbotConfig.businessHours} onChange={(e) => setChatbotConfig({ ...chatbotConfig, businessHours: e.target.value })} className={inputCls} placeholder="Ex: Seg-Sex 8h-18h" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Endereco</label>
                    <input type="text" value={chatbotConfig.businessAddress} onChange={(e) => setChatbotConfig({ ...chatbotConfig, businessAddress: e.target.value })} className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Servicos oferecidos</label>
                    <textarea value={chatbotConfig.servicesOffered} onChange={(e) => setChatbotConfig({ ...chatbotConfig, servicesOffered: e.target.value })} className={inputCls + ' h-20 resize-none'} placeholder="Liste os servicos que sua empresa oferece..." />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Informacoes de preco</label>
                    <textarea value={chatbotConfig.priceInfo} onChange={(e) => setChatbotConfig({ ...chatbotConfig, priceInfo: e.target.value })} className={inputCls + ' h-16 resize-none'} placeholder="Precos de servicos/produtos que o bot pode informar..." />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Instrucoes personalizadas para a IA</label>
                    <textarea value={chatbotConfig.customInstructions} onChange={(e) => setChatbotConfig({ ...chatbotConfig, customInstructions: e.target.value })} className={inputCls + ' h-20 resize-none'} placeholder="Instrucoes adicionais para o comportamento do chatbot..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem de boas-vindas</label>
                    <textarea value={chatbotConfig.greetingMessage} onChange={(e) => setChatbotConfig({ ...chatbotConfig, greetingMessage: e.target.value })} className={inputCls + ' h-16 resize-none'} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem de fallback</label>
                    <textarea value={chatbotConfig.fallbackMessage} onChange={(e) => setChatbotConfig({ ...chatbotConfig, fallbackMessage: e.target.value })} className={inputCls + ' h-16 resize-none'} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem de transferencia para humano</label>
                    <textarea value={chatbotConfig.humanHandoffMessage} onChange={(e) => setChatbotConfig({ ...chatbotConfig, humanHandoffMessage: e.target.value })} className={inputCls + ' h-16 resize-none'} />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input type="checkbox" checked={chatbotConfig.allowScheduling} onChange={(e) => setChatbotConfig({ ...chatbotConfig, allowScheduling: e.target.checked })} className="rounded" />
                      Permitir agendamento via chatbot
                    </label>
                  </div>
                </div>

                <div className="mt-6">
                  <button onClick={handleSaveChatbot} disabled={savingChatbot} className="px-6 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">
                    {savingChatbot ? 'Salvando...' : 'Salvar configuracao'}
                  </button>
                </div>
              </div>

              {/* FAQs */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">Perguntas frequentes (FAQ)</h3>
                  <button onClick={openFaqCreate} className="flex items-center gap-1.5 text-sm font-medium text-[#1E3A5F] hover:text-[#1E3A5F]">
                    <Plus size={16} />Nova FAQ
                  </button>
                </div>
                <p className="text-sm text-slate-500 mb-4">O chatbot usa essas perguntas e respostas para responder seus clientes automaticamente.</p>
                {faqs.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Nenhuma FAQ cadastrada.</p>
                ) : (
                  <div className="space-y-3">
                    {faqs.map((f) => (
                      <div key={f.id} className="p-4 border border-slate-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-800">{f.question}</p>
                            <p className="text-sm text-slate-500 mt-1">{f.answer}</p>
                            {f.category && <span className="text-xs text-slate-400 mt-1 inline-block">{f.category}</span>}
                          </div>
                          <div className="flex gap-1 ml-3">
                            <button onClick={() => openFaqEdit(f)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Pencil size={14} /></button>
                            <button onClick={() => handleDeleteFaq(f.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600"><X size={14} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Send Message Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Enviar mensagem</h3>
              <button onClick={() => setShowSendModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setSendCustomerId(''); }} className={inputCls + ' pl-9'} placeholder="Buscar cliente..." />
                </div>
                {customerSearch && !sendCustomerId && customers.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-lg max-h-32 overflow-y-auto">
                    {customers.filter(c => c.phone).map((c) => (
                      <button key={c.id} type="button" onClick={() => selectCustomerForSend(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between">
                        <span>{c.name}</span>
                        <span className="text-slate-400">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefone *</label>
                <input type="tel" value={sendPhone} onChange={(e) => setSendPhone(e.target.value)} className={inputCls} placeholder="5511999999999" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem *</label>
                <textarea value={sendBody} onChange={(e) => setSendBody(e.target.value)} className={inputCls + ' h-28 resize-none'} required placeholder="Digite sua mensagem..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowSendModal(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={sending} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Send size={16} />{sending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">{editingTemplate ? 'Editar template' : 'Novo template'}</h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                <select value={templateForm.type} onChange={(e) => setTemplateForm({ ...templateForm, type: e.target.value })} className={inputCls}>
                  {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem *</label>
                <textarea value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} className={inputCls + ' h-28 resize-none'} required placeholder="Ola {nome}, sua consulta esta confirmada para {data} as {hora}." />
                <p className="text-xs text-slate-400 mt-1">Use {'{nome}'}, {'{data}'}, {'{hora}'}, {'{empresa}'} como variaveis.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={templateForm.isActive} onChange={(e) => setTemplateForm({ ...templateForm, isActive: e.target.checked })} className="rounded" />
                Ativo
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTemplateModal(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A]">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FAQ Modal */}
      {showFaqModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">{editingFaq ? 'Editar FAQ' : 'Nova FAQ'}</h3>
              <button onClick={() => setShowFaqModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveFaq} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pergunta *</label>
                <input type="text" value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} className={inputCls} required placeholder="Ex: Qual o horario de funcionamento?" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Resposta *</label>
                <textarea value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} className={inputCls + ' h-24 resize-none'} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                <input type="text" value={faqForm.category} onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })} className={inputCls} placeholder="Ex: Horarios, Precos, Servicos" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowFaqModal(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A]">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-lg shadow-lg text-sm z-[9999] max-w-sm">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
