import type { Tick } from '@/hooks/useDesk';

const W = 600;
const H = 140;

export function TickChart({ ticks, digits }: { ticks: Tick[]; digits: number }) {
  if (ticks.length < 2) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500">
        Waiting for price ticks 等待報價…
      </div>
    );
  }

  const values = ticks.flatMap((t) => [t.bid, t.ask]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) * 0.0001 || 1) * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i: number) => (i / (ticks.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = (key: 'bid' | 'ask') => ticks.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(t[key]).toFixed(1)}`).join(' ');
  const bidPath = line('bid');
  const last = ticks[ticks.length - 1];
  const rising = last.bid >= ticks[0].bid;

  return (
    <div className="relative h-36 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="desk-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={rising ? '#3b82f6' : '#ef4444'} stopOpacity="0.28" />
            <stop offset="100%" stopColor={rising ? '#3b82f6' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#1e293b" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${bidPath} L${W},${H} L0,${H} Z`} fill="url(#desk-area)" />
        <path d={line('ask')} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.55" vectorEffect="non-scaling-stroke" />
        <path d={bidPath} fill="none" stroke="#ef4444" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={y(last.bid)} y2={y(last.bid)} stroke="#ef4444" strokeOpacity="0.4" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute right-2 top-2 rounded bg-slate-900/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{hi.toFixed(digits)}</span>
      <span className="absolute bottom-2 right-2 rounded bg-slate-900/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{lo.toFixed(digits)}</span>
      <span className="absolute left-2 top-2 flex items-center gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-red-500" />Bid</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-blue-500" />Ask</span>
      </span>
    </div>
  );
}
