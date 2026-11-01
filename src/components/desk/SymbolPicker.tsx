import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { COMMON_SYMBOLS } from '@/lib/desk';

const MAX_SHOWN = 80;

export function SymbolPicker({ value, options, onChange, size = 'sm' }: { value: string; options: string[]; onChange: (symbol: string) => void; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fromBroker = options.length > 0;
  const list = fromBroker ? options : COMMON_SYMBOLS;

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return list.slice(0, MAX_SHOWN);
    const starts = list.filter((s) => s.toUpperCase().startsWith(q));
    const contains = list.filter((s) => !s.toUpperCase().startsWith(q) && s.toUpperCase().includes(q));
    return [...starts, ...contains].slice(0, MAX_SHOWN);
  }, [list, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  const openPicker = () => {
    setQuery('');
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pick = (s: string) => {
    const v = s.trim();
    if (v) onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(filtered[cursor] ?? query);
    } else if (e.key === 'Escape') setOpen(false);
  };

  const pad = size === 'md' ? 'px-3 py-2' : 'px-2 py-1.5';

  return (
    <div ref={boxRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`flex w-full items-center gap-2 rounded-md border bg-slate-800 ${pad} text-left text-sm transition-colors ${open ? 'border-cyan-500' : 'border-slate-700 hover:border-slate-500'}`}
      >
        <span className={`min-w-0 flex-1 truncate font-mono font-semibold ${value ? 'text-white' : 'font-sans font-normal text-slate-500'}`}>{value || 'Choose symbol 揀產品'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl animate-fade-in">
          <div className="relative border-b border-slate-800">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search or type 搜尋或輸入"
              className="w-full bg-transparent py-2 pl-8 pr-2 text-sm font-mono text-white placeholder:font-sans placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          {!fromBroker && <p className="border-b border-slate-800 px-3 py-1.5 text-[10px] leading-snug text-amber-300/80">Broker list not received yet — common symbols shown. 未收到券商產品清單，暫列常用產品。</p>}
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(s)}
                  className={`w-full px-3 py-1.5 text-left font-mono text-sm transition-colors ${i === cursor ? 'bg-cyan-500/15 text-cyan-200' : s === value ? 'text-cyan-300' : 'text-slate-300'}`}
                >
                  {s}
                </button>
              </li>
            ))}
            {query.trim() && !list.some((s) => s.toUpperCase() === query.trim().toUpperCase()) && (
              <li>
                <button type="button" onClick={() => pick(query)} className="w-full px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-800 hover:text-white">
                  Use “<span className="font-mono text-white">{query.trim()}</span>” 使用此名稱
                </button>
              </li>
            )}
            {filtered.length === 0 && !query.trim() && <li className="px-3 py-3 text-center text-xs text-slate-500">No symbols 沒有產品</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
