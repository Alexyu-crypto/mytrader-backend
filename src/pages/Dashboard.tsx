import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAccounts, useLivePositions } from '@/hooks/useRealtime';
import { useCopyEngine, type EngineHealth, type LogTone } from '@/hooks/useCopyEngine';
import { AccountsTable } from '@/components/AccountsTable';
import { formatCurrency, formatSigned as signed, isOnline, timeAgo } from '@/lib/format';
import { CopyGroupSubtotals } from '@/components/CopyGroupSubtotals';
import { supabase } from '@/lib/supabase';
import { TradingRulesPage } from '@/pages/TradingRules';

const HEALTH_STYLE: Record<EngineHealth, [string, string]> = {
  checking: ['Checking… 檢查中', 'bg-slate-500'],
  running: ['Running 運行中', 'bg-emerald-400'],
  stale: ['Not responding 無回應', 'bg-red-500'],
  offline: ['Reconnecting 重新連線中', 'bg-amber-400'],
  error: ['Cannot reach engine 無法連線', 'bg-red-500'],
};

const TONE_STYLE: Record<LogTone, string> = {
  open: 'text-emerald-300',
  close: 'text-sky-300',
  problem: 'text-amber-300',
  info: 'text-slate-300',
};

type Tab = 'all' | 'master' | 'follower' | 'rules';

const TAB_LABEL: Record<Tab, string> = {
  all: 'All Accounts',
  master: 'Masters',
  follower: 'Followers',
  rules: 'Trading Rules · 交易規則',
};

export function Dashboard({ canEdit, isAdmin }: { canEdit: boolean; isAdmin: boolean }) {
  const { accounts, loading } = useAccounts();
  const { positions } = useLivePositions();
  const [tab, setTab] = useState<Tab>('all');
  const typeFilter = tab === 'rules' ? 'all' : tab;

  const { signals, engineLog, health, lastRun } = useCopyEngine();
  const [healthLabel, healthDot] = HEALTH_STYLE[health];
  const [closedPl, setClosedPl] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc('account_closed_pl');
      if (cancelled || error || !Array.isArray(data)) return;
      setClosedPl(new Map((data as { account_name: string; net_profit: number }[]).map((r) => [r.account_name, Number(r.net_profit) || 0])));
    };
    load();
    const poll = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  const filteredAccounts = accounts.filter((a) => typeFilter === 'all' || a.type === typeFilter);
  const filteredAccountNames = new Set(filteredAccounts.map((a) => a.account_name));
  const filteredPositions = positions.filter((p) => filteredAccountNames.has(p.account_name));

  const totalBalance = filteredAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  const totalEquity = filteredAccounts.reduce((sum, a) => sum + (Number(a.equity) || 0), 0);
  const totalProfit = filteredPositions.reduce((sum, p) => sum + (p.profit || 0), 0);
  const closedProfit = closedPl ? filteredAccounts.reduce((sum, a) => sum + (closedPl.get(a.account_name) ?? 0), 0) : null;
  const totalPl = closedProfit === null ? null : closedProfit + totalProfit;
  const onlineCount = filteredAccounts.filter((a) => isOnline(a)).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-slate-400 text-sm font-medium">Total Accounts</p>
          <p className="text-3xl font-bold text-white mt-1">{filteredAccounts.length}</p>
          <p className="text-emerald-400 text-xs mt-1">{onlineCount} online</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-slate-400 text-sm font-medium">Total Balance · 總結餘</p>
          <p className="text-3xl font-bold text-white mt-1 tabular-nums truncate" title={formatCurrency(totalBalance)}>{formatCurrency(totalBalance)}</p>
          <p className="text-xs mt-1 text-slate-400 tabular-nums truncate">
            Equity · 淨值{' '}
            <span className={totalEquity >= totalBalance ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(totalEquity)}</span>
          </p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-slate-400 text-sm font-medium">Open Positions</p>
          <p className="text-3xl font-bold text-white mt-1">{filteredPositions.length}</p>
          <p className="text-slate-500 text-xs mt-1">across all accounts</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-slate-400 text-sm font-medium">Total P&L · 總盈虧</p>
          {totalPl === null ? (
            <p className="text-3xl font-bold mt-1 text-slate-500">—</p>
          ) : (
            <p className={`text-3xl font-bold mt-1 tabular-nums truncate ${totalPl >= 0 ? 'text-emerald-400' : 'text-red-400'}`} title={signed(totalPl)}>
              {signed(totalPl)}
            </p>
          )}
          <p className="text-xs mt-1 text-slate-400 tabular-nums truncate">
            Floating P&L{' '}
            <span className={totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{signed(totalProfit)}</span>
          </p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <p className="text-slate-400 text-sm font-medium">Active Copy Signals</p>
          <p className="text-3xl font-bold text-white mt-1">{signals.filter((s) => s.status === 'pending').length}</p>
          <p className="text-slate-500 text-xs mt-1">{signals.length} total generated</p>
        </div>
      </div>

      {/* Type Filter */}
      <div className="flex items-center gap-2">
        {(['all', 'master', 'follower', 'rules'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {t === 'rules' && <SlidersHorizontal className="w-4 h-4" />}
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'rules' ? (
        <TradingRulesPage canEdit={canEdit} isAdmin={isAdmin} />
      ) : (
      <>

      {/* Accounts List */}
      {loading ? (
        <div className="text-slate-400 text-center py-8">Loading accounts...</div>
      ) : filteredAccounts.length === 0 ? (
        <div className="text-slate-500 text-center py-12 border border-dashed border-slate-700 rounded-xl">
          No accounts yet. Add one from the Accounts page.
        </div>
      ) : (
        (['master', 'follower'] as const).map((type) => {
          const group = filteredAccounts.filter((a) => a.type === type);
          if (group.length === 0) return null;
          const names = new Set(group.map((a) => a.account_name));
          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <span className={`w-2 h-2 rounded-full ${type === 'master' ? 'bg-cyan-400' : 'bg-amber-400'}`} />
                  {type === 'master' ? 'Master Accounts' : 'Follower Accounts'}
                </h2>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Total <span className="text-white">{group.length}</span>
                </span>
              </div>
              <AccountsTable accounts={group} positions={filteredPositions.filter((p) => names.has(p.account_name))} closedPl={closedPl} />
            </div>
          );
        })
      )}

      {!loading && typeFilter !== 'master' && (
        <CopyGroupSubtotals accounts={filteredAccounts} positions={filteredPositions} closedPl={closedPl} />
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Copy Engine Log 跟單引擎紀錄</h2>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300">
              <span className="relative flex h-2 w-2">
                {health === 'running' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${healthDot}`} />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${healthDot}`} />
              </span>
              {healthLabel}
              {lastRun && health !== 'running' && <span className="text-slate-500">· last run {timeAgo(lastRun)}</span>}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="text-emerald-300">● Open 開倉</span>
            <span className="text-sky-300">● Close 平倉</span>
            <span className="text-amber-300">● Needs attention 需留意</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 py-3 pl-4 pr-2 font-mono text-xs">
          {engineLog.length === 0 ? (
            <p className="text-slate-500">Waiting for new master trades… 等待主戶口新交易</p>
          ) : (
            <div className="max-h-[240px] space-y-0.5 overflow-y-auto pr-2 scrollbar-thin">
              {engineLog.map((entry) => (
                <div key={entry.id} className="leading-5">
                  <div className={`truncate ${TONE_STYLE[entry.tone]}`} title={entry.message}>
                    <span className="text-slate-500">[{entry.time}]</span> {entry.message}
                  </div>
                  {entry.hint && <div className="pl-4 font-sans text-[11px] leading-4 text-slate-500">{entry.hint}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
