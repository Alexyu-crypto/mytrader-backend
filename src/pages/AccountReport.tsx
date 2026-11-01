import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, BarChart3, Compass, Download, FileText, Layers, LineChart, Lock, PieChart, Printer, Quote, Radar, Sigma,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { BrandMark } from '@/components/agents/BrandMark';
import { fetchPublicBrand, type PublicBrand } from '@/lib/agents';
import { useShareSlug } from '@/hooks/useShareSlug';
import { AuthModal, type AuthMode } from '@/components/auth/AuthModal';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/lib/debounce';
import { useAccounts, useLivePositions } from '@/hooks/useRealtime';
import { fetchBalanceOperations, fetchTradeHistory } from '@/lib/accountData';
import { ShareButton } from '@/components/share/ShareMenu';
import { signalShare } from '@/components/signals/signalShare';
import { exportHistoryWorkbook } from '@/lib/historyExport';
import { buildSummary, computePerformance, formatDuration } from '@/lib/performance';
import { buildOutlook, buildVision, buildVisionQuote, type Bilingual } from '@/lib/reportNarrative';
import { formatCurrency, isOnline, timeAgo } from '@/lib/format';
import type { BalanceOperation, TradeHistory } from '@/lib/types';
import { BarChart, ProfitChart, SymbolDonut } from '@/components/report/ReportCharts';
import { KpiCard, MonthlyGrid, Section, StatList } from '@/components/report/ReportSections';
import { MarketOutlook } from '@/components/report/MarketOutlook';
import { buildMarketViews } from '@/lib/marketOutlook';
import { IconButton } from '@/components/IconButton';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatCurrency(n)}`;
const longDate = (t: number | null) => (t ? new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const dayLabel = (key: string) => new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function BilingualBlock({ items }: { items: Bilingual[] }) {
  return (
    <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold tracking-widest text-slate-500">ENGLISH</p>
        {items.map((item, i) => <p key={i}>{item.en}</p>)}
      </div>
      <div className="space-y-3 md:border-l md:border-slate-700/80 md:pl-8">
        <p className="text-[11px] font-semibold tracking-widest text-slate-500">中文</p>
        {items.map((item, i) => <p key={i}>{item.zh}</p>)}
      </div>
    </div>
  );
}


function Toggle<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex max-w-full flex-wrap bg-slate-900/70 border border-slate-700 rounded-lg p-0.5 print:hidden">
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${value === key ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PrivateReport({ signedIn, brand }: { signedIn: boolean; brand: PublicBrand | null }) {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm animate-fade-up">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6 text-cyan-400" />
        </div>
        <h1 className="text-white text-xl font-semibold mt-5">Members-only report</h1>
        <p className="text-slate-300 text-sm mt-1">此報告只限登入成員查看</p>
        <p className="text-slate-400 text-sm mt-3 leading-relaxed">
          {signedIn
            ? 'Your account is waiting for approval, so this report is not available yet. 您的帳戶仍在等待批准。'
            : 'The owner has made this report private. Sign in with an approved account to view it. 請用已批准帳戶登入。'}
        </p>
        {!signedIn && (
          <button
            onClick={() => setAuthMode('signin')}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
          >
            Sign in · 登入
          </button>
        )}
      </div>
      {authMode && <AuthModal mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} brand={brand ?? undefined} />}
    </div>
  );
}

export function AccountReport({ accountName, brandSlug, viewerAccess }: { accountName: string; brandSlug: string | null; viewerAccess: 'member' | 'pending' | 'guest' | 'checking' }) {
  const { accounts, loading: accountsLoading } = useAccounts();
  const shareSlug = useShareSlug();
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  const { positions: allPositions } = useLivePositions();
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [ops, setOps] = useState<BalanceOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activity, setActivity] = useState<'daily' | 'hourly'>('daily');

  const account = accounts.find((a) => a.account_name === accountName);
  const positions = useMemo(() => allPositions.filter((p) => p.account_name === accountName), [allPositions, accountName]);

  const load = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([fetchTradeHistory(accountName), fetchBalanceOperations(accountName)]);
      setTrades(t);
      setOps(o);
      setLoadError('');
    } catch (err) {
      console.error('report history load failed', err);
      setLoadError('Could not load this report right now. Please try again. 暫時無法載入此報告，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }, [accountName]);

  useEffect(() => {
    load();
    const reload = debounce(load, 1000);
    const filter = `account_name=eq.${accountName}`;
    const channel = supabase
      .channel(`report-${accountName}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trade_history', filter }, reload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balance_operations', filter }, reload)
      .subscribe();
    return () => {
      reload.cancel();
      supabase.removeChannel(channel);
    };
  }, [load, accountName]);

  useEffect(() => {
    if (!brandSlug) return;
    let cancelled = false;
    fetchPublicBrand(brandSlug).then(({ brand: b }) => {
      if (!cancelled) setBrand(b);
    });
    return () => {
      cancelled = true;
    };
  }, [brandSlug]);

  useEffect(() => {
    document.title = `${accountName} · ${brand ? brand.brand_name : 'Performance Report'}`;
  }, [accountName, brand]);

  const perf = useMemo(() => (account ? computePerformance(account, trades, ops, positions) : null), [account, trades, ops, positions]);
  const summary = useMemo(() => (account && perf ? buildSummary(account, perf, positions.length) : []), [account, perf, positions.length]);
  const outlook = useMemo(() => (perf ? buildOutlook(perf, positions.length) : []), [perf, positions.length]);
  const vision = useMemo(() => (perf ? buildVision(perf) : []), [perf]);
  const quote = useMemo(() => (perf ? buildVisionQuote(perf) : null), [perf]);
  const markets = useMemo(() => buildMarketViews(trades, positions), [trades, positions]);

  const exportExcel = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportHistoryWorkbook(`report-${accountName}-${date}`, trades, ops, 'All time');
  };

  if (accountsLoading || viewerAccess === 'checking' || (loading && !loadError)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          Preparing report...
        </div>
      </div>
    );
  }

  if (!account && viewerAccess !== 'member') {
    return <PrivateReport signedIn={viewerAccess === 'pending'} brand={brand} />;
  }

  if (account && !account.report_public && viewerAccess !== 'member') {
    return <PrivateReport signedIn={viewerAccess === 'pending'} brand={brand} />;
  }

  if (!account || !perf) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <h1 className="text-white text-xl font-semibold mt-4">Account not found</h1>
          <p className="text-slate-400 text-sm mt-2">There is no account called “{accountName}”. It may have been renamed or removed.</p>
          <a href={brand && viewerAccess === 'guest' ? `#/a/${brand.slug}` : '#/dashboard'} className="inline-flex items-center gap-2 mt-6 text-cyan-400 hover:text-cyan-300 text-sm">
            <ArrowLeft className="w-4 h-4" /> {brand && viewerAccess === 'guest' ? `Back to ${brand.brand_name}` : 'Back to dashboard'}
          </a>
        </div>
      </div>
    );
  }

  const online = isOnline(account.last_seen);
  const netCapital = perf.deposits - perf.withdrawals + perf.estimatedOpening;
  const tone = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : 'neutral') as 'up' | 'down' | 'neutral';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-cyan-500/10 via-sky-500/5 to-transparent pointer-events-none print:hidden" />

      <nav className="relative border-b border-slate-800 bg-slate-950/80 backdrop-blur print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex flex-nowrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {brand ? <BrandMark brand={brand} className="h-8 w-8 shrink-0 text-sm" /> : <Logo className="w-8 h-8" />}
            <span className="truncate text-white font-semibold">{brand ? brand.brand_name : 'Performance Report'}</span>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2">
            {brand && viewerAccess === 'guest' && (
              <a href={`#/a/${brand.slug}`} className="hidden sm:inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium text-slate-950 transition-opacity hover:opacity-90" style={{ backgroundColor: brand.brand_color }}>
                Join {brand.brand_name} 加入
              </a>
            )}
            <ShareButton variant="icon" label="Share report · 分享報告" className="h-10 w-10" {...signalShare({ account, perf, openCount: positions.length }, shareSlug)} heading="Share this report 分享報告" />
            <IconButton label="Print / PDF · 列印" size="md" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
            </IconButton>
            <IconButton label="Export Excel · 匯出" tone="solid" size="md" onClick={exportExcel}>
              <Download className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </nav>

      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {loadError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3">
            Trade history could not be loaded: {loadError}
          </div>
        )}

        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/60 text-slate-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                {online ? 'Live' : `Last seen ${timeAgo(account.last_seen)}`}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-medium">{account.platform}</span>
              <span className={`px-2.5 py-1 rounded-full font-medium capitalize ${account.type === 'master' ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-400'}`}>{account.type}</span>
            </div>
            <h1 translate="no" className="text-3xl sm:text-4xl font-bold text-white mt-3 leading-tight">{account.account_name}</h1>
            <p className="text-slate-400 mt-1">
              {account.broker}
              {account.broker_server ? ` · ${account.broker_server}` : ''}
            </p>
          </div>
          <div className="lg:text-right">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Total return</p>
            <p className={`text-5xl font-bold tabular-nums mt-1 ${perf.growthPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pct(perf.growthPct)}</p>
            <p className="text-slate-500 text-xs mt-2">
              {longDate(perf.firstTime)} – {longDate(Date.now())} · Generated {new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Balance" value={formatCurrency(account.balance || 0)} hint={`Equity ${formatCurrency(account.equity || 0)}`} />
          <KpiCard label="Net profit" value={signed(perf.netProfit)} tone={tone(perf.netProfit)} hint={`Floating ${signed(perf.floating)}`} />
          <KpiCard label="Net capital" value={formatCurrency(netCapital)} hint={`In ${formatCurrency(perf.deposits)} · Out ${formatCurrency(perf.withdrawals)}`} />
          <KpiCard label="Max drawdown" value={`${perf.maxDrawdownPct.toFixed(2)}%`} tone={perf.maxDrawdownPct > 0 ? 'down' : 'neutral'} hint="Peak to trough, closed trades" />
          <KpiCard label="Win rate" value={`${perf.winRate.toFixed(1)}%`} hint={`${perf.wins} won · ${perf.losses} lost`} />
          <KpiCard label="Profit factor" value={perf.profitFactor === null ? '—' : perf.profitFactor.toFixed(2)} tone={perf.profitFactor !== null && perf.profitFactor >= 1 ? 'up' : perf.profitFactor === null ? 'neutral' : 'down'} hint="Gross profit / gross loss" />
          <KpiCard label="Trades" value={perf.totalTrades.toLocaleString('en-US')} hint={`${perf.lots.toFixed(2)} lots traded`} />
          <KpiCard label="Open positions" value={String(positions.length)} tone={tone(perf.floating)} hint={positions.length ? `Floating ${signed(perf.floating)}` : 'Flat'} />
        </div>

        <Section title="Summary" subtitle="Performance review, next period outlook and the head trader's vision" icon={FileText}>
          <div className="px-6 py-5 space-y-3 text-slate-300 leading-relaxed">
            {summary.map((line, i) => <p key={i}>{line}</p>)}
            {perf.estimatedOpening > 0 && (
              <p className="text-xs text-slate-500 pt-1">
                Starting capital of {formatCurrency(perf.estimatedOpening)} is estimated, because some early deposits were not uploaded. Reinstalling the latest EA on this terminal uploads the full funding history.
              </p>
            )}
          </div>

          <div className="border-t border-slate-700/80 px-6 py-5 text-slate-300 leading-relaxed">
            <div className="flex items-center gap-2 mb-4">
              <Compass className="w-4 h-4 text-cyan-400" />
              <h3 className="text-white font-semibold">Next Period Outlook <span className="text-slate-400 font-normal">· 下一期展望</span></h3>
            </div>
            <BilingualBlock items={outlook} />
          </div>

          <div className="border-t border-slate-700/80 px-6 py-6 bg-gradient-to-br from-cyan-500/[0.06] to-transparent text-slate-300 leading-relaxed">
            <div className="flex items-center gap-2 mb-4">
              <Quote className="w-4 h-4 text-cyan-400" />
              <h3 className="text-white font-semibold">Head Trader's Vision <span className="text-slate-400 font-normal">· 操盤總裁的願景</span></h3>
            </div>
            <div className="border-l-2 border-cyan-500/60 pl-5 italic">
              <BilingualBlock items={vision} />
            </div>
            <p className="text-right text-sm text-slate-400 mt-4 not-italic">— Chief Trading Officer : <span className="text-white font-medium">Backy Chan</span></p>
            {quote && (
              <figure className="mt-6 rounded-xl border border-cyan-500/20 bg-slate-900/60 px-6 py-5 text-center">
                <Quote className="w-5 h-5 text-cyan-400/70 mx-auto mb-3" />
                <blockquote className="space-y-2">
                  <p className="text-white text-lg font-medium leading-snug">“{quote.en}”</p>
                  <p className="text-slate-300">「{quote.zh}」</p>
                </blockquote>
                <figcaption className="mt-3 text-sm text-cyan-300">— {quote.author} · {quote.authorZh}</figcaption>
              </figure>
            )}
          </div>
        </Section>

        <Section title="Profit" subtitle="Cumulative net profit from closed trades" icon={LineChart}>
          <div className="px-4 sm:px-6 py-5">
            <ProfitChart curve={perf.curve} />
          </div>
        </Section>

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <Section title="Monthly returns" subtitle="Percentage gain or loss per month" icon={BarChart3}>
              <div className="px-4 sm:px-6 py-5">
                <BarChart buckets={perf.monthly.slice(-24)} format={pct} labelFormat={monthLabel} />
              </div>
            </Section>
          </div>
          <div className="lg:col-span-2">
            <Section title="Instruments" subtitle="Share of trades and net profit" icon={PieChart}>
              <div className="px-6 py-5">
                <SymbolDonut slices={perf.symbols} />
              </div>
            </Section>
          </div>
        </div>

        <Section title="Return calendar" subtitle="Compounded monthly and yearly returns" icon={Layers}>
          <div className="px-3 sm:px-6 py-5">
            <MonthlyGrid monthly={perf.monthly} />
          </div>
        </Section>

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <Section
              title="Activity"
              subtitle={activity === 'daily' ? 'Net profit per day (last 31 trading days)' : 'Net profit by hour the trade closed'}
              icon={Activity}
              action={<Toggle value={activity} options={[['daily', 'Daily'], ['hourly', 'By hour']]} onChange={setActivity} />}
            >
              <div className="px-4 sm:px-6 py-5">
                {activity === 'daily'
                  ? <BarChart buckets={perf.daily} format={signed} labelFormat={dayLabel} />
                  : <BarChart buckets={perf.hourly.filter((h) => h.trades > 0)} format={signed} />}
              </div>
            </Section>
          </div>
          <div className="lg:col-span-2">
            <Section title="Trading statistics" icon={Sigma}>
              <div className="px-6 py-3">
                <StatList
                  rows={[
                    ['Long trades won', `${perf.longsWon} / ${perf.longs}`],
                    ['Short trades won', `${perf.shortsWon} / ${perf.shorts}`],
                    ['Best trade', perf.best ? <span className="text-emerald-400">{signed(perf.best.value)} <span className="text-slate-500 text-xs">{perf.best.symbol}</span></span> : '—'],
                    ['Worst trade', perf.worst ? <span className="text-red-400">{signed(perf.worst.value)} <span className="text-slate-500 text-xs">{perf.worst.symbol}</span></span> : '—'],
                    ['Average win', <span className="text-emerald-400">{formatCurrency(perf.avgWin)}</span>],
                    ['Average loss', <span className="text-red-400">{formatCurrency(perf.avgLoss)}</span>],
                    ['Expectancy per trade', signed(perf.expectancy)],
                    ['Average holding time', formatDuration(perf.avgHoldMs)],
                    ['Commission paid', formatCurrency(perf.commission)],
                    ['Swap', formatCurrency(perf.swap)],
                  ]}
                />
              </div>
            </Section>
          </div>
        </div>

        <Section
          title="Market analysis & outlook · 市場分析及預估"
          subtitle="Main products traded in this account"
          icon={Radar}
        >
          <MarketOutlook views={markets} />
        </Section>

        <footer className="text-center text-slate-600 text-xs leading-relaxed pt-4 pb-8 max-w-2xl mx-auto">
          Figures are calculated from data reported by the trading terminal and may differ slightly from broker statements.
          Past performance is not a reliable indicator of future results. Trading leveraged products carries a high level of risk.
        </footer>
      </main>
    </div>
  );
}
