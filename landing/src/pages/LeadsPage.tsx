import { useState } from 'react';
import { ArrowRight, CheckCircle, Building2, Stethoscope } from 'lucide-react';
import axios from 'axios';

const PROD_API_URL = 'https://api.anpexia.com.br/api/v1';
const apiUrl =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('anpexia.com.br') ? PROD_API_URL : '/api/v1');

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const ESPECIALIDADES = [
  'Clinica Medica',
  'Clinica Estetica',
  'Clinica Odontologica',
  'Clinica Oftalmologica',
  'Clinica de Fisioterapia',
  'Clinica Veterinaria',
  'Psicologia / Psiquiatria',
  'Dermatologia',
  'Ortopedia',
  'Pediatria',
  'Ginecologia',
  'Cardiologia',
  'Outra especialidade',
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  backgroundColor: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  fontSize: '0.9rem',
  color: '#1E3A5F',
  outline: 'none',
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function LeadsPage() {
  const [form, setForm] = useState({
    name: '',
    clinic: '',
    phone: '',
    email: '',
    city: '',
    state: '',
    specialty: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source') || '';
  const utmMedium = params.get('utm_medium') || '';
  const utmCampaign = params.get('utm_campaign') || '';
  const utmContent = params.get('utm_content') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(false);
    try {
      const notes = [
        form.message && `Mensagem: ${form.message}`,
        form.city && `Cidade: ${form.city}`,
        form.state && `Estado: ${form.state}`,
        form.specialty && `Especialidade: ${form.specialty}`,
      ].filter(Boolean).join('\n');

      await axios.post(`${apiUrl}/sales/capture`, {
        name: form.name,
        phone: form.phone.replace(/\D/g, ''),
        email: form.email || undefined,
        company: form.clinic,
        segment: form.specialty || undefined,
        source: 'leads_page',
        notes: notes || undefined,
        utmSource: utmSource || undefined,
        utmMedium: utmMedium || undefined,
        utmCampaign: utmCampaign || undefined,
        utmContent: utmContent || undefined,
      });
      setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Sora, system-ui, sans-serif' }}>
      {/* Navbar */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>A</span>
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1E3A5F' }}>Anpexia</span>
        </a>
        <a href="/" style={{ fontSize: '0.85rem', fontWeight: 500, color: '#6B7280', textDecoration: 'none' }}>
          Voltar ao site
        </a>
      </nav>

      {/* Main content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 80px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 48, alignItems: 'start' }}>
        {/* Left — info */}
        <div style={{ paddingTop: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: '#E2E8F0', borderRadius: 999, padding: '6px 16px', marginBottom: 24 }}>
            <Stethoscope size={14} style={{ color: '#2563EB' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Demonstracao gratuita</span>
          </div>

          <h1 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, color: '#1E3A5F', lineHeight: 1.15, marginBottom: 20 }}>
            Automatize sua clinica com a <span style={{ color: '#2563EB' }}>Anpexia</span>
          </h1>

          <p style={{ fontSize: '1rem', color: '#6B7280', lineHeight: 1.7, marginBottom: 32 }}>
            Preencha o formulario e um especialista entrara em contato para agendar uma demonstracao personalizada do sistema.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              'Demonstracao 100% gratuita e sem compromisso',
              'Sistema completo: agendamentos, financeiro, estoque e mais',
              'Chatbot com IA para atendimento 24h via WhatsApp',
              'Implantacao assistida pela nossa equipe',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle size={14} style={{ color: '#059669' }} />
                </div>
                <span style={{ fontSize: '0.9rem', color: '#374151' }}>{item}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 40, padding: 20, backgroundColor: '#fff', borderRadius: 16, border: '1px solid #F3F4F6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Building2 size={16} style={{ color: '#2563EB' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E3A5F' }}>Para clinicas de todos os portes</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', lineHeight: 1.6, margin: 0 }}>
              Medicas, esteticas, odontologicas e mais. O sistema se adapta ao seu segmento.
            </p>
          </div>
        </div>

        {/* Right — form */}
        <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '36px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={32} style={{ color: '#059669' }} />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1E3A5F', marginBottom: 12 }}>Solicitacao enviada!</h2>
              <p style={{ fontSize: '0.95rem', color: '#6B7280', lineHeight: 1.6, marginBottom: 24 }}>
                Obrigado pelo interesse! Nossa equipe entrara em contato em breve para agendar sua demonstracao.
              </p>
              <button
                onClick={() => { setSubmitted(false); setForm({ name: '', clinic: '', phone: '', email: '', city: '', state: '', specialty: '', message: '' }); }}
                style={{ backgroundColor: 'transparent', border: 'none', color: '#2563EB', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
              >
                Enviar outra solicitacao
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                  <p style={{ color: '#DC2626', fontSize: '0.85rem', margin: 0, fontWeight: 500 }}>
                    Erro ao enviar solicitacao. Tente novamente ou entre em contato pelo WhatsApp.
                  </p>
                </div>
              )}
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1E3A5F', marginBottom: 4 }}>Solicite uma demonstracao gratuita</h2>
              <p style={{ fontSize: '0.85rem', color: '#9CA3AF', marginBottom: 24 }}>Campos com * sao obrigatorios</p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Nome completo *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    style={inputStyle}
                    placeholder="Seu nome completo"
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Nome da clinica *</label>
                  <input
                    type="text"
                    value={form.clinic}
                    onChange={e => setForm({ ...form, clinic: e.target.value })}
                    style={inputStyle}
                    placeholder="Ex: Clinica Saude Total"
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>WhatsApp *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })}
                    style={inputStyle}
                    placeholder="(99) 99999-9999"
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    style={inputStyle}
                    placeholder="seu@email.com"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Cidade</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => setForm({ ...form, city: e.target.value })}
                      style={inputStyle}
                      placeholder="Sua cidade"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Estado</label>
                    <select
                      value={form.state}
                      onChange={e => setForm({ ...form, state: e.target.value })}
                      style={{ ...inputStyle, color: form.state ? '#1E3A5F' : '#9CA3AF', appearance: 'auto' as const }}
                    >
                      <option value="">Selecione</option>
                      {ESTADOS.map(uf => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Especialidade</label>
                  <select
                    value={form.specialty}
                    onChange={e => setForm({ ...form, specialty: e.target.value })}
                    style={{ ...inputStyle, color: form.specialty ? '#1E3A5F' : '#9CA3AF', appearance: 'auto' as const }}
                  >
                    <option value="">Selecione</option>
                    {ESPECIALIDADES.map(esp => (
                      <option key={esp} value={esp}>{esp}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Mensagem</label>
                  <textarea
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    style={{ ...inputStyle, minHeight: 90, resize: 'vertical' as const }}
                    placeholder="Conte-nos sobre sua clinica..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    backgroundColor: '#2563EB',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '16px 32px',
                    fontWeight: 700,
                    fontSize: '1rem',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    fontFamily: 'inherit',
                    opacity: submitting ? 0.7 : 1,
                    transition: 'opacity 0.15s',
                    marginTop: 4,
                  }}
                >
                  {submitting ? 'Enviando...' : 'Quero uma demonstracao gratuita'}
                  {!submitting && <ArrowRight size={18} />}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid #CBD5E1' }}>
        <p style={{ fontSize: '0.8rem', color: '#9CA3AF', margin: 0 }}>
          &copy; {new Date().getFullYear()} Anpexia. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
