import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ConductaTemplatePicker } from './ConductaTemplatePicker';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasSpeech = !!SpeechRecognition;

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
}

export function DictationTextarea({ value, onChange, className = '', placeholder, required, style }: Props) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const recognitionRef = useRef<any>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Modelos de Conduta só para quem atende: médicos e profissionais de saúde.
  const canUseTemplates = user?.role === 'DOCTOR' || user?.role === 'HEALTH_PROFESSIONAL';

  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  const toggle = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (e: any) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          transcript += e.results[i][0].transcript;
        }
      }
      if (transcript) {
        const separator = value && !value.endsWith(' ') && !value.endsWith('\n') ? ' ' : '';
        onChange(value + separator + transcript);
      }
    };

    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  // Insere o modelo na posição do cursor, sem apagar o que já foi digitado.
  const insertTemplate = (text: string) => {
    const el = taRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const sep = before && !/\s$/.test(before) ? '\n\n' : '';
    const next = before + sep + text + after;
    onChange(next);
    const caret = (before + sep + text).length;
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.setSelectionRange(caret, caret);
      }
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        placeholder={placeholder}
        required={required}
        style={style}
      />
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {canUseTemplates && (
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            title="Inserir modelo de conduta"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-[#2563EB] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <path d="M9 12h6" /><path d="M9 16h6" />
            </svg>
            Modelos
          </button>
        )}
        {hasSpeech && (
          <button
            type="button"
            onClick={toggle}
            title={recording ? 'Parar gravacao' : 'Gravar por voz'}
            className={`p-1.5 rounded-full transition-colors ${
              recording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        )}
      </div>

      {showTemplates && (
        <ConductaTemplatePicker
          onSelect={insertTemplate}
          onClose={() => setShowTemplates(false)}
          initialContent={value}
        />
      )}
    </div>
  );
}
