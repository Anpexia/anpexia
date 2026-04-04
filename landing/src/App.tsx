import { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import axios from 'axios';
import {
  BarChart3, Users, Package, MessageSquare, Calendar,
  CheckCircle, Phone, Mail, Send, Menu, X, Shield, Star,
  ArrowRight, Clock, TrendingDown, Brain, BookOpen,
  DollarSign, Bot, UsersRound, PenLine,
} from 'lucide-react';
import SchedulingPage from './pages/SchedulingPage';

const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '';
const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'contato@anpexia.com.br';
const whatsappLink = `https://wa.me/${whatsappNumber}`;
const PROD_API_URL = 'https://backend-production-e9a8.up.railway.app/api/v1';
const apiUrl =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname.includes('vercel.app') ? PROD_API_URL : '/api/v1');

/* ─── Scroll reveal hook ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ─── Animated counter ─── */
function Counter({ value, suffix = '' }: { value: string; suffix?: string }) {
  const { ref, visible } = useReveal(0.3);
  const num = parseInt(value, 10);
  const isNum = !isNaN(num);
  const [display, setDisplay] = useState(isNum ? '0' : value);

  useEffect(() => {
    if (!visible || !isNum) { if (!isNum && visible) setDisplay(value); return; }
    let start = 0;
    const duration = 1200;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min((ts - startTs) / duration, 1);
      start = Math.floor(p * num);
      setDisplay(String(start));
      if (p < 1) requestAnimationFrame(step);
    };
    let startTs = 0 as any;
    requestAnimationFrame(step);
  }, [visible, num, isNum, value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

/* ─── Styles ─── */
const btnPrimary: React.CSSProperties = { backgroundColor: '#F97316', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 32px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', justifyContent: 'center', transition: 'opacity 0.15s' };
const btnSecDark: React.CSSProperties = { backgroundColor: '#FEF3C7', color: '#1C1208', border: 'none', borderRadius: 999, padding: '14px 32px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', justifyContent: 'center', transition: 'opacity 0.15s' };
const btnSecLight: React.CSSProperties = { backgroundColor: 'transparent', color: '#1C1208', border: '2px solid #1C1208', borderRadius: 999, padding: '12px 30px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', justifyContent: 'center', transition: 'opacity 0.15s' };

function LandingPage() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
        name: formData.name, email: formData.email, phone: formData.phone,
        notes: formData.message, source: 'landing_page',
        utmSource: utmSource || undefined, utmMedium: utmMedium || undefined,
        utmCampaign: utmCampaign || undefined, utmContent: utmContent || undefined,
      }).catch(() => {});
      setSubmitted(true);
      setFormData({ name: '', email: '', phone: '', message: '' });
    } finally { setSubmitting(false); }
  };

  const closeMenu = useCallback(() => setMobileMenuOpen(false), []);

  /* Reveal refs */
  const benefitsReveal = useReveal();
  const howReveal = useReveal();
  const resourcesReveal = useReveal();
  const plansReveal = useReveal();

  return (
    <div style={{ fontFamily: "'Sora', sans-serif" }}>

      {/* ═══ 1. NAVBAR ═══ */}
      <header style={{ position: 'fixed', top: 0, width: '100%', zIndex: 50, backgroundColor: '#1C1208', borderBottom: '1px solid rgba(249,115,22,0.15)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#FEF3C7', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>Anpexia</span>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="hidden md:flex">
            {['Benefícios', 'Recursos', 'Planos', 'Contato'].map(l => (
              <a key={l} href={`#${l.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`} style={{ color: 'rgba(254,243,199,0.6)', fontSize: '0.875rem', textDecoration: 'none', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#FEF3C7')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(254,243,199,0.6)')}>{l}</a>
            ))}
            <a href={import.meta.env.VITE_APP_URL || '/login'} style={{ color: '#F97316', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}>Acessar painel</a>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" style={btnPrimary} className="hidden sm:inline-flex">Falar no WhatsApp</a>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden" style={{ background: 'none', border: 'none', color: '#FEF3C7', cursor: 'pointer', padding: 8 }}>
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden" style={{ backgroundColor: '#1C1208', borderTop: '1px solid rgba(249,115,22,0.15)', padding: '16px 24px' }}>
            {['Benefícios', 'Recursos', 'Planos', 'Contato'].map(l => (
              <a key={l} href={`#${l.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`} onClick={closeMenu} style={{ display: 'block', color: 'rgba(254,243,199,0.6)', padding: '10px 0', textDecoration: 'none', fontSize: '0.875rem' }}>{l}</a>
            ))}
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" onClick={closeMenu} style={{ ...btnPrimary, width: '100%', marginTop: 12, textAlign: 'center' as const }}>Falar no WhatsApp</a>
          </div>
        )}
      </header>

      {/* ═══ 2. HERO ═══ */}
      <section style={{
        backgroundColor: '#1C1208', minHeight: 580, paddingTop: 120, paddingBottom: 60, position: 'relative', overflow: 'hidden',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(249,115,22,0.04) 0px, rgba(249,115,22,0.04) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(90deg, rgba(249,115,22,0.04) 0px, rgba(249,115,22,0.04) 1px, transparent 1px, transparent 60px)',
      }}>
        {/* Decorative rectangle */}
        <div style={{ position: 'absolute', top: 80, right: 60, width: 200, height: 200, border: '1px solid rgba(249,115,22,0.2)', borderRadius: 20, transform: 'rotate(12deg)' }} className="hidden lg:block" />

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column' as const, minHeight: 460, justifyContent: 'flex-end' }}>
          <span style={{ color: '#F97316', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: 20 }}>
            Automação inteligente para empresas
          </span>
          <h1 style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 20px', maxWidth: 700 }}>
            <span style={{ color: '#FEF3C7' }}>Substitua trabalho manual por </span>
            <span style={{ color: '#F97316' }}>automação inteligente</span>
          </h1>
          <p style={{ color: 'rgba(254,243,199,0.5)', fontSize: '0.95rem', lineHeight: 1.7, margin: '0 0 28px', maxWidth: 520 }}>
            Por menos que o custo de um funcionário, a Anpexia automatiza processos, atende seus clientes e organiza sua operação 24 horas por dia, 7 dias por semana.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 12 }}>
            <a href="/agendar" style={btnPrimary}><Calendar size={16} /> Agendar conversa gratuita</a>
            <a href="#recursos" style={btnSecDark}>Ver recursos</a>
          </div>
          <p style={{ color: 'rgba(254,243,199,0.3)', fontSize: '0.75rem', marginTop: 20 }}>Sem compromisso · Conversa de 30 min · 100% online</p>
        </div>
      </section>

      {/* ═══ MARQUEE ═══ */}
      <div style={{ backgroundColor: '#F97316', height: 44, overflow: 'hidden', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' as const }}>
        <style>{`@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
        <div style={{ display: 'flex', animation: 'marquee 25s linear infinite' }}>
          {[0, 1].map(i => (
            <span key={i} style={{ color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0 }}>
              {[...Array(6)].map((_, j) => (
                <span key={j} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ padding: '0 60px' }}>Automação inteligente</span>
                  <span style={{ padding: '0 60px', opacity: 0.7 }}>✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ═══ 3. NÚMEROS ═══ */}
      <section style={{ backgroundColor: '#fff8f0', borderBottom: '1px solid #FCD34D', padding: '40px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', textAlign: 'center' as const }}>
          {[
            { val: '5', suf: '+', label: 'Módulos integrados' },
            { val: '24', suf: 'h', label: 'Atendimento automático' },
            { val: '100', suf: '%', label: 'Personalizado' },
            { val: 'LGPD', suf: '', label: 'Em conformidade' },
          ].map((item, i) => (
            <div key={item.label} style={{ padding: '16px 0', borderRight: i < 3 ? '1px solid #FDE68A' : 'none' }}>
              <p style={{ fontSize: 34, fontWeight: 800, color: '#1C1208', margin: 0 }}>
                <Counter value={item.val} suffix={item.suf} />
              </p>
              <p style={{ fontSize: 12, color: '#92400E', marginTop: 4 }}>{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 4. BENEFÍCIOS ═══ */}
      <section id="beneficios" style={{ backgroundColor: '#fff8f0', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 56 }}>
            <p style={{ color: '#F97316', fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Benefícios</p>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1C1208', margin: '0 0 8px' }}>Por que automatizar?</h2>
            <p style={{ color: '#92400E', fontSize: '0.95rem' }}>O que a Anpexia faz pelo seu negócio</p>
          </div>
          <div ref={benefitsReveal.ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {[
              { icon: Clock, title: 'Economize tempo', desc: 'Processos que levavam horas agora acontecem automaticamente. Você e sua equipe focam no que realmente gera valor.' },
              { icon: TrendingDown, title: 'Reduza custos', desc: 'Menos retrabalho, menos erros humanos, menos necessidade de contratar para tarefas repetitivas.' },
              { icon: Brain, title: 'Decisões melhores', desc: 'Dashboards e relatórios em tempo real. Saiba exatamente como seu negócio está indo, sem achismo.' },
            ].map((c, i) => (
              <div key={c.title} style={{
                backgroundColor: '#1C1208', borderRadius: 16, padding: 32,
                opacity: benefitsReveal.visible ? 1 : 0,
                transform: benefitsReveal.visible ? 'translateX(0)' : 'translateX(-40px)',
                transition: `opacity 0.6s ${i * 0.15}s, transform 0.6s ${i * 0.15}s`,
              }}>
                <c.icon size={28} style={{ color: '#F97316', marginBottom: 16 }} />
                <h3 style={{ color: '#FEF3C7', fontWeight: 700, fontSize: '1.125rem', marginBottom: 8 }}>{c.title}</h3>
                <p style={{ color: 'rgba(254,243,199,0.5)', fontSize: '0.875rem', lineHeight: 1.7 }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 5. COMO FUNCIONA ═══ */}
      <section style={{ backgroundColor: '#FFFBEB', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 56 }}>
            <p style={{ color: '#F97316', fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Como funciona</p>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1C1208', margin: 0 }}>Em 3 passos simples</h2>
          </div>
          <div ref={howReveal.ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {[
              { step: '01', title: 'Conversa inicial', desc: 'Entendemos seu negócio, seus processos e o que pode ser automatizado.' },
              { step: '02', title: 'Configuração', desc: 'Montamos a plataforma personalizada para sua empresa, com os módulos que você precisa.' },
              { step: '03', title: 'Funcionando', desc: 'Sua automação começa a rodar. Acompanhe tudo pelo painel e foque no crescimento.' },
            ].map((s, i) => (
              <div key={s.step} style={{
                backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: 32, textAlign: 'center' as const,
                opacity: howReveal.visible ? 1 : 0,
                transform: howReveal.visible ? 'translateY(0)' : 'translateY(30px)',
                transition: `opacity 0.6s ${i * 0.2}s, transform 0.6s ${i * 0.2}s`,
              }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#F97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.875rem', margin: '0 auto 16px' }}>{s.step}</div>
                <h3 style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1C1208', marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: '#92400E', fontSize: '0.875rem', lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' as const, marginTop: 48 }}>
            <a href="/agendar" style={btnPrimary}>Começar agora <ArrowRight size={16} /></a>
          </div>
        </div>
      </section>

      {/* ═══ 6. RECURSOS ═══ */}
      <section id="recursos" style={{ backgroundColor: '#fff8f0', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 56 }}>
            <p style={{ color: '#F97316', fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Recursos</p>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1C1208', margin: '0 0 8px' }}>Tudo que você precisa em um só lugar</h2>
            <p style={{ color: '#92400E', fontSize: '0.95rem' }}>Módulos flexíveis que se adaptam ao seu negócio</p>
          </div>
          <div ref={resourcesReveal.ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { icon: BarChart3, title: 'Dashboard', desc: 'Métricas e KPIs em tempo real' },
              { icon: Users, title: 'Clientes', desc: 'Cadastro completo com histórico' },
              { icon: Package, title: 'Estoque', desc: 'Controle com alertas automáticos' },
              { icon: MessageSquare, title: 'Mensagens', desc: 'WhatsApp automático e avisos' },
              { icon: Calendar, title: 'Agendamentos', desc: 'Agenda com lembretes automáticos' },
              { icon: BookOpen, title: 'Scripts', desc: 'Roteiros de atendimento prontos' },
              { icon: DollarSign, title: 'Financeiro', desc: 'Lançamentos e relatórios financeiros' },
              { icon: Bot, title: 'Chatbot com IA', desc: 'Atendimento inteligente 24h por dia' },
              { icon: UsersRound, title: 'Equipe', desc: 'Gestão de usuários e permissões' },
              { icon: PenLine, title: 'Assinatura Digital', desc: 'Assine documentos digitalmente' },
            ].map((f, i) => (
              <div key={f.title} style={{
                backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: 24,
                opacity: resourcesReveal.visible ? 1 : 0,
                transform: resourcesReveal.visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s ${i * 0.06}s, transform 0.5s ${i * 0.06}s`,
              }}>
                <f.icon size={24} style={{ color: '#F97316', marginBottom: 12 }} />
                <h4 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1C1208', marginBottom: 4 }}>{f.title}</h4>
                <p style={{ color: '#92400E', fontSize: '0.8rem', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 7. PLANOS ═══ */}
      <section id="planos" style={{ backgroundColor: '#FFFBEB', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 56 }}>
            <p style={{ color: '#F97316', fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Planos</p>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1C1208', margin: '0 0 8px' }}>Simples e transparentes</h2>
            <p style={{ color: '#92400E', fontSize: '0.95rem' }}>Escolha o que faz sentido para o seu negócio</p>
          </div>
          <div ref={plansReveal.ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {/* Starter */}
            <div style={{
              backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: 32,
              opacity: plansReveal.visible ? 1 : 0, transform: plansReveal.visible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 0.6s 0s, transform 0.6s 0s',
            }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.125rem', color: '#1C1208' }}>Starter</h3>
              <p style={{ color: '#92400E', fontSize: '0.8rem', marginTop: 4 }}>Para quem está começando a automatizar</p>
              <div style={{ marginTop: 20 }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 800, color: '#1C1208' }}>R$1.200</span>
                <span style={{ color: '#92400E', fontSize: '0.875rem' }}>/mês</span>
              </div>
              <p style={{ color: '#F97316', fontWeight: 600, fontSize: '0.8rem', marginTop: 8 }}>2 automações incluídas</p>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 20 }}>
                {['2 automações', '10 usuários', '600 contatos', '1.000 msgs WhatsApp/mês', 'Painel personalizado', 'Suporte via WhatsApp'].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.8rem', marginBottom: 10, color: '#1C1208' }}>
                    <CheckCircle size={15} style={{ color: '#F97316', flexShrink: 0, marginTop: 2 }} />{f}
                  </li>
                ))}
              </ul>
              <a href="/agendar" style={{ ...btnSecLight, width: '100%', marginTop: 24, boxSizing: 'border-box' as const }}>Agendar conversa</a>
            </div>

            {/* Pro */}
            <div style={{
              backgroundColor: '#1C1208', border: '1px solid #F97316', borderRadius: 16, padding: 32, position: 'relative' as const,
              opacity: plansReveal.visible ? 1 : 0, transform: plansReveal.visible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 0.6s 0.15s, transform 0.6s 0.15s',
            }}>
              <div style={{ position: 'absolute' as const, top: -12, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#F97316', color: '#fff', fontSize: '0.7rem', fontWeight: 600, padding: '4px 14px', borderRadius: 999 }}>Mais popular</div>
              <h3 style={{ fontWeight: 700, fontSize: '1.125rem', color: '#FEF3C7' }}>Pro</h3>
              <p style={{ color: 'rgba(254,243,199,0.5)', fontSize: '0.8rem', marginTop: 4 }}>Para quem quer escalar resultados</p>
              <div style={{ marginTop: 20 }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 800, color: '#FEF3C7' }}>R$2.000</span>
                <span style={{ color: 'rgba(254,243,199,0.5)', fontSize: '0.875rem' }}>/mês</span>
              </div>
              <p style={{ color: '#F97316', fontWeight: 600, fontSize: '0.8rem', marginTop: 8 }}>4 automações incluídas</p>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 20 }}>
                {['4 automações', '15 usuários', '1.000 contatos', '2.000 msgs WhatsApp/mês', 'Integrações externas', 'Suporte via WhatsApp'].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.8rem', marginBottom: 10, color: 'rgba(254,243,199,0.7)' }}>
                    <CheckCircle size={15} style={{ color: '#F97316', flexShrink: 0, marginTop: 2 }} />{f}
                  </li>
                ))}
              </ul>
              <a href="/agendar" style={{ ...btnPrimary, width: '100%', marginTop: 24, boxSizing: 'border-box' as const }}>Agendar conversa</a>
            </div>

            {/* Business */}
            <div style={{
              backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: 32,
              opacity: plansReveal.visible ? 1 : 0, transform: plansReveal.visible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 0.6s 0.3s, transform 0.6s 0.3s',
            }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.125rem', color: '#1C1208' }}>Business</h3>
              <p style={{ color: '#92400E', fontSize: '0.8rem', marginTop: 4 }}>Para operações que precisam de mais poder</p>
              <div style={{ marginTop: 20 }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 800, color: '#1C1208' }}>R$3.000</span>
                <span style={{ color: '#92400E', fontSize: '0.875rem' }}>/mês</span>
              </div>
              <p style={{ color: '#F97316', fontWeight: 600, fontSize: '0.8rem', marginTop: 8 }}>6 automações incluídas</p>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 20 }}>
                {['6 automações', '20 usuários', '2.000 contatos', '3.000 msgs WhatsApp/mês', 'Todas as integrações', 'Suporte via WhatsApp'].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.8rem', marginBottom: 10, color: '#1C1208' }}>
                    <CheckCircle size={15} style={{ color: '#F97316', flexShrink: 0, marginTop: 2 }} />{f}
                  </li>
                ))}
              </ul>
              <a href="/agendar" style={{ ...btnSecLight, width: '100%', marginTop: 24, boxSizing: 'border-box' as const }}>Agendar conversa</a>
            </div>
          </div>
          <p style={{ textAlign: 'center' as const, fontSize: '0.85rem', color: '#92400E', marginTop: 32 }}>
            Precisa de mais automações? <a href="#contato" style={{ color: '#F97316', textDecoration: 'none', fontWeight: 700 }}>Fale conosco</a>
          </p>
        </div>
      </section>

      {/* ═══ 8. CONFIANÇA ═══ */}
      <section style={{ backgroundColor: '#fff8f0', padding: '60px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', textAlign: 'center' as const }}>
          {[
            { icon: Shield, title: 'Dados protegidos', desc: 'Em conformidade com a LGPD desde o primeiro dia' },
            { icon: Star, title: 'Implantação inclusa', desc: 'Configuramos tudo para você, sem custo adicional' },
            { icon: MessageSquare, title: 'Suporte humanizado', desc: 'Atendimento direto pelo WhatsApp, sem robôs' },
          ].map((g, i) => (
            <div key={g.title} style={{ padding: '20px 16px', borderRight: i < 2 ? '1px solid #FDE68A' : 'none' }}>
              <g.icon size={28} style={{ color: '#F97316', margin: '0 auto 12px' }} />
              <h4 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1C1208', marginBottom: 4 }}>{g.title}</h4>
              <p style={{ color: '#92400E', fontSize: '0.8rem', lineHeight: 1.6, margin: 0 }}>{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 9. CONTATO ═══ */}
      <section id="contato" style={{ backgroundColor: '#1C1208', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 48 }}>
          {/* Left */}
          <div>
            <p style={{ color: '#F97316', fontWeight: 600, fontSize: '0.875rem', marginBottom: 12 }}>Contato</p>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#FEF3C7', margin: '0 0 12px' }}>Vamos conversar?</h2>
            <p style={{ color: 'rgba(254,243,199,0.5)', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: 32 }}>
              Preencha o formulário ou entre em contato diretamente. Respondemos em até 24 horas.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              {whatsappNumber && (
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" style={{ color: '#F97316', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                  <Phone size={18} /> WhatsApp
                </a>
              )}
              <a href={`mailto:${contactEmail}`} style={{ color: '#F97316', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                <Mail size={18} /> {contactEmail}
              </a>
              <a href="/agendar" style={{ color: '#F97316', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                <Calendar size={18} /> Agendar call
              </a>
            </div>
          </div>

          {/* Right — form */}
          <div>
            {submitted ? (
              <div style={{ backgroundColor: '#fff8f0', borderRadius: 16, padding: 32, textAlign: 'center' as const }}>
                <CheckCircle size={48} style={{ color: '#F97316', margin: '0 auto 16px' }} />
                <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1C1208', marginBottom: 8 }}>Mensagem recebida!</h4>
                <p style={{ color: '#92400E', marginBottom: 24, fontSize: '0.9rem' }}>Entraremos em contato em breve pelo WhatsApp.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 12, justifyContent: 'center' }}>
                  <a href="/agendar" style={btnPrimary}><Calendar size={16} /> Agendar call agora</a>
                  <button onClick={() => setSubmitted(false)} style={{ background: 'none', border: 'none', color: '#92400E', fontSize: '0.85rem', cursor: 'pointer' }}>Enviar outra mensagem</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#FEF3C7', marginBottom: 6 }}>Nome *</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                    style={{ width: '100%', padding: '12px 16px', backgroundColor: '#fff8f0', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, fontSize: '0.875rem', color: '#1C1208', outline: 'none', boxSizing: 'border-box' as const }}
                    placeholder="Seu nome" required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#FEF3C7', marginBottom: 6 }}>E-mail *</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', backgroundColor: '#fff8f0', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, fontSize: '0.875rem', color: '#1C1208', outline: 'none', boxSizing: 'border-box' as const }}
                      placeholder="seu@email.com" required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#FEF3C7', marginBottom: 6 }}>WhatsApp *</label>
                    <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', backgroundColor: '#fff8f0', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, fontSize: '0.875rem', color: '#1C1208', outline: 'none', boxSizing: 'border-box' as const }}
                      placeholder="(00) 00000-0000" required />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#FEF3C7', marginBottom: 6 }}>Sobre o seu negócio</label>
                  <textarea value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} rows={4}
                    style={{ width: '100%', padding: '12px 16px', backgroundColor: '#fff8f0', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, fontSize: '0.875rem', color: '#1C1208', outline: 'none', resize: 'none' as const, boxSizing: 'border-box' as const }}
                    placeholder="Conte um pouco sobre sua empresa e o que gostaria de automatizar..." />
                </div>
                <button type="submit" disabled={submitting} style={{ ...btnPrimary, width: '100%', opacity: submitting ? 0.6 : 1 }}>
                  <Send size={16} />
                  {submitting ? 'Enviando...' : 'Enviar mensagem'}
                </button>
                <p style={{ fontSize: '0.75rem', color: 'rgba(254,243,199,0.3)', textAlign: 'center' as const, margin: 0 }}>Seus dados estão seguros e não serão compartilhados.</p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ═══ 10. CTA FINAL ═══ */}
      <section style={{ backgroundColor: '#F97316', padding: '64px 24px', textAlign: 'center' as const }}>
        <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, color: '#fff', margin: '0 0 12px' }}>Pronto para automatizar seu negócio?</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', marginBottom: 32 }}>Comece hoje. Sem cartão de crédito. Cancele quando quiser.</p>
        <a href="/agendar" style={{ backgroundColor: '#1C1208', color: '#F97316', border: 'none', borderRadius: 999, padding: '14px 36px', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Agendar conversa gratuita <ArrowRight size={16} />
        </a>
      </section>

      {/* ═══ 11. FOOTER ═══ */}
      <footer style={{ backgroundColor: '#0D0904', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <span style={{ color: '#FEF3C7', fontWeight: 800, fontSize: '1rem' }}>Anpexia</span>
            <p style={{ color: 'rgba(254,243,199,0.3)', fontSize: '0.75rem', margin: '4px 0 0' }}>Automação inteligente para empresas</p>
          </div>
          <p style={{ color: 'rgba(254,243,199,0.2)', fontSize: '0.75rem', margin: 0 }}>&copy; 2026 Anpexia. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* ═══ 12. FLOATING WHATSAPP ═══ */}
      {whatsappNumber && (
        <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
          className="sm:hidden"
          style={{ position: 'fixed' as const, bottom: 24, right: 24, backgroundColor: '#F97316', color: '#fff', width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(249,115,22,0.4)', zIndex: 50, textDecoration: 'none' }}>
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
