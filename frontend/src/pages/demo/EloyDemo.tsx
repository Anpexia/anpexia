import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, X, MessageCircle, Phone, MapPin, Clock } from 'lucide-react';

interface Msg {
  role: 'assistant' | 'user';
  content: string;
  time: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://backend-production-e9a8.up.railway.app/api/v1';

const SYSTEM = `Você é Ana, secretária da Clínica Oftalmologia Avançada Dr. Eloy Chicata, em Pará de Minas/MG. Você faz parte do time de atendimento de luxo. Você NÃO é um bot — você é uma pessoa real respondendo pelo WhatsApp.

PERSONA:
- Informal, direta, frases curtas — fale como secretária de luxo no WhatsApp
- Público AAA — sofisticação sem robotismo
- Use: Poxa, Entendi, Realmente, Claro
- Máximo 2 a 3 linhas por mensagem. Nunca blocos de texto

PROIBIDO:
- 'Como posso ser útil'
- 'É uma satisfação'
- 'Pautada pela segurança'
- 'Diálogo'
- Qualquer linguagem de robô ou call center

BACK TRACKING:
- Valide apenas o ponto central de forma breve
- Ex: 'Poxa, passar o dia com dor de cabeça por causa das vistas é exaustivo.'

SPIN:
- Uma pergunta por vez — NUNCA duas na mesma mensagem
- Perguntas de reflexão, não questionário
- Ex: 'Hoje esse problema acaba te limitando em momentos simples, como uma leitura?'

REGRA DE AGENDAMENTO:
- PROIBIDO sugerir agendamento antes do paciente responder pelo menos 2 perguntas SPIN
- Fluxo obrigatório:
  1. Acolhimento + back tracking
  2. Pergunta SPIN de implicação
  3. Após resposta: valide e faça mais uma pergunta
  4. Só então apresente a clínica e convide suavemente
- Use: 'O Dr. Eloy costuma analisar esses casos com muita calma. Faz sentido passar por uma avaliação para ele entender seu caso de perto?'
- Nunca use: 'quer agendar?'
- Quando for perguntar sobre agendamento: primeiro pergunte a data preferida, depois o período (manhã ou tarde), depois o horário específico. Uma pergunta por vez.

FOCO:
- Fale da equipe e estrutura da clínica
- Só mencione o Dr. Eloy se o paciente perguntar
- Nunca deixe a conversa morrer — sempre termine com pergunta ou resposta

Responda sempre em português brasileiro.`;

const INITIAL_MSG = 'Olá! 👋 Aqui é a Ana, da Clínica Dr. Eloy Chicata.\nNo que posso te ajudar hoje?';

const BUTTONS_L1 = [
  'Quero agendar uma consulta',
  'Tenho um problema de visão',
  'Quero saber sobre os tratamentos',
  'Tenho uma dúvida',
];

const BUTTONS_L2: Record<string, string[]> = {
  'Quero agendar uma consulta': ['Primeira consulta', 'Retorno', 'Urgência'],
  'Tenho um problema de visão': ['Visão embaçada', 'Dor nos olhos', 'Dificuldade para ler', 'Outro'],
  'Quero saber sobre os tratamentos': ['Cirurgia de catarata', 'Cirurgia refrativa', 'Glaucoma', 'Retina', 'Outros'],
};

function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function EloyDemo() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [buttons, setButtons] = useState<string[]>([]);
  const [initiated, setInitiated] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-open chat after 2 seconds
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // scroll
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, typing]);

  // init message on first open
  useEffect(() => {
    if (!open || initiated) return;
    setInitiated(true);
    setTyping(true);
    const t = setTimeout(() => {
      setMessages([{ role: 'assistant', content: INITIAL_MSG, time: now() }]);
      setButtons(BUTTONS_L1);
      setTyping(false);
    }, 1000);
    return () => clearTimeout(t);
  }, [open, initiated]);

  // focus input
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open, typing]);

  // Safety: force-clear typing after 30s in case something goes wrong
  useEffect(() => {
    if (!typing) return;
    const safety = setTimeout(() => setTyping(false), 30000);
    return () => clearTimeout(safety);
  }, [typing]);

  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || typing) return;
    const userMsg: Msg = { role: 'user', content: text.trim(), time: now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setButtons([]);
    setTyping(true);

    const l2 = BUTTONS_L2[text.trim()];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`${API_URL}/demo-eloy/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: SYSTEM,
          messages: updated.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      const reply = json.data?.content?.[0]?.text || 'Desculpa, nao consegui responder agora. Pode repetir?';

      // Small delay to simulate typing
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
      setMessages(prev => [...prev, { role: 'assistant', content: reply, time: now() }]);
      if (l2) setButtons(l2);
    } catch (err: any) {
      console.error('[DEMO] fetch error:', err);
      const isTimeout = err?.name === 'AbortError';
      const errorMsg = isTimeout
        ? 'Desculpe, estou com dificuldades tecnicas. Tente novamente.'
        : 'Ops, tive um probleminha aqui. Pode mandar de novo?';
      await new Promise(r => setTimeout(r, 500));
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg, time: now() }]);
    } finally {
      setTyping(false);
    }
  }, [messages, typing]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(input); }
  };

  const pill: React.CSSProperties = {
    padding: '7px 16px', borderRadius: 999, border: '1.5px solid #2D5A1B', backgroundColor: '#fff',
    color: '#2D5A1B', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8faf7' }}>

      {/* Landing content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 16px',
            backgroundColor: '#2D5A1B', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(45,90,27,0.3)',
          }}>
            <img src="/logo-eloy.jpg" alt="Dr. Eloy Chicata" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px' }}>
            Clinica Dr. Eloy Chicata
          </h1>
          <p style={{ fontSize: '1rem', color: '#666', margin: 0 }}>
            Oftalmologia Avancada — Para de Minas/MG
          </p>
        </div>

        {/* Info cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Phone size={18} color="#2D5A1B" />
              <span style={{ fontWeight: 600, color: '#333', fontSize: '0.9rem' }}>Contato</span>
            </div>
            <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>(37) 3231-1234</p>
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <MapPin size={18} color="#2D5A1B" />
              <span style={{ fontWeight: 600, color: '#333', fontSize: '0.9rem' }}>Endereco</span>
            </div>
            <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>Para de Minas, MG</p>
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Clock size={18} color="#2D5A1B" />
              <span style={{ fontWeight: 600, color: '#333', fontSize: '0.9rem' }}>Horario</span>
            </div>
            <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>Seg a Sex, 8h as 18h</p>
          </div>
        </div>

        {/* Specialties */}
        <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a1a', marginTop: 0, marginBottom: 16 }}>Especialidades</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['Catarata', 'Glaucoma', 'Retina', 'Cirurgia Refrativa', 'Lentes de Contato', 'Oftalmopediatria'].map(s => (
              <span key={s} style={{
                padding: '6px 14px', borderRadius: 999, backgroundColor: '#f0f7ee', color: '#2D5A1B',
                fontSize: '0.8rem', fontWeight: 500,
              }}>{s}</span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setOpen(true)}
            style={{
              padding: '14px 32px', borderRadius: 999, border: 'none', backgroundColor: '#2D5A1B',
              color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(45,90,27,0.3)', transition: 'transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageCircle size={20} />
              Fale com a Ana pelo chat
            </span>
          </button>
          <p style={{ marginTop: 12, color: '#999', fontSize: '0.8rem' }}>
            Atendimento imediato via chat — sem fila
          </p>
        </div>
      </div>

      {/* ── Widget ── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 96, right: 24, width: 360, height: 580,
          borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 100, fontFamily: "'Segoe UI', Tahoma, sans-serif",
        }}>

          {/* Header */}
          <div style={{ backgroundColor: '#2D5A1B', height: 56, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, backgroundColor: '#fff' }}>
              <img src="/logo-eloy.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Clinica Dr. Eloy Chicata
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>Ana • Online agora</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {/* Chat */}
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', backgroundColor: '#ECE5DD', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                <div style={{
                  maxWidth: '80%', backgroundColor: m.role === 'user' ? '#DCF8C6' : '#FFFFFF',
                  color: '#111', padding: '10px 14px 6px', fontSize: '0.85rem', lineHeight: 1.45,
                  borderRadius: m.role === 'user' ? '12px 0 12px 12px' : '0 12px 12px 12px',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.content}
                  <div style={{ fontSize: '0.65rem', color: '#999', textAlign: 'right', marginTop: 4 }}>{m.time}</div>
                </div>
              </div>
            ))}

            {/* Quick buttons */}
            {buttons.length > 0 && !typing && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0 2px', justifyContent: 'flex-start' }}>
                {buttons.map(b => (
                  <button key={b} style={pill} onClick={() => sendText(b)}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f0f7ee'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                    {b}
                  </button>
                ))}
              </div>
            )}

            {/* Typing */}
            {typing && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 2 }}>
                <div style={{
                  backgroundColor: '#FFFFFF', padding: '10px 14px', borderRadius: '0 12px 12px 12px',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.06)', fontSize: '0.8rem', color: '#999',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  Ana esta digitando
                  <style>{`@keyframes dotblink{0%,80%{opacity:.2}40%{opacity:1}}`}</style>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#999', animation: 'dotblink 1.4s infinite 0s' }} />
                    <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#999', animation: 'dotblink 1.4s infinite 0.2s' }} />
                    <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#999', animation: 'dotblink 1.4s infinite 0.4s' }} />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ backgroundColor: '#F0F0F0', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Digite uma mensagem"
              style={{ flex: 1, padding: '10px 16px', borderRadius: 999, border: 'none', outline: 'none', fontSize: '0.85rem', backgroundColor: '#fff', color: '#111' }}
            />
            <button onClick={() => sendText(input)} disabled={!input.trim() || typing}
              style={{
                width: 38, height: 38, borderRadius: '50%', border: 'none', backgroundColor: '#25D366',
                color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: (!input.trim() || typing) ? 0.5 : 1, flexShrink: 0, transition: 'opacity 0.15s',
              }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 60, height: 60, borderRadius: '50%',
          backgroundColor: '#2D5A1B', border: 'none', cursor: 'pointer', zIndex: 101,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', transition: 'transform 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {open ? (
          <X size={26} color="#fff" />
        ) : (
          <>
            <img src="/logo-eloy.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <MessageCircle size={28} color="#fff" style={{ position: 'relative', zIndex: 1 }} />
          </>
        )}
      </button>
    </div>
  );
}
