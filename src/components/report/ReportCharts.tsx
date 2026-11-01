import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bucket, CurvePoint, SymbolSlice } from '@/lib/performance';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : n.toFixed(Math.abs(n) < 10 && n % 1 !== 0 ? 1 : 0);

const money = (n: number) => `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProfitChart({ curve }: { curve: CurvePoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 280;
  const pad = { top: 16, right: 16, bottom: 28, left: 56 };

  const chart = useMemo(() => {
    if (curve.length < 2 || width === 0) return null;
    const values = curve.map((p) => p.profit);
    const ticks = niceTicks(Math.min(0, ...values), Math.max(...values));
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const t0 = curve[0].time;
    const t1 = curve[curve.length - 1].time;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const x = (t: number) => pad.left + ((t - t0) / Math.max(1, t1 - t0)) * innerW;
    const y = (v: number) => pad.top + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * innerH;
    const line = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.profit).toFixed(1)}`).join('');
    const base = y(Math.max(yMin, Math.min(0, yMax)));
    const area = `${line}L${x(t1).toFixed(1)},${base}L${x(t0).toFixed(1)},${base}Z`;
    const xLabels = Array.from({ length: Math.min(6, curve.length) }, (_, i) => t0 + ((t1 - t0) * i) / Math.max(1, Math.min(6, curve.length) - 1));
    return { ticks, x, y, line, area, base, xLabels, innerW };
  }, [curve, width]);

  const point = hover !== null ? curve[hover] : null;
  const last = curve[curve.length - 1];
  const up = !last || last.profit >= 0;
  const stroke = up ? '#22d3ee' : '#f87171';

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (!chart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left + pad.left;
    let best = 0;
    for (let i = 1; i < curve.length; i++) if (Math.abs(chart.x(curve[i].time) - px) < Math.abs(chart.x(curve[best].time) - px)) best = i;
    setHover(best);
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {curve.length < 2 ? (
        <div className="h-full flex items-center justify-center text-slate-500 text-sm">Not enough closed trades to draw a chart yet</div>
      ) : chart && (
        <svg width={width} height={height} className="block">
          <defs>
            <linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {chart.ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={chart.y(t)} y2={chart.y(t)} stroke="#334155" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={pad.left - 8} y={chart.y(t) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
                {compact(t)}
              </text>
            </g>
          ))}
          {chart.xLabels.map((t, i) => (
            <text key={i} x={chart.x(t)} y={height - 8} textAnchor={i === 0 ? 'start' : i === chart.xLabels.length - 1 ? 'end' : 'middle'} className="fill-slate-500 text-[11px]">
              {new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </text>
          ))}
          <path d={chart.area} fill="url(#curve-fill)" />
          <path d={chart.line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {point && (
            <g>
              <line x1={chart.x(point.time)} x2={chart.x(point.time)} y1={pad.top} y2={height - pad.bottom} stroke="#64748b" strokeDasharray="3 3" />
              <circle cx={chart.x(point.time)} cy={chart.y(point.profit)} r={4.5} fill="#0f172a" stroke={stroke} strokeWidth={2} />
            </g>
          )}
          <rect x={pad.left} y={pad.top} width={chart.innerW} height={height - pad.top - pad.bottom} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
      )}
      {point && chart && (
        <div
          className="pointer-events-none absolute top-2 bg-slate-950/95 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.min(Math.max(chart.x(point.time) - 80, 0), width - 170) }}
        >
          <p className="text-slate-400">{new Date(point.time).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-white font-semibold tabular-nums mt-0.5">{money(point.profit)}</p>
        </div>
      )}
    </div>
  );
}

export function BarChart({ buckets, format, labelFormat }: { buckets: Bucket[]; format: (n: number) => string; labelFormat?: (label: string) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 240;
  const pad = { top: 24, right: 8, bottom: 28, left: 48 };

  if (buckets.length === 0) {
    return <div ref={ref} className="flex items-center justify-center text-slate-500 text-sm" style={{ height }}>No data for this view yet</div>;
  }

  const ticks = niceTicks(Math.min(0, ...buckets.map((b) => b.value)), Math.max(0, ...buckets.map((b) => b.value)), 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const y = (v: number) => pad.top + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * innerH;
  const slot = innerW / buckets.length;
  const barW = Math.max(2, Math.min(56, slot * 0.62));
  const every = Math.max(1, Math.ceil(buckets.length / Math.max(1, Math.floor(innerW / 56))));
  const active = hover !== null ? buckets[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#334155" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{compact(t)}</text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const cx = pad.left + slot * i + slot / 2;
            const top = y(Math.max(0, b.value));
            const h = Math.max(1, Math.abs(y(b.value) - y(0)));
            return (
              <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} fill={hover === i ? 'rgba(148,163,184,0.08)' : 'transparent'} />
                <rect
                  x={cx - barW / 2}
                  y={top}
                  width={barW}
                  height={h}
                  rx={3}
                  className={`transition-opacity duration-200 ${b.value >= 0 ? 'fill-emerald-500' : 'fill-red-500'} ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                />
                {i % every === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                    {labelFormat ? labelFormat(b.label) : b.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 bg-slate-950/95 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl whitespace-nowrap"
          style={{ left: Math.min(Math.max(pad.left + slot * hover + slot / 2 - 70, 0), width - 150) }}
        >
          <p className="text-slate-400">{labelFormat ? labelFormat(active.label) : active.label}</p>
          <p className={`font-semibold tabular-nums ${active.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{format(active.value)}</p>
          <p className="text-slate-500">{active.trades} trade{active.trades === 1 ? '' : 's'}</p>
        </div>
      )}
    </div>
  );
}

const PALETTE = ['#22d3ee', '#34d399', '#fbbf24', '#38bdf8', '#fb7185', '#2dd4bf', '#a3e635', '#fb923c', '#94a3b8'];

export function SymbolDonut({ slices }: { slices: SymbolSlice[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.trades, 0);
  const top = slices.slice(0, 8);
  const rest = slices.slice(8);
  const items = rest.length ? [...top, { symbol: 'Other', trades: rest.reduce((s, x) => s + x.trades, 0), profit: rest.reduce((s, x) => s + x.profit, 0) }] : top;
  const r = 70;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  if (total === 0) return <div className="h-60 flex items-center justify-center text-slate-500 text-sm">No closed trades yet</div>;
  const active = hover !== null ? items[hover] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0">
        <svg width={180} height={180} viewBox="0 0 180 180" className="-rotate-90">
          <circle cx={90} cy={90} r={r} fill="none" stroke="#1e293b" strokeWidth={26} />
          {items.map((s, i) => {
            const len = (s.trades / total) * circumference;
            const el = (
              <circle
                key={s.symbol}
                cx={90}
                cy={90}
                r={r}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={hover === i ? 32 : 26}
                strokeDasharray={`${Math.max(0, len - (items.length > 1 ? 2 : 0))} ${circumference}`}
                strokeDashoffset={-offset}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-white font-semibold text-lg tabular-nums">{active ? `${((active.trades / total) * 100).toFixed(0)}%` : total}</span>
          <span className="text-slate-500 text-xs">{active ? active.symbol : 'trades'}</span>
        </div>
      </div>
      <ul className="flex-1 w-full space-y-1.5 text-sm">
        {items.map((s, i) => (
          <li
            key={s.symbol}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-3 rounded-md px-2 py-1 transition-colors ${hover === i ? 'bg-slate-700/40' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-white font-medium flex-1 truncate">{s.symbol}</span>
            <span className="text-slate-400 tabular-nums">{((s.trades / total) * 100).toFixed(1)}%</span>
            <span className={`tabular-nums w-24 text-right ${s.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {s.profit >= 0 ? '+' : '-'}${Math.abs(s.profit).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
