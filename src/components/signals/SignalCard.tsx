import { Activity, ArrowUpRight, CalendarDays, Copy, TrendingDown } from 'lucide-react';
import type { Account } from '@/lib/types';
import type { CurvePoint, Performance } from '@/lib/performance';
import { formatCurrency, isOnline } from '@/lib/format';
import { STATUS_META, type CopyRequest } from '@/lib/copyRequests';
import { ShareButton } from '@/components/share/ShareMenu';
import { signalShare } from '@/components/signals/signalShare';
import { useShareSlug } from '@/hooks/useShareSlug';

export interface Signal {
  account: Account;
  perf: Performance;
  openCount: number;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

export const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export function weeksRunning(perf: Performance, account: Account): number {
  const start = perf.firstTime ?? new Date(account.created_at).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / WEEK_MS));
}

export function initials(name: string): string {
  const parts = name.split('-');
  return (parts[1] || parts[0] || '?').slice(0, 2).toUpperCase();
}

function Sparkline({ curve, up }: { curve: CurvePoint[]; up: boolean }) {
  const points = curve.length > 1 ? curve : [{ profit: 0 }, { profit: 0 }];
  const values = points.map((p) => p.profit);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const coords = values.map((v, i) => `${(i / (values.length - 1)) * 100},${36 - ((v - min) / span) * 32 - 2}`);
  const stroke = up ? '#34d399' : '#f87171';
  const id = up ? 'spark-up' : 'spark-down';
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-14 w-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,36 ${coords.join(' ')} 100,36`} fill={`url(#${id})`} />
      <polyline points={coords.join(' ')} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyAction({ request, onCopy, size = 'sm' }: { request?: CopyRequest; onCopy: () => void; size?: 'sm' | 'lg' }) {
  const pad = size === 'lg' ? 'px-5 py-2.5 text-sm' : 'px-3.5 py-2 text-xs';
  if (request) {
    const meta = STATUS_META[request.status];
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-lg font-medium ring-1 ${meta.tone} ${pad}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        Applied 已申請 · {meta.label}
      </span>
    );
  }
  return (
    <button
      onClick={onCopy}
      className={`inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 font-semibold text-black shadow-lg shadow-cyan-500/10 transition-all hover:bg-cyan-400 hover:shadow-cyan-500/25 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${pad}`}
    >
      <Copy className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      Copy this 申請跟單
    </button>
  );
}

export function SignalCard({ signal, rank, request, onOpen, onCopy }: { signal: Signal; rank: number; request?: CopyRequest; onOpen: () => void; onCopy: () => void }) {
  const { account, perf } = signal;
  const shareSlug = useShareSlug();
  const up = perf.netProfit >= 0;
  const online = isOnline(account.last_seen);

  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800/40 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/40 hover:bg-slate-800/70 hover:shadow-xl hover:shadow-cyan-500/5">
      <button onClick={onOpen} className="flex flex-1 flex-col p-5 pb-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/50">
        <div className="flex items-start gap-3">
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/25 to-sky-600/10 text-sm font-bold text-cyan-200 ring-1 ring-cyan-500/30">
              {initials(account.account_name)}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">{account.account_name}</p>
            <p className="truncate text-xs text-slate-400">
              {account.broker} · {account.platform}
            </p>
          </div>
          <span className="rounded-md bg-slate-900/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-400">#{rank}</span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">P&L % 盈虧率</p>
            {perf.pnlPct !== null ? (
              <p className={`text-3xl font-bold tabular-nums leading-tight ${perf.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pct(perf.pnlPct)}</p>
            ) : (
              <p className="text-3xl font-bold leading-tight text-slate-500">—</p>
            )}
            <p className={`text-sm font-semibold tabular-nums ${up ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{up ? '+' : ''}{formatCurrency(perf.netProfit)}</p>
          </div>
          <ArrowUpRight className="h-5 w-5 text-slate-600 transition-colors group-hover:text-cyan-400" />
        </div>

        <div className="-mx-1 mt-2">
          <Sparkline curve={perf.curve} up={up} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-700/60 pt-3 text-xs">
          <div>
            <p className="flex items-center gap-1 text-slate-500">
              <CalendarDays className="h-3 w-3" />
              Weeks 週
            </p>
            <p className="mt-0.5 font-semibold tabular-nums text-white">{weeksRunning(perf, account)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-slate-500">
              <TrendingDown className="h-3 w-3" />
              Max DD 回撤
            </p>
            <p className="mt-0.5 font-semibold tabular-nums text-white">{perf.maxDrawdownPct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-slate-500">
              <Activity className="h-3 w-3" />
              Win 勝率
            </p>
            <p className="mt-0.5 font-semibold tabular-nums text-white">{perf.winRate.toFixed(0)}%</p>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 px-5 pb-5">
        <p className="min-w-0 truncate text-xs text-slate-500">
          Equity 淨值 <span className="font-medium tabular-nums text-slate-300">{formatCurrency(account.equity || 0)}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <ShareButton variant="icon" label="Share signal · 分享信號" {...signalShare(signal, shareSlug)} />
          <CopyAction request={request} onCopy={onCopy} />
        </div>
      </div>
    </div>
  );
}
