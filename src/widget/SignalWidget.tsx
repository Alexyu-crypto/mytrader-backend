import { useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowUpRight } from 'lucide-react';
import { signalPageUrl, widgetText, widgetTheme, type WidgetOptions } from '@/widget/widgetConfig';

const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const REFRESH_MS = 60_000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const ONLINE_MS = 5 * 60 * 1000;

interface WidgetData {
  name: string;
  broker: string;
  platform: string;
  equity: number;
  last_seen: string | null;
  pnl_pct: number | null;
  net_profit: number;
  profit_factor: number | null;
  total_opens: number;
  today_opens: number;
  first_time: string | null;
  total_funds: number;
  follower_count: number;
  curve: number[];
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function isWidgetData(v: unknown): v is WidgetData {
  return !!v && typeof v === 'object' && typeof (v as WidgetData).name === 'string' && Array.isArray((v as WidgetData).curve);
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const pts = values.length > 1 ? values : [0, 0];
  const min = Math.min(0, ...pts);
  const span = Math.max(0, ...pts) - min || 1;
  const coords = pts.map((v, i) => `${(i / (pts.length - 1)) * 100},${40 - ((v - min) / span) * 36 - 2}`).join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 56 }} aria-hidden>
      <defs>
        <linearGradient id="w-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${coords} 100,40`} fill="url(#w-fill)" />
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function SignalWidget({ options }: { options: WidgetOptions }) {
  const t = widgetText(options.lang);
  const theme = widgetTheme(options.theme, options.color);
  const [data, setData] = useState<WidgetData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data: row, error } = await client.rpc('signal_widget', { p_account: options.account, p_since: since.toISOString() });
      if (cancelled) return;
      if (error) {
        console.error('widget load failed', error);
        setState((s) => (s === 'ready' ? s : 'missing'));
        return;
      }
      if (isWidgetData(row)) {
        setData({ ...row, curve: [...row.curve].map(Number).reverse() });
        setState('ready');
      } else {
        setState('missing');
      }
    };
    if (options.account) load();
    else setState('missing');
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [options.account]);

  const shell: CSSProperties = {
    background: theme.bg,
    color: theme.text,
    border: options.frame ? `1px solid ${theme.border}` : 'none',
    borderRadius: options.frame ? 14 : 0,
    boxShadow: options.frame ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
  };

  if (state !== 'ready' || !data) {
    return (
      <div style={shell} className="flex h-full min-h-[160px] items-center justify-center p-6 text-center text-sm">
        <span style={{ color: theme.muted }}>{state === 'loading' ? t.loading : t.notFound}</span>
      </div>
    );
  }

  const pnl = data.pnl_pct;
  const up = (pnl ?? data.net_profit) >= 0;
  const online = !!data.last_seen && Date.now() - new Date(data.last_seen).getTime() < ONLINE_MS;
  const weeks = Math.max(1, Math.floor((Date.now() - new Date(data.first_time ?? Date.now()).getTime()) / WEEK_MS));
  const stats: [string, string][] = [
    [t.profitFactor, data.profit_factor === null ? '—' : data.profit_factor.toFixed(2)],
    [t.weeks, String(weeks)],
    [t.todayOpens, data.today_opens.toLocaleString('en-US')],
    [t.totalOpens, data.total_opens.toLocaleString('en-US')],
  ];
  const href = signalPageUrl(window.location.origin, data.name, options.slug);

  return (
    <div style={shell} className="flex h-full flex-col overflow-hidden">
      <div style={{ background: theme.accent, color: theme.accentText }} className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p translate="no" className="truncate text-sm font-bold leading-tight">{data.name}</p>
          <p className="truncate text-[11px] opacity-80">{data.broker.trim()} · {data.platform}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(255,255,255,0.16)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: online ? '#4ade80' : '#94a3b8' }} />
          {online ? t.online : t.offline}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3 pt-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.muted }}>{t.pnl}</p>
            <p className="text-[28px] font-bold leading-tight tabular-nums" style={{ color: up ? theme.up : theme.down }}>{pnl === null ? '—' : signedPct(pnl)}</p>
          </div>
          <p className="pb-1 text-sm font-semibold tabular-nums" style={{ color: up ? theme.up : theme.down }}>
            {data.net_profit >= 0 ? '+' : ''}{money(data.net_profit)}
          </p>
        </div>

        <div className="-mx-1 mt-1">
          <Sparkline values={data.curve} color={up ? theme.up : theme.down} />
        </div>

        <div className="mt-2 rounded-lg px-3 py-2" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
          <p className="text-[10px]" style={{ color: theme.muted }}>{t.totalFunds}</p>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-base font-bold tabular-nums">{money(data.total_funds)}</p>
            <p className="text-[10px] tabular-nums" style={{ color: theme.muted }}>{data.follower_count} {t.followers}</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          {stats.map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px]" style={{ color: theme.muted }}>{label}</p>
              <p className="text-sm font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
          <p className="truncate text-[10px]" style={{ color: theme.muted }}>
            {t.equity} <span className="font-semibold tabular-nums" style={{ color: theme.text }}>{money(data.equity)}</span>
          </p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-85"
            style={{ background: options.theme === 'dark' ? '#22d3ee' : theme.accent, color: options.theme === 'dark' ? '#0f172a' : theme.accentText }}
          >
            {t.view}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
