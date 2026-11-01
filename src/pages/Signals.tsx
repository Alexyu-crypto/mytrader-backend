import { useEffect, useMemo, useState } from 'react';
import { Download, Radio, RefreshCw, Search } from 'lucide-react';
import { useAccounts, useLivePositions } from '@/hooks/useRealtime';
import { fetchBalanceOperations, fetchTradeHistory } from '@/lib/accountData';
import { computePerformance } from '@/lib/performance';
import { isOnline } from '@/lib/format';
import type { BalanceOperation, TradeHistory } from '@/lib/types';
import { SignalCard, weeksRunning, type Signal } from '@/components/signals/SignalCard';
import { SignalDetail } from '@/components/signals/SignalDetail';
import { CopyRequestDialog } from '@/components/signals/CopyRequestDialog';
import { MyApplications } from '@/components/signals/MyApplications';
import { useCopyRequests } from '@/hooks/useCopyRequests';
import { isOpen, type CopyRequest } from '@/lib/copyRequests';
import { ShareButton } from '@/components/share/ShareMenu';
import { siteShare } from '@/lib/share';
import { useShareSlug } from '@/hooks/useShareSlug';
import { EaDownloads } from '@/components/signals/EaDownloads';

type SortKey = 'profit' | 'drawdown' | 'weeks' | 'equity';

const SORTS: [SortKey, string][] = [
  ['profit', 'Highest P&L 最高盈利'],
  ['drawdown', 'Lowest DD 低回撤'],
  ['weeks', 'Longest 最長'],
  ['equity', 'Equity 淨值'],
];

type History = Record<string, { trades: TradeHistory[]; ops: BalanceOperation[] }>;

export function Signals({ userId, email, showEas }: { userId: string; email: string; showEas: boolean }) {
  const [tab, setTab] = useState<'signals' | 'eas'>('signals');
  const { accounts, loading: accountsLoading } = useAccounts();
  const shareSlug = useShareSlug();
  const { positions } = useLivePositions();
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<SortKey>('profit');
  const [query, setQuery] = useState('');
  const [openName, setOpenName] = useState<string | null>(null);
  const [applyName, setApplyName] = useState<string | null>(null);
  const { requests: allRequests, reload: reloadRequests } = useCopyRequests('my-copy-requests');
  const myRequests = useMemo(() => allRequests.filter((r) => r.user_id === userId), [allRequests, userId]);
  const openByMaster = useMemo(() => {
    const map = new Map<string, CopyRequest>();
    myRequests.filter((r) => isOpen(r.status)).forEach((r) => map.set(r.master_account, r));
    return map;
  }, [myRequests]);

  const masters = useMemo(() => accounts.filter((a) => a.type === 'master'), [accounts]);
  const masterKey = masters.map((m) => m.account_name).join('|');

  useEffect(() => {
    if (accountsLoading) return;
    let cancelled = false;
    const names = masterKey ? masterKey.split('|') : [];
    Promise.all(names.map(async (name) => [name, { trades: await fetchTradeHistory(name), ops: await fetchBalanceOperations(name) }] as const))
      .then((rows) => {
        if (cancelled) return;
        setHistory(Object.fromEntries(rows));
        setError('');
      })
      .catch((err) => {
        console.error('signals load failed', err);
        if (!cancelled) setError('Could not load signals right now. Please try again. 暫時無法載入信號，請稍後再試。');
      });
    return () => {
      cancelled = true;
    };
  }, [masterKey, accountsLoading, attempt]);

  const signals = useMemo<Signal[]>(() => {
    if (!history) return [];
    return masters.map((account) => {
      const own = positions.filter((p) => p.account_name === account.account_name);
      const h = history[account.account_name] ?? { trades: [], ops: [] };
      return { account, perf: computePerformance(account, h.trades, h.ops, own), openCount: own.length };
    });
  }, [masters, positions, history]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = signals.filter((s) => !q || s.account.account_name.toLowerCase().includes(q) || s.account.broker.toLowerCase().includes(q));
    const value = (s: Signal) => (sort === 'profit' ? s.perf.netProfit : sort === 'drawdown' ? -s.perf.maxDrawdownPct : sort === 'weeks' ? weeksRunning(s.perf, s.account) : s.account.equity || 0);
    return [...list].sort((a, b) => value(b) - value(a));
  }, [signals, sort, query]);

  const ranks = useMemo(() => {
    const byProfit = [...signals].sort((a, b) => b.perf.netProfit - a.perf.netProfit);
    return new Map(byProfit.map((s, i) => [s.account.account_name, i + 1]));
  }, [signals]);

  const liveCount = masters.filter((m) => isOnline(m.last_seen)).length;
  const opened = signals.find((s) => s.account.account_name === openName) ?? null;
  const applying = signals.find((s) => s.account.account_name === applyName) ?? null;
  const loading = accountsLoading || (!history && !error);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-cyan-500/10 via-slate-800/40 to-slate-900 p-6 sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300 ring-1 ring-cyan-500/30">
              <Radio className="h-3.5 w-3.5" /> Signal providers 信號提供者
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white">Trading Signals 交易信號</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              Performance of every master account, updated live. Tap a signal for its profit curve and monthly returns.
              <br />
              所有主帳戶的實時表現，點擊查看利潤曲線及每月回報。
            </p>
            <ShareButton
              label="Invite friends 邀請朋友"
              heading="Share MyTrader Tools 分享"
              content={siteShare('signals_page', shareSlug)}
              className="mt-4 border border-slate-700 bg-slate-900/60 [&>span]:inline"
            />
          </div>
          <div className="flex gap-3">
            {[
              ['Signals 信號', masters.length],
              ['Live 運行中', liveCount],
            ].map(([label, value]) => (
              <div key={label} className="min-w-[110px] rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 py-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showEas && (
        <div className="inline-flex max-w-full flex-wrap rounded-lg border border-slate-700 bg-slate-900 p-1">
          {([
            ['signals', 'Signals 信號', Radio],
            ['eas', 'EA Downloads EA 下載', Download],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {showEas && tab === 'eas' ? (
        <EaDownloads />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search signal or broker 搜尋..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 p-1">
          {SORTS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${sort === key ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {myRequests.length > 0 && <MyApplications requests={myRequests} onChanged={reloadRequests} />}

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-10 text-center">
          <p className="text-sm text-red-300">Signals could not be loaded. 未能載入信號。</p>
          <button
            onClick={() => {
              setError('');
              setHistory(null);
              setAttempt((n) => n + 1);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white transition-colors hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" /> Try again 再試
          </button>
        </div>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[330px] animate-pulse rounded-2xl border border-slate-800 bg-slate-800/30" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center text-sm text-slate-500">
          {masters.length === 0 ? 'No signals yet. 暫時未有信號。' : 'No signals match your search. 沒有符合的信號。'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s, i) => (
            <div key={s.account.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <SignalCard
                signal={s}
                rank={ranks.get(s.account.account_name) ?? i + 1}
                request={openByMaster.get(s.account.account_name)}
                onOpen={() => setOpenName(s.account.account_name)}
                onCopy={() => setApplyName(s.account.account_name)}
              />
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {opened && (
        <SignalDetail
          signal={opened}
          request={openByMaster.get(opened.account.account_name)}
          onCopy={() => setApplyName(opened.account.account_name)}
          onClose={() => !applyName && setOpenName(null)}
        />
      )}
      {applying && <CopyRequestDialog signal={applying} email={email} onClose={() => setApplyName(null)} onSent={reloadRequests} />}
    </div>
  );
}
