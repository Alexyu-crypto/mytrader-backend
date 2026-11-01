import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CalendarRange, FileSpreadsheet, Gift, Loader2, RefreshCw, RotateCcw, Scale, Search, X } from 'lucide-react';
import type { BalanceOperation } from '@/lib/types';
import { fetchBalanceOperations, OP_LABEL } from '@/lib/accountData';
import { formatCurrency } from '@/lib/format';
import { exportFundingWorkbook } from '@/lib/historyExport';
import { logActivity } from '@/lib/activityLog';
import { FundingTable, fundingTotals } from '@/components/history/FundingTable';
import { IconButton } from '@/components/IconButton';
import { PERIODS, PERIOD_LABEL, dateCls, getPeriodRange, type Period } from '@/components/history/HistoryFilters';

type TypeFilter = 'all' | BalanceOperation['op_type'];

const TYPE_FILTERS: TypeFilter[] = ['all', 'deposit', 'withdrawal', 'credit'];
const TOP_ACCOUNTS = 8;

export function FundingHistoryPage() {
  const [ops, setOps] = useState<BalanceOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [account, setAccount] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOps(await fetchBalanceOperations());
      setError('');
    } catch {
      setError('Could not load deposits and withdrawals. Please refresh. 未能載入出入金記錄，請重新整理。');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const accounts = useMemo(() => [...new Set(ops.map((o) => o.account_name))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [ops]);

  const inPeriod = useMemo(() => {
    const range = getPeriodRange(period, fromDate, toDate);
    return ops.filter((o) => {
      const t = new Date(o.op_time);
      return (!range.from || t >= range.from) && (!range.to || t <= range.to);
    });
  }, [ops, period, fromDate, toDate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inPeriod.filter((o) => {
      if (type !== 'all' && o.op_type !== type) return false;
      if (account && o.account_name !== account) return false;
      if (!q) return true;
      return o.account_name.toLowerCase().includes(q) || (o.comment ?? '').toLowerCase().includes(q) || String(o.ticket).includes(q);
    });
  }, [inPeriod, type, account, query]);

  const totals = fundingTotals(filtered);
  const byAccount = useMemo(() => {
    const map = new Map<string, { dep: number; wd: number; count: number }>();
    filtered.forEach((o) => {
      const row = map.get(o.account_name) ?? { dep: 0, wd: 0, count: 0 };
      if (o.op_type === 'deposit') row.dep += o.amount;
      if (o.op_type === 'withdrawal') row.wd += Math.abs(o.amount);
      row.count += 1;
      map.set(o.account_name, row);
    });
    return [...map].sort((a, b) => b[1].dep + b[1].wd - (a[1].dep + a[1].wd)).slice(0, TOP_ACCOUNTS);
  }, [filtered]);

  const filtersActive = period !== 'month' || type !== 'all' || !!account || !!query || !!fromDate || !!toDate;
  const reset = () => {
    setPeriod('month');
    setFromDate('');
    setToDate('');
    setType('all');
    setAccount('');
    setQuery('');
  };

  const filterLabel = [PERIOD_LABEL[period], type === 'all' ? 'All types' : OP_LABEL[type], account || 'All accounts', query && `Search "${query}"`].filter(Boolean).join(' · ');

  const handleExport = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportFundingWorkbook(`deposits-withdrawals-${account || 'all-accounts'}-${date}`, filtered, filterLabel);
    logActivity('export', 'history', account || 'all-accounts', { records: filtered.length, period });
  };

  const stats = [
    { label: 'Deposits 入金', value: formatCurrency(totals.deposits), icon: ArrowDownLeft, tone: 'text-emerald-300 bg-emerald-500/10', text: 'text-emerald-300' },
    { label: 'Withdrawals 出金', value: formatCurrency(-totals.withdrawals), icon: ArrowUpRight, tone: 'text-red-300 bg-red-500/10', text: 'text-red-300' },
    { label: 'Net funding 淨入金', value: formatCurrency(totals.net), icon: Scale, tone: 'text-cyan-300 bg-cyan-500/10', text: totals.net >= 0 ? 'text-white' : 'text-red-300' },
    { label: 'Credit 贈金', value: formatCurrency(totals.credit), icon: Gift, tone: 'text-sky-300 bg-sky-500/10', text: 'text-sky-300' },
  ];

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-500 hover:text-white'}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Deposits & Withdrawals 出入金記錄</h1>
          <p className="mt-1 text-sm text-slate-400">Every deposit, withdrawal and credit recorded on our trading accounts. 所有交易帳戶的入金、出金及贈金記錄。</p>
        </div>
        <div className="flex gap-2">
          <IconButton label="Refresh · 重新整理" tone="slate" size="md" onClick={load}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
          <IconButton label="Export Excel · 匯出" tone="primary" size="md" onClick={handleExport} disabled={loading || filtered.length === 0}>
            <FileSpreadsheet className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone, text }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className={`truncate text-xl font-bold tabular-nums ${text}`}>{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div role="group" aria-label="Time period" className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-700 bg-slate-900/70 p-1">
            {PERIODS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${period === value ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                {value === 'custom' && <CalendarRange className="h-3.5 w-3.5" />}
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label="From date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className={dateCls} />
              <span className="text-xs text-slate-500">to 至</span>
              <input type="date" aria-label="To date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className={dateCls} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {TYPE_FILTERS.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={chip(type === t)}>
                {t === 'all' ? 'All types 全部' : OP_LABEL[t]}
              </button>
            ))}
          </div>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            aria-label="Account"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All accounts 全部帳戶 ({accounts.length})</option>
            {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="relative w-full sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Account, ticket, comment… 搜尋"
              aria-label="Search"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-1.5 pl-9 pr-8 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            {query && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex">
                <IconButton label="Clear search · 清除搜尋" tone="ghost" onClick={() => setQuery('')}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 text-xs">
          <p className="text-slate-400">
            Showing <span className="font-medium tabular-nums text-white">{filtered.length}</span> of <span className="tabular-nums">{ops.length}</span> records 筆記錄
          </p>
          <IconButton label="Reset filters · 重設" tone="ghost" onClick={reset} disabled={!filtersActive}>
            <RotateCcw className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </section>

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {loading && ops.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <FundingTable ops={filtered} showTotals={false} showAccount={!account} />
          </div>
          <aside className="h-fit rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <h2 className="text-sm font-semibold text-white whitespace-nowrap">Most active 最活躍帳戶</h2>
            <p className="mt-0.5 text-[11px] text-slate-500 whitespace-nowrap">By money moved 按資金流動排序</p>
            {byAccount.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-600">—</p>
            ) : (
              <ul className="mt-2 space-y-0.5">
                {byAccount.map(([name, row]) => (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => setAccount(account === name ? '' : name)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${account === name ? 'bg-cyan-500/10 ring-1 ring-cyan-500/40' : 'hover:bg-slate-800/60'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-slate-200" title={name}>{name}</span>
                        <span className="text-[11px] tabular-nums text-slate-500">{row.count}</span>
                      </div>
                      <div className="mt-0.5 flex justify-between text-xs tabular-nums">
                        <span className="text-emerald-400">+{formatCurrency(row.dep)}</span>
                        {row.wd > 0 ? <span className="text-red-400">-{formatCurrency(row.wd)}</span> : <span className="text-slate-600">—</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
