import { useState, useRef, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://backend-production-e9a8.up.railway.app/api/v1';

function generateSessionId(): string {
  return 'demo-' + crypto.randomUUID();
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
    return 'Desculpe, tive um probleminha. Pode repetir?';
  }
  return text;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  text: 'Olá! 👋 Sou a Ana, assistente virtual da Clínica Saúde Total. Posso ajudar com informações, agendamentos e muito mais. Como posso te ajudar hoje?',
  sender: 'bot',
  timestamp: new Date(),
  buttons: [
    { id: 'btn_1', label: 'Agendar consulta' },
    { id: 'btn_2', label: 'Informações sobre a clínica' },
    { id: 'btn_3', label: 'Falar com atendente' },
  ],
};

export function DemoPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState(generateSessionId);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [activeButtons, setActiveButtons] = useState<string | null>(null); // message id with active buttons
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

    // Clear active buttons
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
      const res = await fetch(`${API_URL}/demo/chat`, {
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
    if (text) {
      sendMessage(text);
    }
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
    <div className="demo-page">
      {/* Background */}
      <div className="demo-bg" />

      {/* Content */}
      <div className="demo-content">
        <div className="demo-badge">DEMONSTRAÇÃO</div>
        <h1 className="demo-title">Veja o chatbot em ação</h1>
        <p className="demo-subtitle">Simule um atendimento real de uma clínica médica</p>

        <div className="demo-features">
          <div className="demo-feature">
            <div className="demo-feature-icon">🤖</div>
            <div>
              <strong>IA Inteligente</strong>
              <p>Respostas naturais com Claude AI</p>
            </div>
          </div>
          <div className="demo-feature">
            <div className="demo-feature-icon">📱</div>
            <div>
              <strong>WhatsApp Integrado</strong>
              <p>Atendimento 24h pelo WhatsApp</p>
            </div>
          </div>
          <div className="demo-feature">
            <div className="demo-feature-icon">📅</div>
            <div>
              <strong>Agendamentos</strong>
              <p>Marcação automática de consultas</p>
            </div>
          </div>
        </div>

        <p className="demo-cta">
          Clique no botão de chat no canto inferior direito para começar →
        </p>
      </div>

      {/* Chat Widget */}
      {!isOpen && (
        <button className="chat-fab" onClick={() => setIsOpen(true)} aria-label="Abrir chat">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="chat-window">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-left">
              <div className="chat-avatar">A</div>
              <div>
                <div className="chat-name">Ana - Assistente da Clínica Saúde Total</div>
                <div className="chat-status">Online</div>
              </div>
            </div>
            <button className="chat-close" onClick={() => setIsOpen(false)} aria-label="Fechar chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map(msg => (
              <div key={msg.id} className={msg.sender === 'bot' ? 'chat-msg-group' : ''}>
                <div className={`chat-bubble ${msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}`}>
                  <div className="chat-bubble-text">{msg.text}</div>
                  <div className="chat-bubble-time">{formatTime(msg.timestamp)}</div>
                </div>
                {msg.sender === 'bot' && msg.buttons && msg.buttons.length > 0 && activeButtons === msg.id && (
                  <div className="chat-buttons">
                    {msg.buttons.map(btn => (
                      <button
                        key={btn.id}
                        className="chat-btn-option"
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
              <div className="chat-bubble chat-bubble-bot">
                <div className="chat-typing">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-bar">
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={500}
              disabled={isTyping}
            />
            <button
              className="chat-send"
              onClick={handleSubmit}
              disabled={!input.trim() || isTyping}
              aria-label="Enviar mensagem"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        .demo-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .demo-bg {
          position: fixed;
          inset: 0;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          z-index: 0;
        }

        .demo-bg::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle at 30% 40%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
                      radial-gradient(circle at 70% 60%, rgba(16, 185, 129, 0.06) 0%, transparent 50%);
        }

        .demo-content {
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

        .demo-badge {
          display: inline-block;
          background: rgba(99, 102, 241, 0.15);
          color: #818cf8;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          padding: 0.35rem 1rem;
          border-radius: 9999px;
          margin-bottom: 1.5rem;
          border: 1px solid rgba(99, 102, 241, 0.2);
        }

        .demo-title {
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 1rem;
          line-height: 1.1;
        }

        .demo-subtitle {
          font-size: clamp(1rem, 2.5vw, 1.25rem);
          color: #94a3b8;
          margin: 0 0 3rem;
          max-width: 500px;
        }

        .demo-features {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 3rem;
          max-width: 700px;
        }

        .demo-feature {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 1.25rem;
          width: 200px;
          text-align: left;
        }

        .demo-feature-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .demo-feature strong {
          color: #e2e8f0;
          font-size: 0.9rem;
          display: block;
          margin-bottom: 0.25rem;
        }

        .demo-feature p {
          color: #64748b;
          font-size: 0.8rem;
          margin: 0;
        }

        .demo-cta {
          color: #64748b;
          font-size: 0.95rem;
          animation: pulse-opacity 2s ease-in-out infinite;
        }

        @keyframes pulse-opacity {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        /* Chat FAB */
        .chat-fab {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .chat-fab:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 28px rgba(16, 185, 129, 0.5);
        }

        /* Chat Window */
        .chat-window {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
          width: 380px;
          max-width: calc(100vw - 32px);
          height: 560px;
          max-height: calc(100vh - 48px);
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Chat Header */
        .chat-header {
          background: linear-gradient(135deg, #10b981, #059669);
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .chat-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .chat-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1rem;
          flex-shrink: 0;
        }

        .chat-name {
          color: white;
          font-weight: 600;
          font-size: 0.85rem;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }

        .chat-status {
          color: rgba(255, 255, 255, 0.75);
          font-size: 0.75rem;
        }

        .chat-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.8);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
          flex-shrink: 0;
        }

        .chat-close:hover {
          background: rgba(255, 255, 255, 0.15);
          color: white;
        }

        /* Messages */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #f0f2f5;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .chat-msg-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-start;
        }

        .chat-bubble {
          max-width: 80%;
          padding: 8px 12px;
          border-radius: 12px;
          word-wrap: break-word;
          line-height: 1.45;
          font-size: 0.9rem;
        }

        .chat-bubble-bot {
          align-self: flex-start;
          background: white;
          color: #1e293b;
          border-bottom-left-radius: 4px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        }

        .chat-bubble-user {
          align-self: flex-end;
          background: #dcf8c6;
          color: #1e293b;
          border-bottom-right-radius: 4px;
        }

        .chat-bubble-text {
          white-space: pre-wrap;
        }

        .chat-bubble-time {
          font-size: 0.65rem;
          color: #94a3b8;
          text-align: right;
          margin-top: 4px;
        }

        /* Buttons */
        .chat-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding-left: 4px;
          animation: fadeInButtons 0.3s ease-out;
        }

        @keyframes fadeInButtons {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .chat-btn-option {
          background: white;
          color: #059669;
          border: 1.5px solid #10b981;
          border-radius: 20px;
          padding: 7px 16px;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          white-space: nowrap;
        }

        .chat-btn-option:hover:not(:disabled) {
          background: #10b981;
          color: white;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }

        .chat-btn-option:active:not(:disabled) {
          transform: scale(0.96);
        }

        .chat-btn-option:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Typing Animation */
        .chat-typing {
          display: flex;
          gap: 4px;
          padding: 4px 0;
        }

        .chat-typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #94a3b8;
          animation: typingBounce 1.4s ease-in-out infinite;
        }

        .chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }

        /* Input Bar */
        .chat-input-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: white;
          border-top: 1px solid #e2e8f0;
          flex-shrink: 0;
        }

        .chat-input {
          flex: 1;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 10px 16px;
          font-size: 0.9rem;
          outline: none;
          background: #f8fafc;
          transition: border-color 0.2s;
          font-family: inherit;
        }

        .chat-input:focus {
          border-color: #10b981;
        }

        .chat-input:disabled {
          opacity: 0.6;
        }

        .chat-send {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #10b981;
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, opacity 0.2s;
          flex-shrink: 0;
        }

        .chat-send:hover:not(:disabled) {
          background: #059669;
        }

        .chat-send:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        @media (max-width: 767px) {
          .chat-fab {
            width: 52px;
            height: 52px;
            bottom: 16px;
            right: 16px;
          }

          .chat-fab svg {
            width: 24px;
            height: 24px;
          }

          .chat-window {
            bottom: 78px;
            right: 10px;
            left: 10px;
            width: auto;
            max-width: none;
            height: auto;
            max-height: min(85vh, calc(100dvh - 88px));
            border-radius: 14px;
          }

          .chat-header {
            padding: 10px 12px;
          }

          .chat-avatar {
            width: 34px;
            height: 34px;
            font-size: 0.9rem;
          }

          .chat-name {
            font-size: 0.8rem;
            max-width: 180px;
          }

          .chat-messages {
            padding: 12px;
            min-height: 0;
          }

          .chat-input-bar {
            padding: 10px;
          }

          .chat-input {
            padding: 9px 14px;
            font-size: 16px;
          }

          .chat-btn-option {
            padding: 6px 12px;
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  );
}
