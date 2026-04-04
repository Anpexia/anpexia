import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import axios from 'axios';
import {
  Zap, Users, Package, MessageSquare, BarChart3,
  CheckCircle, Phone, Mail, Send,
  Clock, TrendingDown, Brain, Bot, Calendar,
  Menu, X, Shield, Star, ArrowRight
} from 'lucide-react';
import SchedulingPage from './pages/SchedulingPage';

const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '';
const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'contato@anpexia.com.br';
const whatsappLink = `https://wa.me/${whatsappNumber}`;
const PROD_API_URL = 'https://backend-production-e9a8.up.railway.app/api/v1';
const apiUrl =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname.includes('vercel.app') ? PROD_API_URL : '/api/v1');

function LandingPage() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Capture UTM params
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source') || '';
  const utmMedium = params.get('utm_medium') || '';
  const utmCampaign = params.get('utm_campaign') || '';
  const utmContent = params.get('utm_content') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${apiUrl}/sales/capture`, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        notes: formData.message,
        source: 'landing_page',
        utmSource: utmSource || undefined,
        utmMedium: utmMedium || undefined,
        utmCampaign: utmCampaign || undefined,
        utmContent: utmContent || undefined,
      }).catch(() => {
        // If API is not available, still show success
      });
      setSubmitted(true);
      setFormData({ name: '', email: '', phone: '', message: '' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/90 backdrop-blur-sm border-b border-gray-100 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <img src="/anpexia-logo.svg" alt="Anpexia" className="h-8" />
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#beneficios" className="text-gray-600 hover:text-[#1E3A5F] transition-colors">Benefícios</a>
            <a href="#recursos" className="text-gray-600 hover:text-[#1E3A5F] transition-colors">Recursos</a>
            <a href="#planos" className="text-gray-600 hover:text-[#1E3A5F] transition-colors">Planos</a>
            <a href="#contato" className="text-gray-600 hover:text-[#1E3A5F] transition-colors">Contato</a>
            <a href={import.meta.env.VITE_APP_URL || '/login'} className="text-[#2563EB] hover:text-[#1E3A5F] font-medium transition-colors">Acessar painel</a>
          </nav>
          <div className="flex items-center gap-3">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex text-sm font-medium transition-colors"
              style={{ backgroundColor: '#F97316', color: '#ffffff', border: 'none', borderRadius: 999, padding: '12px 28px' }}
            >
              Falar no WhatsApp
            </a>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-[#1E3A5F]"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
            <a href="#beneficios" onClick={() => setMobileMenuOpen(false)} className="block text-gray-600 hover:text-[#1E3A5F] py-2">Benefícios</a>
            <a href="#recursos" onClick={() => setMobileMenuOpen(false)} className="block text-gray-600 hover:text-[#1E3A5F] py-2">Recursos</a>
            <a href="#planos" onClick={() => setMobileMenuOpen(false)} className="block text-gray-600 hover:text-[#1E3A5F] py-2">Planos</a>
            <a href="#contato" onClick={() => setMobileMenuOpen(false)} className="block text-gray-600 hover:text-[#1E3A5F] py-2">Contato</a>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="block text-center text-sm font-medium" style={{ backgroundColor: '#F97316', color: '#ffffff', border: 'none', borderRadius: 999, padding: '12px 28px' }}>Falar no WhatsApp</a>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-[#EFF6FF] to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#DBEAFE] rounded-full text-sm text-[#1E3A5F] mb-6">
            <Zap size={14} />
            Automação inteligente para empresas
          </div>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Substitua trabalho manual por
            <span className="text-[#2563EB]"> automação inteligente</span>
          </h2>
          <p className="text-lg md:text-xl text-gray-600 mt-6 max-w-2xl mx-auto leading-relaxed">
            Por menos que o custo de um funcionário, a Anpexia automatiza processos, atende seus clientes
            e organiza sua operação 24 horas por dia, 7 dias por semana.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <a
              href="/agendar"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              style={{ backgroundColor: '#F97316', color: '#ffffff', border: 'none', borderRadius: 999, padding: '12px 28px' }}
            >
              <Calendar size={16} />
              Agendar conversa gratuita
            </a>
            <a
              href="#recursos"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              style={{ backgroundColor: '#FEF3C7', color: '#1C1208', border: 'none', borderRadius: 999, padding: '12px 28px' }}
            >
              Ver recursos
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-4">Sem compromisso · Conversa de 30 min · 100% online</p>
        </div>
      </section>

      {/* Social proof / numbers */}
      <section className="py-12 px-6 border-y border-gray-100">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <p className="text-3xl font-bold text-[#1E3A5F]">5+</p>
            <p className="text-sm text-gray-500 mt-1">Módulos integrados</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[#1E3A5F]">24h</p>
            <p className="text-sm text-gray-500 mt-1">Atendimento automático</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[#1E3A5F]">100%</p>
            <p className="text-sm text-gray-500 mt-1">Personalizado</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[#1E3A5F]">LGPD</p>
            <p className="text-sm text-gray-500 mt-1">Em conformidade</p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="py-20 px-6 bg-[#F8FAFC]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-[#1E3A5F]">Por que automatizar?</h3>
            <p className="text-gray-600 mt-3">O que a Anpexia faz pelo seu negócio</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-[#BFDBFE]">
              <div className="w-12 h-12 bg-[#EFF6FF] rounded-xl flex items-center justify-center mb-5">
                <Clock size={24} className="text-[#2563EB]" />
              </div>
              <h4 className="text-lg font-semibold mb-2">Economize tempo</h4>
              <p className="text-gray-600 text-sm leading-relaxed">
                Processos que levavam horas agora acontecem automaticamente.
                Você e sua equipe focam no que realmente gera valor.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-[#BFDBFE]">
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-5">
                <TrendingDown size={24} className="text-green-600" />
              </div>
              <h4 className="text-lg font-semibold mb-2">Reduza custos</h4>
              <p className="text-gray-600 text-sm leading-relaxed">
                Menos retrabalho, menos erros humanos, menos necessidade de
                contratar para tarefas repetitivas.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-[#BFDBFE]">
              <div className="w-12 h-12 bg-[#EFF6FF] rounded-xl flex items-center justify-center mb-5">
                <Brain size={24} className="text-[#1E3A5F]" />
              </div>
              <h4 className="text-lg font-semibold mb-2">Decisões melhores</h4>
              <p className="text-gray-600 text-sm leading-relaxed">
                Dashboards e relatórios em tempo real. Saiba exatamente como seu
                negócio está indo, sem achismo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-[#1E3A5F]">Como funciona</h3>
            <p className="text-gray-600 mt-3">Em 3 passos simples</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Conversa inicial', desc: 'Entendemos seu negócio, seus processos e o que pode ser automatizado.' },
              { step: '02', title: 'Configuração', desc: 'Montamos a plataforma personalizada para sua empresa, com os módulos que você precisa.' },
              { step: '03', title: 'Funcionando', desc: 'Sua automação começa a rodar. Acompanhe tudo pelo painel e foque no crescimento.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-[#1E3A5F] text-white rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h4 className="font-semibold text-lg mb-2">{item.title}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <a
              href="/agendar"
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
              style={{ backgroundColor: '#F97316', color: '#ffffff', border: 'none', borderRadius: 999, padding: '12px 28px' }}
            >
              Começar agora
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="py-20 px-6 bg-[#F8FAFC]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-[#1E3A5F]">Tudo que você precisa em um só lugar</h3>
            <p className="text-gray-600 mt-3">Módulos flexíveis que se adaptam ao seu negócio</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              { icon: BarChart3, title: 'Dashboard', desc: 'Visão geral do negócio com métricas em tempo real' },
              { icon: Users, title: 'Clientes', desc: 'Cadastro completo com histórico, tags e segmentação' },
              { icon: Package, title: 'Estoque', desc: 'Controle de produtos com alertas e movimentações' },
              { icon: MessageSquare, title: 'Mensagens', desc: 'WhatsApp automático: lembretes, avisos e mais' },
              { icon: Bot, title: 'Chatbot com IA', desc: 'Atendimento automático inteligente 24h por dia' },
            ].map((f) => (
              <div key={f.title} className="bg-white border border-[#BFDBFE] rounded-2xl p-6 hover:border-[#93C5FD] hover:shadow-sm transition-all">
                <f.icon size={28} className="text-[#1E3A5F] mb-4" />
                <h4 className="font-semibold mb-2">{f.title}</h4>
                <p className="text-sm text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-[#1E3A5F]">Planos simples e transparentes</h3>
            <p className="text-gray-600 mt-3">Escolha o que faz sentido para o seu negócio</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Essencial */}
            <div className="bg-white rounded-2xl border border-[#BFDBFE] p-8">
              <h4 className="font-semibold text-lg">Essencial</h4>
              <p className="text-sm text-gray-500 mt-1">Para quem está começando a automatizar</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-[#1E3A5F]">R$2.000</span>
                <span className="text-gray-500">/mês</span>
              </div>
              <ul className="mt-8 space-y-3">
                {['Até 4 automações', '5 usuários', '500 contatos', '300 msgs WhatsApp/mês', 'Painel personalizado', 'Suporte WhatsApp', '1 reunião mensal', 'Implantação inclusa'].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm"><CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />{item}</li>
                ))}
              </ul>
              <a href="/agendar" className="block mt-8 text-center text-sm font-medium transition-colors" style={{ backgroundColor: 'transparent', color: '#1C1208', border: '2px solid #1C1208', borderRadius: 999, padding: '12px 28px' }}>Agendar conversa</a>
            </div>

            {/* Profissional */}
            <div className="bg-[#1E3A5F] text-white rounded-2xl p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2563EB] text-white text-xs font-medium px-3 py-1 rounded-full">Mais popular</div>
              <h4 className="font-semibold text-lg">Profissional</h4>
              <p className="text-sm text-white/60 mt-1">Para quem quer escalar resultados</p>
              <div className="mt-6">
                <span className="text-4xl font-bold">R$3.500</span>
                <span className="text-white/60">/mês</span>
              </div>
              <ul className="mt-8 space-y-3">
                {['Até 7 automações', '15 usuários', '2.000 contatos', '1.000 msgs WhatsApp/mês', 'Relatórios automatizados', 'Integrações externas', 'Suporte prioritário', '2 reuniões mensais'].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm"><CheckCircle size={16} className="text-[#60A5FA] mt-0.5 shrink-0" />{item}</li>
                ))}
              </ul>
              <a href="/agendar" className="block mt-8 text-center text-sm font-medium transition-colors" style={{ backgroundColor: '#F97316', color: '#ffffff', border: 'none', borderRadius: 999, padding: '12px 28px' }}>Agendar conversa</a>
            </div>

            {/* Enterprise */}
            <div className="bg-white rounded-2xl border border-[#BFDBFE] p-8">
              <h4 className="font-semibold text-lg">Enterprise</h4>
              <p className="text-sm text-gray-500 mt-1">Para operações de alta performance</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-[#1E3A5F]">R$6.000</span>
                <span className="text-gray-500">/mês</span>
              </div>
              <ul className="mt-8 space-y-3">
                {['Automações ilimitadas', 'Usuários ilimitados', '10.000 contatos', '5.000 msgs WhatsApp/mês', 'Todas as integrações', 'Relatórios customizados', 'Gerente dedicado', 'Reuniões semanais', 'SLA 2h'].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm"><CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />{item}</li>
                ))}
              </ul>
              <a href="/agendar" className="block mt-8 text-center text-sm font-medium transition-colors" style={{ backgroundColor: 'transparent', color: '#1C1208', border: '2px solid #1C1208', borderRadius: 999, padding: '12px 28px' }}>Agendar conversa</a>
            </div>
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            Precisa de mais automações? Adicione por R$400-600/mês cada.
          </p>
        </div>
      </section>

      {/* Trust / guarantees */}
      <section className="py-16 px-6 bg-[#F8FAFC]">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="flex flex-col items-center">
            <Shield size={28} className="text-[#1E3A5F] mb-3" />
            <h4 className="font-semibold text-sm">Dados protegidos</h4>
            <p className="text-xs text-gray-500 mt-1">Em conformidade com a LGPD desde o primeiro dia</p>
          </div>
          <div className="flex flex-col items-center">
            <Star size={28} className="text-[#1E3A5F] mb-3" />
            <h4 className="font-semibold text-sm">Implantação inclusa</h4>
            <p className="text-xs text-gray-500 mt-1">Configuramos tudo para você, sem custo adicional</p>
          </div>
          <div className="flex flex-col items-center">
            <MessageSquare size={28} className="text-[#1E3A5F] mb-3" />
            <h4 className="font-semibold text-sm">Suporte humanizado</h4>
            <p className="text-xs text-gray-500 mt-1">Atendimento direto pelo WhatsApp, sem robôs</p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contato" className="py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-[#1E3A5F]">Vamos conversar?</h3>
            <p className="text-gray-600 mt-3">
              Preencha o formulário ou <a href="/agendar" className="text-[#2563EB] underline">agende uma call diretamente</a>.
              Respondemos em até 24 horas.
            </p>
          </div>

          {submitted ? (
            <div className="bg-white rounded-2xl border border-green-200 p-8 text-center">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
              <h4 className="text-xl font-semibold text-gray-900 mb-2">Mensagem recebida!</h4>
              <p className="text-gray-600 mb-6">Entraremos em contato em breve pelo WhatsApp.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="/agendar" className="inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors" style={{ backgroundColor: '#F97316', color: '#ffffff', border: 'none', borderRadius: 999, padding: '12px 28px' }}>
                  <Calendar size={16} />
                  Agendar call agora
                </a>
                <button onClick={() => setSubmitted(false)} className="text-sm text-gray-500 hover:text-gray-700">
                  Enviar outra mensagem
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#BFDBFE] p-8 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 border border-[#BFDBFE] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent" placeholder="Seu nome" required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-3 border border-[#BFDBFE] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent" placeholder="seu@email.com" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-3 border border-[#BFDBFE] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent" placeholder="(00) 00000-0000" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sobre o seu negócio</label>
                <textarea value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} rows={4} className="w-full px-4 py-3 border border-[#BFDBFE] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent resize-none" placeholder="Conte um pouco sobre sua empresa e o que gostaria de automatizar..." />
              </div>
              <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50" style={{ backgroundColor: '#F97316', color: '#ffffff', border: 'none', borderRadius: 999, padding: '12px 28px' }}>
                <Send size={16} />
                {submitting ? 'Enviando...' : 'Enviar mensagem'}
              </button>
              <p className="text-xs text-gray-400 text-center">Seus dados estão seguros e não serão compartilhados.</p>
            </form>
          )}

          <div className="flex items-center justify-center gap-8 mt-8 text-sm text-gray-500">
            {whatsappNumber && <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-[#1E3A5F] transition-colors"><Phone size={16} />WhatsApp</a>}
            <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 hover:text-[#1E3A5F] transition-colors"><Mail size={16} />E-mail</a>
            <a href="/agendar" className="flex items-center gap-2 hover:text-[#1E3A5F] transition-colors"><Calendar size={16} />Agendar call</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 px-6 bg-[#1E3A5F]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/80">Anpexia — Automação inteligente para empresas</p>
          <p className="text-sm text-white/50">&copy; 2026 Anpexia. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* Floating WhatsApp button (mobile) */}
      {whatsappNumber && (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 sm:hidden bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600 transition-colors z-50"
          aria-label="WhatsApp"
        >
          <MessageSquare size={24} />
        </a>
      )}
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/agendar" element={<SchedulingPage />} />
    </Routes>
  );
}

export default App;
