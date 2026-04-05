import { useState, useEffect, useRef } from 'react';
import { Send, X, MessageCircle, Phone, MapPin, Clock } from 'lucide-react';

interface Msg {
  role: 'assistant' | 'user';
  content: string;
  time: string;
}

interface ChatButton {
  id: string;
  label: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://backend-production-e9a8.up.railway.app/api/v1';

function timeNow() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Input masks
function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const PLACEHOLDERS: Record<string, string> = {
  name: 'Digite seu nome completo...',
  phone: '(00) 00000-0000',
  cpf: '000.000.000-00',
  email: 'seu@email.com',
  date: 'DD/MM/AAAA',
  address: 'Rua, numero, cidade...',
  text: 'Digite uma mensagem',
};

const INITIAL_BUTTONS: ChatButton[] = [
  { id: 'schedule', label: 'Quero agendar uma consulta' },
  { id: 'vision', label: 'Tenho um problema de visao' },
  { id: 'treatments', label: 'Quero saber sobre os tratamentos' },
  { id: 'question', label: 'Tenho uma duvida' },
];

export function EloyDemo() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [buttons, setButtons] = useState<ChatButton[]>([]);
  const [, setCurrentStep] = useState('idle');
  const [inputHint, setInputHint] = useState<string>('text');
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initDone = useRef(false);
  const sessionId = useRef(generateId());

  // Auto-open after 2s
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, sending]);

  // Init message
  useEffect(() => {
    if (!open || initDone.current) return;
    initDone.current = true;
    setSending(true);
    setTimeout(() => {
      setMessages([{ role: 'assistant', content: 'Ola! Aqui e a Ana, da Clinica Dr. Eloy Chicata.\nNo que posso te ajudar hoje?', time: timeNow() }]);
      setButtons(INITIAL_BUTTONS);
      setSending(false);
    }, 800);
  }, [open]);

  // Focus
  useEffect(() => {
    if (open && !sending && inputRef.current) inputRef.current.focus();
  }, [open, sending]);

  // Apply mask based on current step
  function handleInputChange(value: string) {
    if (inputHint === 'cpf') {
      setInput(maskCPF(value));
    } else if (inputHint === 'phone') {
      setInput(maskPhone(value));
    } else {
      setInput(value);
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setMessages(prev => [...prev, { role: 'user', content: trimmed, time: timeNow() }]);
    setInput('');
    setButtons([]);
    setSending(true);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);

      const res = await fetch(`${API_URL}/demo-eloy/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId: sessionId.current }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const reply = data.reply || data.error || 'Desculpe, nao consegui responder.';
      const newButtons: ChatButton[] = data.buttons || [];
      const step = data.currentStep || 'idle';
      const hint = data.inputHint || 'text';

      // Small typing delay
      await new Promise(r => setTimeout(r, 600 + Math.random() * 500));

      setMessages(prev => [...prev, { role: 'assistant', content: reply, time: timeNow() }]);
      setButtons(newButtons);
      setCurrentStep(step);
      setInputHint(hint);
    } catch (err: any) {
      console.error('[DEMO-ELOY] Error:', err);
      const errorMsg = err?.name === 'AbortError'
        ? 'Desculpe, estou com dificuldades tecnicas. Tente novamente.'
        : 'Ops, tive um probleminha aqui. Pode mandar de novo?';
      await new Promise(r => setTimeout(r, 400));
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg, time: timeNow() }]);
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const placeholder = PLACEHOLDERS[inputHint] || PLACEHOLDERS.text;
  // Hide text input when there are many buttons (selection step)
  const isSelectionStep = buttons.length > 2 && !sending;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8faf7' }}>

      {/* Landing */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
          {[
            { icon: <Phone size={18} color="#2D5A1B" />, title: 'Contato', text: '(37) 3231-1234' },
            { icon: <MapPin size={18} color="#2D5A1B" />, title: 'Endereco', text: 'Para de Minas, MG' },
            { icon: <Clock size={18} color="#2D5A1B" />, title: 'Horario', text: 'Seg a Sex, 8h as 18h' },
          ].map(card => (
            <div key={card.title} style={{ backgroundColor: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {card.icon}
                <span style={{ fontWeight: 600, color: '#333', fontSize: '0.9rem' }}>{card.title}</span>
              </div>
              <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>{card.text}</p>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a1a', marginTop: 0, marginBottom: 16 }}>Especialidades</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['Catarata', 'Glaucoma', 'Retina', 'Cirurgia Refrativa', 'Lentes de Contato', 'Oftalmopediatria'].map(s => (
              <span key={s} style={{ padding: '6px 14px', borderRadius: 999, backgroundColor: '#f0f7ee', color: '#2D5A1B', fontSize: '0.8rem', fontWeight: 500 }}>{s}</span>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button onClick={() => setOpen(true)} style={{
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
          <p style={{ marginTop: 12, color: '#999', fontSize: '0.8rem' }}>Atendimento imediato via chat — sem fila</p>
        </div>
      </div>

      {/* Chat Widget */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 96, right: 24, width: 370, height: 600,
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
              <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>Clinica Dr. Eloy Chicata</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>Ana - Online agora</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', backgroundColor: '#ECE5DD', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                <div style={{
                  maxWidth: '82%', backgroundColor: m.role === 'user' ? '#DCF8C6' : '#FFFFFF',
                  color: '#111', padding: '10px 14px 6px', fontSize: '0.85rem', lineHeight: 1.45,
                  borderRadius: m.role === 'user' ? '12px 0 12px 12px' : '0 12px 12px 12px',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.06)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.content}
                  <div style={{ fontSize: '0.65rem', color: '#999', textAlign: 'right', marginTop: 4 }}>{m.time}</div>
                </div>
              </div>
            ))}

            {/* Buttons */}
            {buttons.length > 0 && !sending && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0 2px' }}>
                {buttons.map(b => {
                  const isConfirm = b.id === 'confirm' || b.label.toLowerCase().includes('confirmar');
                  return (
                    <button key={b.id}
                      style={{
                        padding: '8px 16px', borderRadius: 999,
                        border: isConfirm ? 'none' : '1.5px solid #2D5A1B',
                        backgroundColor: isConfirm ? '#2D5A1B' : '#fff',
                        color: isConfirm ? '#fff' : '#2D5A1B',
                        fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                        whiteSpace: 'nowrap', transition: 'background 0.15s, transform 0.1s',
                      }}
                      onClick={() => sendMessage(b.label)}
                      onMouseEnter={e => {
                        if (!isConfirm) e.currentTarget.style.backgroundColor = '#f0f7ee';
                        e.currentTarget.style.transform = 'scale(1.03)';
                      }}
                      onMouseLeave={e => {
                        if (!isConfirm) e.currentTarget.style.backgroundColor = '#fff';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}>
                      {b.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Typing */}
            {sending && (
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
            {!isSelectionStep && (
              <>
                <input
                  ref={inputRef}
                  type={inputHint === 'email' ? 'email' : 'text'}
                  inputMode={inputHint === 'cpf' || inputHint === 'phone' ? 'numeric' : inputHint === 'email' ? 'email' : 'text'}
                  value={input}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={placeholder}
                  disabled={sending}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 999, border: 'none', outline: 'none',
                    fontSize: '0.85rem', backgroundColor: '#fff', color: '#111',
                    opacity: sending ? 0.6 : 1,
                  }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || sending}
                  style={{
                    width: 38, height: 38, borderRadius: '50%', border: 'none', backgroundColor: '#25D366',
                    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: (!input.trim() || sending) ? 0.5 : 1, flexShrink: 0, transition: 'opacity 0.15s',
                  }}>
                  <Send size={16} />
                </button>
              </>
            )}
            {isSelectionStep && (
              <p style={{ margin: 0, padding: '10px 0', color: '#999', fontSize: '0.8rem', textAlign: 'center', width: '100%' }}>
                Selecione uma opcao acima
              </p>
            )}
          </div>
        </div>
      )}

      {/* Floating button */}
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
        {open ? <X size={26} color="#fff" /> : (
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
