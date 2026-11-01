import { useEffect, useMemo, useState } from 'react';
import type { BalanceOperation, TradeHistory } from '@/lib/types';
import { PinnedTop } from '@/components/PinnedTop';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileSpreadsheet, Layers } from 'lucide-react';
import { HistoryFilters, PERIOD_LABEL, getPeriodRange, type Period } from '@/components/history/HistoryFilters';
import { FundingTable } from '@/components/history/FundingTable';
import { TradeRow } from '@/components/history/TradeRow';
import { groupByMaster, paginateGroups } from '@/lib/tradeGroups';
import { ScrollRows } from '@/components/ScrollRows';
import { fetchCloseSignals, fetchCopyLinks, type CloseSignal, type CopyLink } from '@/lib/copyDelay';
import { buildTradeTimings, openDelayOf } from '@/lib/tradeOrigin';
import { useAccounts } from '@/hooks/useRealtime';
import { fetchBalanceOperations, fetchTradeHistory, netOf } from '@/lib/accountData';
import { exportHistoryWorkbook } from '@/lib/historyExport';
import { buildOpHaystack, buildTradeHaystack, fuzzyMatch } from '@/lib/historySearch';
import { logActivity } from '@/lib/activityLog';
import { IconButton } from '@/components/IconButton';
import { useLinkedAccounts } from '@/hooks/useLinkedAccounts';
import { ClientScopeChips, ClientScopeGate } from '@/components/client/ClientScope';

const PAGE_SIZES = [50, 100] as const;

type SortKey = 'account_name' | 'ticket' | 'symbol' | 'order_type' | 'lots' | 'open_price' | 'close_price' | 'profit' | 'open_time' | 'close_time' | 'open_delay';

type SortDirection = 'asc' | 'desc';

function netPnl(trades: TradeHistory[]): number {
  return trades.reduce((sum, trade) => sum + netOf(trade), 0);
}

export function History({ clientView = false }: { clientView?: boolean }) {
  const scope = useLinkedAccounts(clientView);
  const linked = scope.linked;
  const allowedKey = linked ? [...linked.own, ...linked.signals].join('\n') : '';
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [ops, setOps] = useState<BalanceOperation[]>([]);
  const [links, setLinks] = useState<CopyLink[]>([]);
  const [closeSignals, setCloseSignals] = useState<CloseSignal[]>([]);
  const { accounts } = useAccounts();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<'trades' | 'funding'>('trades');
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('close_time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [grouped, setGrouped] = useState(!clientView);

  useEffect(() => {
    if (clientView && !linked) return;
    const only = clientView ? allowedKey.split('\n').filter(Boolean) : undefined;
    const loadTrades = async () => {
      setLoading(true);
      try {
        const [tradeData, opData, linkData, closeData] = await Promise.all([
          fetchTradeHistory(only),
          fetchBalanceOperations(only),
          clientView ? Promise.resolve([]) : fetchCopyLinks(),
          clientView ? Promise.resolve([]) : fetchCloseSignals(),
        ]);
        setTrades(tradeData);
        setOps(opData);
        setLinks(linkData);
        setCloseSignals(closeData);
        setLoadError('');
      } catch {
        setLoadError('Could not load trade history. Please refresh the page.');
      }
      setLoading(false);
    };
    loadTrades();
  }, [clientView, linked, allowedKey]);

  const masterAccounts = useMemo(() => new Set(accounts.filter((a) => a.type === 'master').map((a) => a.account_name)), [accounts]);
  const timings = useMemo(
    () => buildTradeTimings(trades, links, closeSignals, masterAccounts, !clientView),
    [trades, links, closeSignals, masterAccounts, clientView],
  );

  const tradeIndex = useMemo(() => new Map(trades.map((t) => [t.id, buildTradeHaystack(t)])), [trades]);
  const opIndex = useMemo(() => new Map(ops.map((op) => [op.id, buildOpHaystack(op)])), [ops]);

  const baseTrades = useMemo(
    () => (searchQuery.trim() ? trades.filter((trade) => fuzzyMatch(tradeIndex.get(trade.id) ?? '', searchQuery)) : trades),
    [trades, tradeIndex, searchQuery],
  );

  const filteredTrades = useMemo(() => {
    const range = getPeriodRange(period, fromDate, toDate);
    return baseTrades.filter((trade) => {
      if (!trade.close_time) return period === 'all';
      const closeTime = new Date(trade.close_time);
      if (range.from && closeTime < range.from) return false;
      if (range.to && closeTime > range.to) return false;
      return true;
    });
  }, [baseTrades, period, fromDate, toDate]);

  const filteredOps = useMemo(() => {
    const range = getPeriodRange(period, fromDate, toDate);
    return ops.filter((op) => {
      if (searchQuery.trim() && !fuzzyMatch(opIndex.get(op.id) ?? '', searchQuery)) return false;
      const time = new Date(op.op_time);
      if (range.from && time < range.from) return false;
      if (range.to && time > range.to) return false;
      return true;
    });
  }, [ops, opIndex, searchQuery, period, fromDate, toDate]);

  useEffect(() => setPage(1), [filteredTrades, sortKey, sortDirection, pageSize, grouped]);

  const handleExport = () => {
    const scope = 'all-accounts';
    const date = new Date().toISOString().slice(0, 10);
    exportHistoryWorkbook(`trade-history-${scope}-${date}`, sortedTrades, filteredOps, PERIOD_LABEL[period]);
    logActivity('export', 'history', scope, { trades: sortedTrades.length, funding: filteredOps.length, period });
  };

  const sortedTrades = useMemo(() => {
    return [...filteredTrades].sort((first, second) => {
      const isTime = sortKey === 'open_time' || sortKey === 'close_time';
      if (sortKey === 'open_delay') {
        const a = openDelayOf(timings.get(first.id));
        const b = openDelayOf(timings.get(second.id));
        if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
        return sortDirection === 'asc' ? a - b : b - a;
      }
      const firstTime = isTime ? first[sortKey as 'open_time' | 'close_time'] : null;
      const secondTime = isTime ? second[sortKey as 'open_time' | 'close_time'] : null;
      const firstValue = isTime
        ? (firstTime ? new Date(firstTime).getTime() : 0)
        : first[sortKey as keyof TradeHistory] ?? '';
      const secondValue = isTime
        ? (secondTime ? new Date(secondTime).getTime() : 0)
        : second[sortKey as keyof TradeHistory] ?? '';
      const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
        ? firstValue - secondValue
        : String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredTrades, sortKey, sortDirection, timings]);

  const groupPages = useMemo(
    () => (grouped ? paginateGroups(groupByMaster(sortedTrades, links), pageSize) : []),
    [grouped, sortedTrades, links, pageSize],
  );
  const totalPages = Math.max(1, grouped ? groupPages.length : Math.ceil(sortedTrades.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRowStart = grouped
    ? groupPages.slice(0, currentPage - 1).reduce((n, p) => n + p.reduce((m, g) => m + 1 + g.followers.length, 0), 0)
    : (currentPage - 1) * pageSize;
  const pageRowCount = grouped
    ? (groupPages[currentPage - 1] ?? []).reduce((m, g) => m + 1 + g.followers.length, 0)
    : Math.min(pageSize, sortedTrades.length - pageRowStart);

  const handleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(nextKey);
      setSortDirection('asc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={13} />;
    return sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const periodPnl = useMemo(() => ({
    today: netPnl(baseTrades.filter((trade) => {
      if (!trade.close_time) return false;
      const range = getPeriodRange('today', '', '');
      const closeTime = new Date(trade.close_time);
      return closeTime >= range.from! && closeTime <= range.to!;
    })),
    week: netPnl(baseTrades.filter((trade) => {
      if (!trade.close_time) return false;
      const range = getPeriodRange('week', '', '');
      const closeTime = new Date(trade.close_time);
      return closeTime >= range.from! && closeTime <= range.to!;
    })),
    month: netPnl(baseTrades.filter((trade) => {
      if (!trade.close_time) return false;
      const range = getPeriodRange('month', '', '');
      const closeTime = new Date(trade.close_time);
      return closeTime >= range.from! && closeTime <= range.to!;
    })),
    all: netPnl(baseTrades),
  }), [baseTrades]);

  const summary = useMemo(() => {
    const totalProfit = filteredTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
    const totalCommission = filteredTrades.reduce((sum, trade) => sum + (trade.commission || 0), 0);
    const totalSwap = filteredTrades.reduce((sum, trade) => sum + (trade.swap || 0), 0);
    const wins = filteredTrades.filter((trade) => (trade.profit || 0) > 0).length;
    const losses = filteredTrades.filter((trade) => (trade.profit || 0) < 0).length;
    return {
      totalProfit,
      totalCommission,
      totalSwap,
      wins,
      losses,
      winRate: filteredTrades.length > 0 ? (wins / filteredTrades.length) * 100 : 0,
      netPnl: totalProfit + totalCommission + totalSwap,
    };
  }, [filteredTrades]);

  const clearFilters = () => {
    setSearchQuery('');
    setPeriod('all');
    setFromDate('');
    setToDate('');
  };

  const pnlCards: Array<[string, number]> = [
    ['Today', periodPnl.today],
    ['This Week', periodPnl.week],
    ['This Month', periodPnl.month],
    ['All Time', periodPnl.all],
  ];

  const header = (
    <div>
      <h1 className="text-2xl font-bold text-white">{clientView ? 'Trade History 交易記錄' : 'Trade History'}</h1>
      <p className="text-slate-400 text-sm mt-1">
        {clientView
          ? 'Closed trades, deposits and withdrawals on your accounts and the signals you joined · 您的帳戶及已參加信號的歷史'
          : 'Closed trades, deposits and withdrawals from all accounts'}
      </p>
    </div>
  );

  if (clientView && (!linked || scope.error || linked.own.length + linked.signals.length === 0)) {
    return (
      <div className="space-y-6">
        {header}
        <ClientScopeGate {...scope}>{null}</ClientScopeGate>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {header}
        <IconButton
          label="Export Excel · 匯出"
          tone="primary"
          size="md"
          onClick={handleExport}
          disabled={loading || (sortedTrades.length === 0 && filteredOps.length === 0)}
        >
          <FileSpreadsheet className="w-4 h-4" />
        </IconButton>
      </div>

      {clientView && linked && <ClientScopeChips linked={linked} />}

      <PinnedTop>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {pnlCards.map(([label, value]) => (
          <div key={label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <p className="text-slate-500 text-xs">{label} P&L</p>
            <p className={`text-xl font-bold mt-1 ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {value >= 0 ? '+' : ''}${value.toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Selected Net P&L</p>
          <p className={`text-xl font-bold mt-1 ${summary.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{summary.netPnl >= 0 ? '+' : ''}${summary.netPnl.toFixed(2)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Gross Profit</p>
          <p className={`text-xl font-bold mt-1 ${summary.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{summary.totalProfit >= 0 ? '+' : ''}${summary.totalProfit.toFixed(2)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Commission</p>
          <p className="text-xl font-bold text-slate-300 mt-1">-${Math.abs(summary.totalCommission).toFixed(2)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Swap</p>
          <p className={`text-xl font-bold mt-1 ${summary.totalSwap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{summary.totalSwap >= 0 ? '+' : ''}${summary.totalSwap.toFixed(2)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Win Rate</p>
          <p className="text-xl font-bold text-white mt-1">{summary.winRate.toFixed(1)}%</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Trades</p>
          <p className="text-xl font-bold text-white mt-1">{filteredTrades.length}</p>
          <p className="text-xs text-emerald-400 mt-0.5">{summary.wins}W / {summary.losses}L</p>
        </div>
      </div>

      <HistoryFilters
        trades={trades}
        shownCount={filteredTrades.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        period={period}
        setPeriod={setPeriod}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        onReset={clearFilters}
      />
      </PinnedTop>

      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex max-w-full flex-wrap items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 w-fit">
        {([['trades', `Closed trades (${filteredTrades.length})`], ['funding', `Deposits & withdrawals (${filteredOps.length})`]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>
        {!clientView && view === 'trades' && (
          <button
            type="button"
            role="switch"
            aria-checked={grouped}
            onClick={() => setGrouped((g) => !g)}
            title="Show each master trade with its copied trades directly underneath"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${grouped ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            Group master + copies · 主跟單分組
            <span className={`relative w-7 h-4 rounded-full transition-colors ${grouped ? 'bg-cyan-500' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${grouped ? 'left-3.5' : 'left-0.5'}`} />
            </span>
          </button>
        )}
      </div>

      {loadError && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">{loadError}</div>}

      {loading ? <div className="text-slate-400 text-center py-8">Loading trades...</div> : view === 'funding' ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <FundingTable ops={filteredOps} />
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <ScrollRows rows={100}>
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead><tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                {[
                  ['Account', 'account_name', 'text-left'],
                  ['Ticket', 'ticket', 'text-left'],
                  ['Symbol', 'symbol', 'text-left'],
                  ['Type', 'order_type', 'text-left'],
                  ['Lots', 'lots', 'text-right'],
                  ['Open', 'open_price', 'text-right'],
                  ['Close', 'close_price', 'text-right'],
                  ['Profit', 'profit', 'text-right'],
                  ['Open Time', 'open_time', 'text-left'],
                  ['Close Time', 'close_time', 'text-left'],
                  ['Delay / Origin', 'open_delay', 'text-right'],
                ].map(([label, key, alignment]) => (
                  <th key={key} className={`${alignment} px-3 py-2.5 font-medium whitespace-nowrap`}>
                    <button type="button" onClick={() => handleSort(key as SortKey)} className="inline-flex items-center gap-1.5 hover:text-white transition-colors" aria-label={`Sort by ${label}`}>
                      {label}
                      {sortIcon(key as SortKey)}
                    </button>
                  </th>
                ))}
              </tr></thead>
              <tbody>{sortedTrades.length === 0 ? <tr><td colSpan={11} className="text-center text-slate-500 py-8">No trades found</td></tr> : grouped ? (groupPages[currentPage - 1] ?? []).flatMap(({ lead, followers }) => [
                <TradeRow key={lead.id} trade={lead} role={followers.length > 0 ? 'lead' : 'plain'} timings={timings} followers={followers} />,
                ...followers.map((f) => <TradeRow key={f.id} trade={f} role="follower" timings={timings} />),
              ]) : sortedTrades.slice(pageRowStart, pageRowStart + pageSize).map((trade) => (
                <TradeRow key={trade.id} trade={trade} role="plain" timings={timings} />
              ))}</tbody>
            </table>
          </ScrollRows>
          {sortedTrades.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-700 text-xs text-slate-400">
              <span className="whitespace-nowrap">
                Showing <span className="text-slate-200 font-medium">{pageRowStart + 1}–{pageRowStart + pageRowCount}</span> of <span className="text-slate-200 font-medium">{sortedTrades.length}</span> trades · 共 {totalPages} 頁 (export includes all)
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 whitespace-nowrap">
                  Per page · 每頁
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500">
                    {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  {[
                    { label: 'First page', icon: ChevronsLeft, target: 1, disabled: currentPage === 1 },
                    { label: 'Previous page', icon: ChevronLeft, target: currentPage - 1, disabled: currentPage === 1 },
                  ].map(({ label, icon: Icon, target, disabled }) => (
                    <button key={label} type="button" aria-label={label} title={label} disabled={disabled} onClick={() => setPage(target)} className="p-1 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                  <span className="px-2 whitespace-nowrap">Page <span className="text-slate-200 font-medium">{currentPage}</span> / {totalPages}</span>
                  {[
                    { label: 'Next page', icon: ChevronRight, target: currentPage + 1, disabled: currentPage === totalPages },
                    { label: 'Last page', icon: ChevronsRight, target: totalPages, disabled: currentPage === totalPages },
                  ].map(({ label, icon: Icon, target, disabled }) => (
                    <button key={label} type="button" aria-label={label} title={label} disabled={disabled} onClick={() => setPage(target)} className="p-1 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
