import { useState, useRef, useEffect } from 'react';
import { MEDICAL_SPECIALTIES } from '../config/specialties';
import { ChevronDown } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function SpecialtyCombobox({ value, onChange, disabled, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? MEDICAL_SPECIALTIES.filter(s => s.toLowerCase().includes(search.toLowerCase()))
    : MEDICAL_SPECIALTIES;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (s: string) => {
    onChange(s);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${disabled ? 'bg-slate-50 text-slate-400' : 'bg-white'} ${className}`}
      >
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>{value || 'Selecionar especialidade'}</span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar especialidade..."
              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Nenhuma especialidade encontrada</p>
            ) : (
              filtered.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#EFF6FF] transition-colors ${s === value ? 'bg-[#EFF6FF] text-[#1E3A5F] font-medium' : 'text-slate-700'}`}
                >
                  {s}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
