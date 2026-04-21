import { useState, useRef, useEffect } from 'react';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasSpeech = !!SpeechRecognition;

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

export function DictationTextarea({ value, onChange, className = '', placeholder, required }: Props) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

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

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        placeholder={placeholder}
        required={required}
      />
      {hasSpeech && (
        <button
          type="button"
          onClick={toggle}
          title={recording ? 'Parar gravacao' : 'Gravar por voz'}
          className={`absolute top-2 right-2 p-1.5 rounded-full transition-colors ${
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
  );
}
