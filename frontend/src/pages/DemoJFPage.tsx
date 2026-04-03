import { useState, useRef, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://backend-production-e9a8.up.railway.app/api/v1';

function generateSessionId(): string {
  return 'jf-' + crypto.randomUUID();
}

interface ButtonOption {
  id: string;
  label: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  buttons?: ButtonOption[];
}

function sanitizeReply(text: string): string {
  const trimmed = text.trim();
  // Detect raw JSON leaked as reply text
  if ((trimmed.startsWith('{') || trimmed.startsWith("{'")) && trimmed.includes('message')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.message === 'string') return parsed.message;
    } catch { /* try single-quote fix */ }
    try {
      const fixed = trimmed.replace(/'/g, '"');
      const parsed = JSON.parse(fixed);
      if (typeof parsed.message === 'string') return parsed.message;
    } catch { /* try regex */ }
    const match = trimmed.match(/['"]message['"]\s*:\s*['"](.+?)['"]\s*[,}]/);
    if (match) return match[1];
    return 'Ops, tive um problema aqui. Pode repetir?';
  }
  return text;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  text: 'Olá! 👋 Aqui é a equipe da JF Odontologia. Em que posso te ajudar hoje?',
  sender: 'bot',
  timestamp: new Date(),
  buttons: [
    { id: 'btn_1', label: 'Quero melhorar meu sorriso' },
    { id: 'btn_2', label: 'Estou com dor' },
    { id: 'btn_3', label: 'Tenho uma dúvida' },
  ],
};

export function DemoJFPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState(generateSessionId);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [activeButtons, setActiveButtons] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !hasGreeted) {
      setHasGreeted(true);
      setTimeout(() => {
        setMessages([{ ...WELCOME_MESSAGE, timestamp: new Date() }]);
        setActiveButtons('welcome');
      }, 500);
    }
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, hasGreeted]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isTyping) return;

    setActiveButtons(null);

    const userMsg: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch(`${API_URL}/demo-jf/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), sessionId }),
      });

      const data = await res.json();
      const botMsgId = (Date.now() + 1).toString();

      const replyText = sanitizeReply(data.reply || data.error || 'Erro ao processar mensagem.');

      const botMsg: Message = {
        id: botMsgId,
        text: replyText,
        sender: 'bot',
        timestamp: new Date(),
        buttons: data.buttons && data.buttons.length > 0 ? data.buttons : undefined,
      };

      setMessages(prev => [...prev, botMsg]);

      if (botMsg.buttons && botMsg.buttons.length > 0) {
        setActiveButtons(botMsgId);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: 'Erro de conexão. Verifique sua internet e tente novamente.',
        sender: 'bot',
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping, sessionId]);

  const handleButtonClick = useCallback((label: string) => {
    sendMessage(label);
  }, [sendMessage]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (text) sendMessage(text);
  }, [input, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="jf-page">
      <div className="jf-bg" />

      <div className="jf-content">
        <div className="jf-badge">DEMONSTRAÇÃO</div>
        <h1 className="jf-title">JF Odontologia de<br />Reabilitação Oral</h1>
        <p className="jf-subtitle">Atendimento exclusivo — Aracaju/SE</p>

        <div className="jf-features">
          <div className="jf-feature">
            <div className="jf-feature-icon">✨</div>
            <div>
              <strong>Atendimento Premium</strong>
              <p>Experiência exclusiva para público AAA</p>
            </div>
          </div>
          <div className="jf-feature">
            <div className="jf-feature-icon">🦷</div>
            <div>
              <strong>Reabilitação Oral</strong>
              <p>Tratamentos de alta complexidade</p>
            </div>
          </div>
          <div className="jf-feature">
            <div className="jf-feature-icon">💬</div>
            <div>
              <strong>Chat Inteligente</strong>
              <p>Atendimento humanizado com IA</p>
            </div>
          </div>
        </div>

        <p className="jf-cta">
          Clique no botão de chat para iniciar o atendimento →
        </p>
      </div>

      {/* FAB */}
      {!isOpen && (
        <button className="jf-fab" onClick={() => setIsOpen(true)} aria-label="Abrir chat">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="jf-chat">
          {/* Header */}
          <div className="jf-chat-header">
            <div className="jf-chat-header-left">
              <div className="jf-avatar">JF</div>
              <div>
                <div className="jf-chat-name">JF Odontologia</div>
                <div className="jf-chat-status">Online agora</div>
              </div>
            </div>
            <button className="jf-chat-close" onClick={() => setIsOpen(false)} aria-label="Fechar chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="jf-messages">
            {messages.map(msg => (
              <div key={msg.id} className={msg.sender === 'bot' ? 'jf-msg-group' : ''}>
                <div className={`jf-bubble ${msg.sender === 'user' ? 'jf-bubble-user' : 'jf-bubble-bot'}`}>
                  <div className="jf-bubble-text">{msg.text}</div>
                  <div className={`jf-bubble-time ${msg.sender === 'user' ? 'jf-bubble-time-user' : ''}`}>{formatTime(msg.timestamp)}</div>
                </div>
                {msg.sender === 'bot' && msg.buttons && msg.buttons.length > 0 && activeButtons === msg.id && (
                  <div className="jf-buttons">
                    {msg.buttons.map(btn => (
                      <button
                        key={btn.id}
                        className="jf-btn-option"
                        onClick={() => handleButtonClick(btn.label)}
                        disabled={isTyping}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="jf-bubble jf-bubble-bot">
                <div className="jf-typing">
                  <span className="jf-typing-dot" />
                  <span className="jf-typing-dot" />
                  <span className="jf-typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="jf-input-bar">
            <input
              ref={inputRef}
              className="jf-input"
              type="text"
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={500}
              disabled={isTyping}
            />
            <button
              className="jf-send"
              onClick={handleSubmit}
              disabled={!input.trim() || isTyping}
              aria-label="Enviar mensagem"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        .jf-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .jf-bg {
          position: fixed;
          inset: 0;
          background: linear-gradient(160deg, #0a0a0a 0%, #1a1a1a 40%, #111111 100%);
          z-index: 0;
        }

        .jf-bg::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle at 25% 35%, rgba(201, 168, 76, 0.06) 0%, transparent 50%),
                      radial-gradient(circle at 75% 65%, rgba(201, 168, 76, 0.03) 0%, transparent 50%);
        }

        .jf-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
          text-align: center;
        }

        .jf-badge {
          display: inline-block;
          background: rgba(201, 168, 76, 0.1);
          color: #C9A84C;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          padding: 0.3rem 1rem;
          border-radius: 9999px;
          margin-bottom: 2rem;
          border: 1px solid rgba(201, 168, 76, 0.2);
        }

        .jf-title {
          font-size: clamp(1.8rem, 5vw, 3rem);
          font-weight: 300;
          color: #f5f5f5;
          margin: 0 0 1rem;
          line-height: 1.2;
          letter-spacing: -0.02em;
        }

        .jf-subtitle {
          font-size: clamp(0.95rem, 2.5vw, 1.15rem);
          color: #C9A84C;
          margin: 0 0 3rem;
          font-weight: 400;
          letter-spacing: 0.05em;
        }

        .jf-features {
          display: flex;
          gap: 1.25rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 3rem;
          max-width: 700px;
        }

        .jf-feature {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(201, 168, 76, 0.1);
          border-radius: 12px;
          padding: 1.25rem;
          width: 200px;
          text-align: left;
        }

        .jf-feature-icon {
          font-size: 1.4rem;
          flex-shrink: 0;
        }

        .jf-feature strong {
          color: #e8e8e8;
          font-size: 0.85rem;
          font-weight: 500;
          display: block;
          margin-bottom: 0.25rem;
        }

        .jf-feature p {
          color: #666;
          font-size: 0.78rem;
          margin: 0;
        }

        .jf-cta {
          color: #555;
          font-size: 0.9rem;
          animation: jfPulse 2s ease-in-out infinite;
        }

        @keyframes jfPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        /* FAB */
        .jf-fab {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #C9A84C, #A8893A);
          color: #1a1a1a;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 24px rgba(201, 168, 76, 0.35);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .jf-fab:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 32px rgba(201, 168, 76, 0.5);
        }

        /* Chat Window */
        .jf-chat {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
          width: 380px;
          max-width: calc(100vw - 32px);
          height: 560px;
          max-height: calc(100vh - 48px);
          background: #1a1a1a;
          border-radius: 16px;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(201, 168, 76, 0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: jfSlideUp 0.3s ease-out;
        }

        @keyframes jfSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Header */
        .jf-chat-header {
          background: linear-gradient(135deg, #1f1f1f, #171717);
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          border-bottom: 1px solid rgba(201, 168, 76, 0.15);
        }

        .jf-chat-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .jf-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #C9A84C, #A8893A);
          color: #1a1a1a;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          flex-shrink: 0;
          letter-spacing: 0.02em;
        }

        .jf-chat-name {
          color: #f0f0f0;
          font-weight: 600;
          font-size: 0.85rem;
          line-height: 1.3;
        }

        .jf-chat-status {
          color: #C9A84C;
          font-size: 0.72rem;
          font-weight: 400;
        }

        .jf-chat-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s, background 0.2s;
          flex-shrink: 0;
        }

        .jf-chat-close:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.7);
        }

        /* Messages */
        .jf-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #111111;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 0;
        }

        .jf-msg-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-start;
        }

        .jf-bubble {
          max-width: 82%;
          padding: 10px 14px;
          border-radius: 14px;
          word-wrap: break-word;
          line-height: 1.5;
          font-size: 0.88rem;
        }

        .jf-bubble-bot {
          align-self: flex-start;
          background: #242424;
          color: #e0e0e0;
          border-bottom-left-radius: 4px;
        }

        .jf-bubble-user {
          align-self: flex-end;
          background: linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(201, 168, 76, 0.1));
          color: #f0e8d0;
          border-bottom-right-radius: 4px;
          border: 1px solid rgba(201, 168, 76, 0.15);
        }

        .jf-bubble-text {
          white-space: pre-wrap;
        }

        .jf-bubble-time {
          font-size: 0.62rem;
          color: #555;
          text-align: right;
          margin-top: 4px;
        }

        .jf-bubble-time-user {
          color: rgba(201, 168, 76, 0.5);
        }

        /* Buttons */
        .jf-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding-left: 4px;
          animation: jfFadeIn 0.3s ease-out;
        }

        @keyframes jfFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .jf-btn-option {
          background: transparent;
          color: #C9A84C;
          border: 1.5px solid rgba(201, 168, 76, 0.4);
          border-radius: 20px;
          padding: 7px 16px;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          white-space: nowrap;
        }

        .jf-btn-option:hover:not(:disabled) {
          background: rgba(201, 168, 76, 0.15);
          border-color: #C9A84C;
          color: #d4b65e;
        }

        .jf-btn-option:active:not(:disabled) {
          transform: scale(0.96);
        }

        .jf-btn-option:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* Typing */
        .jf-typing {
          display: flex;
          gap: 4px;
          padding: 4px 0;
        }

        .jf-typing-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #C9A84C;
          animation: jfBounce 1.4s ease-in-out infinite;
        }

        .jf-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .jf-typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes jfBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
          30% { transform: translateY(-5px); opacity: 1; }
        }

        /* Input */
        .jf-input-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: #1a1a1a;
          border-top: 1px solid rgba(201, 168, 76, 0.1);
          flex-shrink: 0;
        }

        .jf-input {
          flex: 1;
          border: 1px solid rgba(201, 168, 76, 0.2);
          border-radius: 24px;
          padding: 10px 16px;
          font-size: 0.9rem;
          outline: none;
          background: #111111;
          color: #e0e0e0;
          transition: border-color 0.2s;
          font-family: inherit;
        }

        .jf-input::placeholder {
          color: #555;
        }

        .jf-input:focus {
          border-color: rgba(201, 168, 76, 0.5);
        }

        .jf-input:disabled {
          opacity: 0.5;
        }

        .jf-send {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #C9A84C, #A8893A);
          color: #1a1a1a;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s, transform 0.2s;
          flex-shrink: 0;
        }

        .jf-send:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .jf-send:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        /* Mobile */
        @media (max-width: 767px) {
          .jf-fab {
            width: 52px;
            height: 52px;
            bottom: 16px;
            right: 16px;
          }

          .jf-fab svg {
            width: 22px;
            height: 22px;
          }

          .jf-chat {
            bottom: 78px;
            right: 10px;
            left: 10px;
            width: auto;
            max-width: none;
            height: auto;
            max-height: min(85vh, calc(100dvh - 88px));
            border-radius: 14px;
          }

          .jf-chat-header {
            padding: 10px 12px;
          }

          .jf-avatar {
            width: 34px;
            height: 34px;
            font-size: 0.75rem;
          }

          .jf-chat-name {
            font-size: 0.8rem;
          }

          .jf-messages {
            padding: 12px;
          }

          .jf-input-bar {
            padding: 10px;
          }

          .jf-input {
            padding: 9px 14px;
            font-size: 16px;
          }

          .jf-btn-option {
            padding: 6px 12px;
            font-size: 0.8rem;
          }
        }

        /* Scrollbar */
        .jf-messages::-webkit-scrollbar {
          width: 4px;
        }

        .jf-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        .jf-messages::-webkit-scrollbar-thumb {
          background: rgba(201, 168, 76, 0.2);
          border-radius: 4px;
        }

        .jf-messages::-webkit-scrollbar-thumb:hover {
          background: rgba(201, 168, 76, 0.35);
        }
      `}</style>
    </div>
  );
}
