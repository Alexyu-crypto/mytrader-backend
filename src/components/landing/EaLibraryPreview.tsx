import { Download, Sparkles } from 'lucide-react';
import type { Lang, Localized } from '@/hooks/useLandingLang';

const LABELS: Localized<{ title: string; tabs: string[]; strategy: string }> = {
  en: { title: 'Top strategies', tabs: ['Return', 'Low DD', 'New'], strategy: 'Strategy' },
  zh: { title: '精選策略', tabs: ['收益', '低回撤', '最新'], strategy: '策略' },
};

interface Strategy {
  name: string;
  author: string;
  market: string;
  platform: 'MT4' | 'MT5';
  ret: number;
  dd: number;
  month: number;
  curve: number[];
  tint: string;
}

const STRATEGIES: Strategy[] = [
  { name: 'Aurum Momentum', author: 'Atlas Capital', market: 'XAUUSD', platform: 'MT5', ret: 86.4, dd: 6.2, month: 7.8, curve: [0, 4, 3, 9, 14, 12, 19, 25, 24, 31, 38], tint: 'from-amber-400 to-orange-500' },
  { name: 'Index Swing Master', author: 'Northwind FX', market: 'NAS100', platform: 'MT5', ret: 119.2, dd: 14.6, month: 9.3, curve: [0, 6, 2, 10, 8, 18, 15, 27, 33, 30, 44], tint: 'from-sky-400 to-blue-600' },
  { name: 'Tokyo Breakout', author: 'K. Hayashi', market: 'USDJPY', platform: 'MT4', ret: 58.7, dd: 9.8, month: 5.1, curve: [0, -3, -5, -2, 4, 9, 8, 14, 19, 22, 26], tint: 'from-rose-400 to-red-600' },
  { name: 'Euro Trend Rider', author: 'Meridian Quant', market: 'EURUSD', platform: 'MT4', ret: 42.1, dd: 4.9, month: 3.6, curve: [0, 2, 5, 7, 8, 11, 13, 15, 17, 19, 21], tint: 'from-emerald-400 to-teal-600' },
  { name: 'Night Scalper', author: 'L. Moreau', market: 'GBPUSD', platform: 'MT4', ret: 31.5, dd: 3.1, month: -1.2, curve: [0, 3, 6, 8, 11, 13, 16, 18, 17, 16, 15], tint: 'from-cyan-400 to-sky-600' },
];

const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

export function EaLibraryPreview({ lang }: { lang: Lang }) {
  const l = LABELS[lang];
  return (
    <div className="bg-[#0B1120] text-left">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <p className="text-sm font-semibold text-white">
            {l.title}
          </p>
        </div>
        <div className="flex rounded-md border border-white/10 p-0.5 text-[11px]">
          {l.tabs.map((t, i) => (
            <span key={t} className={`rounded px-2.5 py-1 ${i === 0 ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-500'}`}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:grid-cols-[1fr_64px_56px_56px_96px_auto] sm:px-5">
        <span>{l.strategy}</span>
        <span className="text-right">Return</span>
        <span className="hidden text-right sm:block">Max DD</span>
        <span className="hidden text-right sm:block">Month</span>
        <span className="hidden sm:block">Curve</span>
        <span className="text-right">EA</span>
      </div>

      <ul>
        {STRATEGIES.map((s, i) => (
          <li
            key={s.name}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:grid-cols-[1fr_64px_56px_56px_96px_auto] sm:px-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${s.tint} text-xs font-bold text-white`}>
                {s.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                {i === 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0B1120] bg-emerald-400" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{s.name}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {s.author} · {s.market} · {s.platform}
                </p>
              </div>
            </div>
            <span className="text-right font-mono text-sm font-semibold text-emerald-400">{pct(s.ret)}</span>
            <span className="hidden text-right font-mono text-xs text-slate-300 sm:block">{s.dd.toFixed(1)}%</span>
            <span className={`hidden text-right font-mono text-xs sm:block ${s.month >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pct(s.month)}</span>
            <Sparkline points={s.curve} id={`ea-${i}`} />
            <span className="inline-flex items-center gap-1 justify-self-end rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-300">
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">Get</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sparkline({ points, id }: { points: number[]; id: string }) {
  const w = 96;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 2 - ((p - min) / (max - min || 1)) * (h - 4)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="hidden h-7 w-24 sm:block" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
