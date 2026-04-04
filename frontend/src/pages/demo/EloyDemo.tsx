import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';

interface Message {
  role: 'assistant' | 'user';
  content: string;
  time: string;
}

const SYSTEM_PROMPT = `Você é Ana, secretária da Clínica Oftalmologia Avançada Dr. Eloy Chicata, localizada em Pará de Minas/MG. Você faz parte do time de atendimento de luxo da clínica. Você NÃO é um bot — você é uma pessoa real respondendo pelo WhatsApp.

PERSONA:
- Fale como uma secretária de luxo no WhatsApp: informal, direta, frases curtas
- Seu público é AAA — trate com sofisticação mas sem ser robótica
- Use termos como: Poxa, Entendi, Realmente, Claro
- Máximo 2 a 3 linhas por mensagem. Nunca escreva blocos de texto

PROIBIDO USAR:
- 'Como posso ser útil'
- 'É uma satisfação'
- 'Pautada pela segurança'
- 'Diálogo'
- Qualquer linguagem de robô ou call center

BACK TRACKING:
- Nunca repita a frase inteira do paciente
- Valide apenas o ponto central de forma breve e humana
- Ex: 'Poxa, passar o dia com dor de cabeça por causa das vistas é exaustivo.'

TÉCNICA SPIN:
- Faça perguntas de reflexão, não de questionário
- Uma pergunta por vez — NUNCA duas perguntas na mesma mensagem
- Ex: 'Hoje esse problema acaba te limitando em momentos simples, como uma leitura ou reunião?'

REGRA DE AGENDAMENTO — CRUCIAL:
- PROIBIDO sugerir agendamento antes do paciente responder pelo menos 2 perguntas de investigação SPIN
- Siga este fluxo obrigatório:
  1. Acolhimento + back tracking: valide a dor usando as palavras dele
  2. Pergunta SPIN de implicação: como o problema afeta a vida dele
  3. Após resposta: valide e faça mais uma pergunta de detalhamento
  4. Só então: apresente a clínica como solução e faça o convite suave
- Em vez de 'quer agendar?', use: 'O Dr. Eloy costuma analisar esses casos com muita calma. Faz sentido passar por uma avaliação para ele entender seu caso de perto?'

FOCO:
- Fale sempre da equipe e estrutura da Clínica Oftalmologia Avançada Dr. Eloy Chicata
- Só mencione o Dr. Eloy se o paciente perguntar por ele especificamente
- Nunca deixe a conversa morrer — sempre termine com uma pergunta ou resposta

CONTEXTO DA CLÍNICA:
- Especialidade: oftalmologia avançada
- Localização: Pará de Minas/MG
- Público: AAA — atendimento exclusivo e humanizado
- Tecnologia de ponta e equipe especializada`;

const INITIAL_MESSAGE = 'Olá! 👋 Aqui é a Ana, da Clínica Oftalmologia Avançada Dr. Eloy Chicata.\nNo que posso te ajudar hoje?';

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

function getTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function EloyDemo() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, typing]);

  // Initial message
  useEffect(() => {
    const t = setTimeout(() => {
      setMessages([{ role: 'assistant', content: INITIAL_MESSAGE, time: getTime() }]);
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || typing) return;

    const userMsg: Message = { role: 'user', content: text, time: getTime() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setTyping(true);

    // Random delay 1.5-2.5s
    const delay = 1500 + Math.random() * 1000;

    try {
      const apiMessages = updated.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });

      const data = await res.json();
      const reply = data.content?.[0]?.text || 'Desculpa, não consegui responder agora. Pode repetir?';

      await new Promise(r => setTimeout(r, delay));

      setMessages(prev => [...prev, { role: 'assistant', content: reply, time: getTime() }]);
    } catch {
      await new Promise(r => setTimeout(r, delay));
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ops, tive um probleminha aqui. Pode mandar de novo?', time: getTime() }]);
    } finally {
      setTyping(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#ECE5DD', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>

      {/* Header */}
      <div style={{ backgroundColor: '#2D5A1B', height: 60, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, backgroundColor: '#fff' }}>
          <img src="/logo-eloy.jpg" alt="Clínica" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Clínica Oftalmologia Avançada Dr. Eloy Chicata
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>Ana • Online agora</div>
        </div>
      </div>

      {/* Chat area */}
      <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
            <div style={{
              maxWidth: '75%',
              backgroundColor: m.role === 'user' ? '#DCF8C6' : '#FFFFFF',
              color: '#111',
              padding: '8px 12px 6px',
              borderRadius: m.role === 'user' ? '12px 0 12px 12px' : '0 12px 12px 12px',
              boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
              position: 'relative',
              fontSize: '0.9rem',
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {m.content}
              <div style={{ fontSize: '0.65rem', color: '#999', textAlign: 'right', marginTop: 4 }}>{m.time}</div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {typing && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 2 }}>
            <div style={{
              backgroundColor: '#FFFFFF', padding: '8px 14px', borderRadius: '0 12px 12px 12px',
              boxShadow: '0 1px 1px rgba(0,0,0,0.08)', fontSize: '0.85rem', color: '#999',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              Ana está digitando
              <span style={{ display: 'inline-flex', gap: 2 }}>
                <style>{`@keyframes blink{0%,80%{opacity:.2}40%{opacity:1}}`}</style>
                <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#999', animation: 'blink 1.4s infinite 0s' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#999', animation: 'blink 1.4s infinite 0.2s' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#999', animation: 'blink 1.4s infinite 0.4s' }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ backgroundColor: '#F0F0F0', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Digite uma mensagem"
          style={{
            flex: 1, padding: '10px 16px', borderRadius: 999, border: 'none', outline: 'none',
            fontSize: '0.9rem', backgroundColor: '#fff', color: '#111',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || typing}
          style={{
            width: 42, height: 42, borderRadius: '50%', border: 'none',
            backgroundColor: '#25D366', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: (!input.trim() || typing) ? 0.5 : 1, transition: 'opacity 0.15s',
            flexShrink: 0,
          }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
