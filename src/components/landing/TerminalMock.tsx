import { useEffect, useState } from 'react';

const LINES: { t: string; tag: string; tone: string; text: string }[] = [
  { t: '09:41:02.118', tag: 'MASTER', tone: 'text-cyan-400', text: 'BUY XAUUSD 1.00 lot opened' },
  { t: '09:41:02.131', tag: 'ENGINE', tone: 'text-sky-300', text: 'signal queued → 3 followers' },
  { t: '09:41:02.284', tag: 'FOLLOW', tone: 'text-emerald-400', text: 'MT5 · filled 0.50 lot' },
  { t: '09:41:02.297', tag: 'FOLLOW', tone: 'text-emerald-400', text: 'MT4 · filled 1.00 lot' },
  { t: '09:41:02.352', tag: 'FOLLOW', tone: 'text-emerald-400', text: 'MT4 · filled 0.25 lot (symbol mapped XAUUSD.m)' },
  { t: '09:47:15.020', tag: 'MASTER', tone: 'text-cyan-400', text: 'XAUUSD closed' },
  { t: '09:47:15.188', tag: 'ENGINE', tone: 'text-sky-300', text: 'close sent → 3 followers' },
  { t: '09:47:15.402', tag: 'FOLLOW', tone: 'text-emerald-400', text: 'all followers closed' },
];

export function TerminalMock() {
  const [shown, setShown] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => setShown((n) => (n >= LINES.length + 3 ? 1 : n + 1)), 900);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-[#0D0D0D] text-left shadow-2xl shadow-cyan-500/5">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/80" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
        <span className="ml-3 font-mono text-xs text-slate-500">terminal — copy engine</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-slate-600">demo</span>
      </div>
      <div className="h-64 space-y-1.5 overflow-hidden p-4 font-mono text-xs sm:text-[13px]">
        {LINES.slice(0, Math.min(shown, LINES.length)).map((l, i) => (
          <div key={i} className="flex gap-3 animate-fade-up whitespace-nowrap">
            <span className="text-slate-600">{l.t}</span>
            <span className={`w-14 shrink-0 ${l.tone}`}>{l.tag}</span>
            <span className="truncate text-slate-300">{l.text}</span>
          </div>
        ))}
        <div className="flex gap-3">
          <span className="text-cyan-400">$</span>
          <span className="h-4 w-2 animate-pulse bg-cyan-400/80" />
        </div>
      </div>
    </div>
  );
}
