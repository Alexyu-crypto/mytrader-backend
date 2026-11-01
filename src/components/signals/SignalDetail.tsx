import { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileText, LineChart, X } from 'lucide-react';
import { buildSignalAnalysis, signalVerdict, type Verdict } from '@/lib/signalAnalysis';
import { BarChart, ProfitChart } from '@/components/report/ReportCharts';
import { formatCurrency, isOnline, timeAgo } from '@/lib/format';
import { formatDuration } from '@/lib/performance';
import { CopyAction, initials, pct, weeksRunning, type Signal } from '@/components/signals/SignalCard';
import type { CopyRequest } from '@/lib/copyRequests';
import { ShareButton } from '@/components/share/ShareMenu';
import { signalShare } from '@/components/signals/signalShare';
import { useShareSlug } from '@/hooks/useShareSlug';

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatCurrency(n)}`;
const VERDICT_STYLE: Record<Verdict, [string, string]> = {
  strong: ['Strong 強勁', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'],
  steady: ['Steady 平穩', 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'],
  caution: ['Caution 審慎', 'border-amber-500/30 bg-amber-500/10 text-amber-300'],
  early: ['Early stage 初期', 'border-slate-600 bg-slate-800 text-slate-300'],
};
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

export function SignalDetail({ signal, request, onCopy, onClose }: { signal: Signal; request?: CopyRequest; onCopy: () => void; onClose: () => void }) {
  const { account, perf, openCount } = signal;
  const shareSlug = useShareSlug();
  const online = isOnline(account.last_seen);
  const [lang, setLang] = useState<'en' | 'zh'>('zh');
  const analysis = useMemo(() => buildSignalAnalysis(perf, weeksRunning(perf, account), openCount), [perf, account, openCount]);
  const [verdictLabel, verdictClass] = VERDICT_STYLE[signalVerdict(perf)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stats: [string, string][] = [
    ['Weeks running 運行週數', String(weeksRunning(perf, account))],
    ['Max drawdown 最大回撤', `${perf.maxDrawdownPct.toFixed(2)}%`],
    ['Win rate 勝率', `${perf.winRate.toFixed(1)}%`],
    ['Profit factor 獲利因子', perf.profitFactor === null ? '—' : perf.profitFactor.toFixed(2)],
    ['Trades 交易數', perf.totalTrades.toLocaleString('en-US')],
    ['Avg holding 平均持倉', formatDuration(perf.avgHoldMs)],
    ['Balance 結餘', formatCurrency(account.balance || 0)],
    ['Equity 淨值', formatCurrency(account.equity || 0)],
    ['Open trades 持倉中', String(openCount)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 shadow-2xl animate-fade-in">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-6 py-4 backdrop-blur">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/25 to-sky-600/10 text-sm font-bold text-cyan-200 ring-1 ring-cyan-500/30">
            {initials(account.account_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-white">{account.account_name}</p>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <span className={`inline-flex items-center gap-1 ${online ? 'text-emerald-400' : ''}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                {online ? 'Live 運行中' : `Last seen ${timeAgo(account.last_seen)}`}
              </span>
              · {account.broker} · {account.platform}
            </p>
          </div>
          <ShareButton variant="icon" label="Share signal · 分享信號" {...signalShare(signal, shareSlug)} />
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4">
              <p className="text-xs text-slate-500">P&L % 盈虧率</p>
              {perf.pnlPct !== null ? (
                <p className={`mt-1 text-3xl font-bold tabular-nums ${perf.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pct(perf.pnlPct)}</p>
              ) : (
                <p className="mt-1 text-3xl font-bold text-slate-500">—</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4">
              <p className="text-xs text-slate-500">Net profit 淨利潤</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${perf.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(perf.netProfit)}</p>
            </div>
          </div>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <LineChart className="h-4 w-4 text-cyan-400" />
              P&L curve 盈虧曲線
            </h3>
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/30 p-4">
              <ProfitChart curve={perf.curve} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              Monthly returns 每月回報
            </h3>
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/30 p-4">
              <BarChart buckets={perf.monthly.slice(-12)} format={pct} labelFormat={monthLabel} />
            </div>
          </section>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-700/80 bg-slate-700/60 sm:grid-cols-3">
            {stats.map(([label, value]) => (
              <div key={label} className="bg-slate-900 px-4 py-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-white">{value}</dd>
              </div>
            ))}
          </dl>

          <section className="rounded-xl border border-slate-700/80 bg-gradient-to-br from-slate-800/50 to-slate-900 p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileText className="h-4 w-4 text-cyan-400" />
                Analysis & comment 分析及評論
              </h3>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${verdictClass}`}>{verdictLabel}</span>
              <div className="ms-auto flex max-w-full flex-wrap rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
                {(['zh', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`rounded-md px-2.5 py-1 transition-colors ${lang === l ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
                  >
                    {l === 'zh' ? '中文' : 'EN'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-slate-300">
              {analysis.map((para, i) => (
                <p key={i} className={i === analysis.length - 1 ? 'border-t border-slate-700/60 pt-3 font-medium text-white' : undefined}>
                  {para[lang]}
                </p>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-slate-500">Generated automatically from this account's live statistics. 根據本戶口實時數據自動生成。</p>
          </section>

          <p className="text-xs leading-relaxed text-slate-500">
            Past performance is not a reliable indicator of future results. Trading leveraged products carries a high level of risk. 過往表現不代表將來回報，槓桿交易風險高。
          </p>
        </div>

        <footer className="sticky bottom-0 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/95 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-sm font-medium text-white">Like this signal? 喜歡這個信號？</p>
            <p className="text-xs text-slate-500">{request ? 'We will contact you soon. 我們會盡快聯絡您。' : 'Apply and our team will set it up with you. 申請後團隊會協助設定。'}</p>
          </div>
          <CopyAction request={request} onCopy={onCopy} size="lg" />
        </footer>
      </aside>
    </div>
  );
}
