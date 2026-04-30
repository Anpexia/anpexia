import { useState, useEffect, useRef, useCallback } from 'react';

type CidEntry = [string, string]; // [code, description]

let cidCache: CidEntry[] | null = null;
let cidLoading = false;
const cidWaiters: ((data: CidEntry[]) => void)[] = [];

function loadCidData(): Promise<CidEntry[]> {
  if (cidCache) return Promise.resolve(cidCache);
  return new Promise((resolve) => {
    cidWaiters.push(resolve);
    if (cidLoading) return;
    cidLoading = true;
    fetch('/cid10.json')
      .then((r) => r.json())
      .then((data: CidEntry[]) => {
        cidCache = data;
        cidWaiters.forEach((fn) => fn(data));
        cidWaiters.length = 0;
      })
      .catch(() => {
        cidLoading = false;
        cidWaiters.forEach((fn) => fn([]));
        cidWaiters.length = 0;
      });
  });
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function CidAutocomplete({ value, onChange, className, placeholder }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CidEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [cidData, setCidData] = useState<CidEntry[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const handleFocus = useCallback(() => {
    if (cidData.length === 0) {
      loadCidData().then(setCidData);
    }
  }, [cidData.length]);

  useEffect(() => {
    if (!query || query.length < 2 || cidData.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const matches: CidEntry[] = [];
    for (const entry of cidData) {
      const code = entry[0].toLowerCase();
      const desc = entry[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (code.startsWith(q) || desc.includes(q)) {
        matches.push(entry);
        if (matches.length >= 8) break;
      }
    }
    setResults(matches);
    setOpen(matches.length > 0);
  }, [query, cidData]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onFocus={handleFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        className={className}
        placeholder={placeholder || 'Digite codigo ou descricao...'}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(([code, desc]) => (
            <button
              key={code}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-slate-100 last:border-0"
              onClick={() => {
                const val = `${code} - ${desc}`;
                setQuery(val);
                onChange(val);
                setOpen(false);
              }}
            >
              <span className="font-medium text-blue-700">{code}</span>
              <span className="text-slate-600 ml-2">{desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
