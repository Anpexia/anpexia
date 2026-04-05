import { useState, useRef, useEffect } from 'react';
import { CheckCircle, X, ArrowLeft } from 'lucide-react';

interface Message {
  id: string;
  from: 'clinic' | 'patient';
  text: string;
  time: string;
  buttons?: { id: string; label: string; action: string }[];
}

const DEMO_APPOINTMENT = {
  id: 'demo-appointment-001',
  patientName: 'Angelo Larocca',
  doctorName: 'Dr. Ricardo Mendes',
  clinicName: 'Clinica Dr. Eloy Chicata',
  date: '01/05/2026',
  time: '14:00',
};

const API_URL = import.meta.env.VITE_API_URL ||
  (window.location.hostname.includes('vercel.app')
    ? 'https://backend-production-e9a8.up.railway.app/api/v1'
    : '/api/v1');

function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ConfirmacaoDemo() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('scheduled');
  const [phase, setPhase] = useState<'idle' | '48h' | '2h' | 'done'>('idle');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (msg: Omit<Message, 'id' | 'time'>) => {
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID(), time: now() }]);
  };

  const callApi = async (action: string) => {
    try {
      const res = await fetch(`${API_URL}/scheduling/confirm-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: DEMO_APPOINTMENT.id, action }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.data;
      }
    } catch {
      // Demo mode — simulate responses locally
    }
    return null;
  };

  // --- Start 48h confirmation flow ---
  const start48h = () => {
    setPhase('48h');
    setStatus('scheduled');
    setMessages([]);
    addMessage({
      from: 'clinic',
      text:
        `Ola, ${DEMO_APPOINTMENT.patientName}! 👋\n` +
        `Sua consulta esta confirmada:\n` +
        `📅 Data: ${DEMO_APPOINTMENT.date}\n` +
        `⏰ Horario: ${DEMO_APPOINTMENT.time}\n` +
        `👨‍⚕️ Medico: ${DEMO_APPOINTMENT.doctorName}\n` +
        `📍 ${DEMO_APPOINTMENT.clinicName}\n\n` +
        `Por favor, confirme sua presenca:`,
      buttons: [
        { id: 'confirm', label: '✅ Confirmar presenca', action: 'confirm' },
        { id: 'cancel', label: '❌ Nao posso comparecer', action: 'cancel' },
      ],
    });
  };

  // --- Start 2h reminder ---
  const start2h = () => {
    setPhase('2h');
    addMessage({
      from: 'clinic',
      text:
        `Ola, ${DEMO_APPOINTMENT.patientName}! Lembrando que sua consulta e hoje as ${DEMO_APPOINTMENT.time} com ${DEMO_APPOINTMENT.doctorName}. Te esperamos! 🏥`,
    });
  };

  // --- Handle button click ---
  const handleButton = async (action: string, label: string) => {
    // Show patient's choice
    addMessage({ from: 'patient', text: label });

    // Try API call (will fallback to local simulation)
    await callApi(action);

    // Simulate response based on action
    setTimeout(() => {
      switch (action) {
        case 'confirm':
          setStatus('confirmed');
          addMessage({
            from: 'clinic',
            text: `Presenca confirmada! ✅ Te esperamos no dia ${DEMO_APPOINTMENT.date} as ${DEMO_APPOINTMENT.time}.`,
          });
          break;

        case 'cancel':
          addMessage({
            from: 'clinic',
            text: 'Tem certeza que deseja cancelar? Escolha:',
            buttons: [
              { id: 'cancel_confirm', label: 'Sim, cancelar consulta', action: 'cancel_confirm' },
              { id: 'keep', label: 'Nao, manter consulta', action: 'keep' },
            ],
          });
          break;

        case 'cancel_confirm':
          setStatus('cancelled');
          addMessage({
            from: 'clinic',
            text: 'Consulta cancelada. Quando quiser reagendar, estamos aqui! 📞',
          });
          // Show clinic notification
          setTimeout(() => {
            addMessage({
              from: 'clinic',
              text: `⚠️ [AVISO INTERNO] O paciente ${DEMO_APPOINTMENT.patientName} cancelou a consulta do dia ${DEMO_APPOINTMENT.date} as ${DEMO_APPOINTMENT.time}.`,
            });
          }, 800);
          break;

        case 'keep':
          setStatus('confirmed');
          addMessage({
            from: 'clinic',
            text: `Otimo! Sua consulta do dia ${DEMO_APPOINTMENT.date} as ${DEMO_APPOINTMENT.time} continua confirmada. ✅`,
          });
          break;
      }
    }, 600);
  };

  const reset = () => {
    setMessages([]);
    setStatus('scheduled');
    setPhase('idle');
  };

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<string, string> = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Demo — Confirmacao de Consulta</h1>
          <p className="text-sm text-slate-500 mt-1">Simulacao do fluxo WhatsApp de confirmacao</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="text-xs text-slate-500">Status:</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[status] || ''}`}>
              {statusLabels[status] || status}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        {phase === 'idle' && (
          <div className="flex flex-col gap-3 mb-6">
            <button onClick={start48h}
              className="w-full py-3 bg-[#1E3A5F] text-white rounded-xl text-sm font-medium hover:bg-[#2A4D7A] transition-colors">
              📅 Simular: Mensagem 48h antes (confirmacao)
            </button>
          </div>
        )}

        {phase === '48h' && status === 'confirmed' && (
          <div className="flex flex-col gap-3 mb-6">
            <button onClick={start2h}
              className="w-full py-3 bg-[#25D366] text-white rounded-xl text-sm font-medium hover:bg-[#1da954] transition-colors">
              ⏰ Simular: Mensagem 2h antes (lembrete)
            </button>
          </div>
        )}

        {(phase !== 'idle') && (
          <button onClick={reset}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
            <ArrowLeft size={14} /> Reiniciar demo
          </button>
        )}

        {/* WhatsApp-style chat */}
        <div className="bg-[#ECE5DD] rounded-2xl overflow-hidden shadow-lg" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'400\' height=\'400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'20\' height=\'20\' patternUnits=\'userSpaceOnUse\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'0.5\' fill=\'%23d5cec3\' /%3E%3C/pattern%3E%3C/defs%3E%3Crect fill=\'url(%23p)\' width=\'400\' height=\'400\' /%3E%3C/svg%3E")' }}>
          {/* Chat header */}
          <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-lg">🏥</div>
            <div>
              <p className="font-medium text-sm">{DEMO_APPOINTMENT.clinicName}</p>
              <p className="text-xs text-white/70">Online</p>
            </div>
          </div>

          {/* Messages */}
          <div className="p-3 space-y-2 min-h-[300px] max-h-[500px] overflow-y-auto">
            {messages.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-12">
                Clique no botao acima para iniciar a simulacao
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.from === 'patient' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm ${
                  msg.from === 'patient'
                    ? 'bg-[#DCF8C6] rounded-tr-none'
                    : msg.text.startsWith('⚠️ [AVISO')
                      ? 'bg-amber-100 border border-amber-300 rounded-tl-none'
                      : 'bg-white rounded-tl-none'
                }`}>
                  <p className="text-sm text-slate-800 whitespace-pre-line">{msg.text}</p>

                  {/* Buttons */}
                  {msg.buttons && msg.buttons.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.buttons.map((btn) => (
                        <button
                          key={btn.id}
                          onClick={() => handleButton(btn.action, btn.label)}
                          className="w-full py-2 px-3 bg-white border border-[#25D366] text-[#075E54] rounded-lg text-sm font-medium hover:bg-[#25D366]/10 transition-colors"
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 text-right mt-1">
                    {msg.time}
                    {msg.from === 'patient' && ' ✓✓'}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Info card */}
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-slate-800">Como funciona em producao</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-500">
                <li>• Mensagem 1 enviada automaticamente 2 dias antes via WhatsApp</li>
                <li>• Mensagem 2 enviada automaticamente 2 horas antes</li>
                <li>• Paciente responde com botoes interativos do WhatsApp</li>
                <li>• Status atualizado automaticamente no sistema</li>
                <li>• Clinica notificada em caso de cancelamento</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-4">
          Anpexia — Automacao Empresarial
        </p>
      </div>
    </div>
  );
}
