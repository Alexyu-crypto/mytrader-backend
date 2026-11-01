import type React from 'react';
import { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowDownWideNarrow, ArrowUp, ArrowUpDown, ArrowUpNarrowWide, FileBarChart, Search } from 'lucide-react';
import type { Account, LivePosition } from '@/lib/types';
import { formatCurrency, formatSigned as signed, isOnline, timeAgo } from '@/lib/format';
import { reportUrl } from '@/lib/accountData';
import { useShareSlug } from '@/hooks/useShareSlug';
import { ScrollRows } from '@/components/ScrollRows';
import { Hint, IconButton } from '@/components/IconButton';
import { ReadOnlyBadge } from '@/components/ReadOnlyBadge';

type SortKey = 'status' | 'account_name' | 'balance' | 'equity' | 'profit' | 'positions' | 'last_seen';

interface Row {
  account: Account;
  online: boolean;
  profit: number;
  positions: number;
}

const columns: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'status', label: 'Status' },
  { key: 'account_name', label: 'Account' },
  { key: 'balance', label: 'Balance', align: 'right' },
  { key: 'equity', label: 'Equity', align: 'right' },
  { key: 'profit', label: 'Floating P&L', align: 'right' },
  { key: 'positions', label: 'Positions', align: 'right' },
  { key: 'last_seen', label: 'Last Seen', align: 'right' },
];

function sortValue(row: Row, key: SortKey): number | string {
  switch (key) {
    case 'status':
      return row.online ? 1 : 0;
    case 'account_name':
      return row.account.account_name.toLowerCase();
    case 'balance':
      return row.account.balance || 0;
    case 'equity':
      return row.account.equity || 0;
    case 'profit':
      return row.profit;
    case 'positions':
      return row.positions;
    case 'last_seen':
      return row.account.last_seen ? new Date(row.account.last_seen).getTime() : 0;
  }
}

function MoneyCell({ value, online, lastSeen }: { value: number | null; online: boolean; lastSeen: string | null }) {
  if (!lastSeen) {
    return (
      <td className="px-3 py-2 text-right text-slate-500 text-xs whitespace-nowrap" title="The EA has never connected, so there is no figure yet. EA 從未連線，暫無數據。">
        Never connected
      </td>
    );
  }
  if (online) return <td className="px-3 py-2 text-right text-white tabular-nums">{formatCurrency(value || 0)}</td>;
  return (
    <td className="px-3 py-2 text-right tabular-nums" title={`Last known value, received ${timeAgo(lastSeen)}. 最後紀錄數值。`}>
      <span className="text-slate-300">{formatCurrency(value || 0)}</span>
      <span className="block text-[10px] uppercase tracking-wide text-slate-500">Last · 最後</span>
    </td>
  );
}

const plTone = (v: number) => (v >= 0 ? 'text-emerald-400' : 'text-red-400');

function SubtotalStat({ label, value, sub, tone = 'text-white' }: { label: string; value: string; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 truncate">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums truncate ${tone}`} title={value}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 tabular-nums truncate">{sub}</p>}
    </div>
  );
}

export function AccountsTable({
  accounts,
  positions,
  closedPl,
  visibleRows = 5,
}: {
  accounts: Account[];
  positions: LivePosition[];
  closedPl?: Map<string, number> | null;
  visibleRows?: number;
}) {
  const [query, setQuery] = useState('');
  const shareSlug = useShareSlug();
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDesc, setSortDesc] = useState(true);
  const sortId = useId();

  const rows = useMemo(() => {
    const stats = new Map<string, { profit: number; positions: number }>();
    for (const p of positions) {
      const s = stats.get(p.account_name) ?? { profit: 0, positions: 0 };
      s.profit += p.profit || 0;
      s.positions += 1;
      stats.set(p.account_name, s);
    }
    const q = query.trim().toLowerCase();
    const list: Row[] = accounts
      .map((account) => ({
        account,
        online: isOnline(account),
        profit: stats.get(account.account_name)?.profit ?? 0,
        positions: stats.get(account.account_name)?.positions ?? 0,
      }))
      .filter(
        (r) =>
          (statusFilter === 'all' || (statusFilter === 'online') === r.online) &&
          (!q || r.account.account_name.toLowerCase().includes(q) || r.account.broker.toLowerCase().includes(q)),
      );
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : a.account.account_name.localeCompare(b.account.account_name);
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }, [accounts, positions, query, statusFilter, sortKey, sortDesc]);

  const totals = useMemo(() => {
    let balance = 0, equity = 0, floating = 0, openCount = 0, online = 0, closed = 0;
    for (const r of rows) {
      balance += Number(r.account.balance) || 0;
      equity += Number(r.account.equity) || 0;
      floating += r.profit;
      openCount += r.positions;
      if (r.online) online += 1;
      closed += closedPl?.get(r.account.account_name) ?? 0;
    }
    return { balance, equity, floating, openCount, online, totalPl: closedPl ? closed + floating : null };
  }, [rows, closedPl]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(key !== 'account_name');
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-700">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
                      }}
            placeholder="Search account name or broker..."
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 whitespace-nowrap" htmlFor={`sort-${sortId}`}>
            Sort by
          </label>
          <select
            id={`sort-${sortId}`}
            value={sortKey}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSortKey(key);
              setSortDesc(key !== 'account_name');
                      }}
            className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
          >
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <IconButton
            label={sortDesc ? 'High to low · 由高至低' : 'Low to high · 由低至高'}
            size="md"
            onClick={() => {
              setSortDesc(!sortDesc);
            }}
          >
            {sortDesc ? <ArrowDownWideNarrow className="w-4 h-4" /> : <ArrowUpNarrowWide className="w-4 h-4" />}
          </IconButton>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
          {(['all', 'online', 'offline'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                          }}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                statusFilter === s ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-slate-700/60 border-b border-slate-700 bg-slate-900/40" aria-label="Subtotal">
        <SubtotalStat label="Accounts · 帳戶" value={String(rows.length)} sub={<span className="text-emerald-400">{totals.online} online</span>} />
        <SubtotalStat label="Balance · 結餘" value={formatCurrency(totals.balance)} />
        <SubtotalStat
          label="Equity · 淨值"
          value={formatCurrency(totals.equity)}
          tone={totals.equity >= totals.balance ? 'text-white' : 'text-red-300'}
          sub={<span className={plTone(totals.equity - totals.balance)}>{signed(totals.equity - totals.balance)} vs balance</span>}
        />
        <SubtotalStat label="Floating P&L · 浮動盈虧" value={signed(totals.floating)} tone={plTone(totals.floating)} sub={`${totals.openCount} open positions`} />
        <SubtotalStat
          label="Total P&L · 總盈虧"
          value={totals.totalPl === null ? '—' : signed(totals.totalPl)}
          tone={totals.totalPl === null ? 'text-slate-500' : plTone(totals.totalPl)}
          sub="Closed + floating"
        />
      </div>

      <ScrollRows rows={visibleRows}>
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
              {columns.map((c) => (
                <th key={c.key} className={`px-3 py-2.5 font-medium whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  <button
                    onClick={() => toggleSort(c.key)}
                    className={`inline-flex items-center gap-1 uppercase hover:text-white transition-colors ${sortKey === c.key ? 'text-white' : ''}`}
                  >
                    {c.label}
                    {sortKey === c.key ? (
                      sortDesc ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  No accounts match your search.
                </td>
              </tr>
            ) : (
              rows.map(({ account, online, profit, positions: count }) => (
                <tr key={account.id} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium w-14 ${online ? 'text-emerald-400' : 'text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                        {online ? 'Online' : 'Offline'}
                      </span>
                      <Hint label="Performance report · 績效報告">
                        <a
                          href={reportUrl(account.account_name, shareSlug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open performance report for ${account.account_name}`}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/40 transition-colors"
                        >
                          <FileBarChart className="w-3.5 h-3.5" />
                        </a>
                      </Hint>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="text-white font-medium whitespace-nowrap">{account.account_name}</span>
                      <ReadOnlyBadge account={account} />
                    </span>
                    <p className="text-slate-500 text-xs whitespace-nowrap">
                      {account.broker} - {account.platform}
                    </p>
                  </td>
                  <MoneyCell value={account.balance} online={online} lastSeen={account.last_seen} />
                  <MoneyCell value={account.equity} online={online} lastSeen={account.last_seen} />
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {profit >= 0 ? '+' : ''}
                    {formatCurrency(profit)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{count}</td>
                  <td className="px-3 py-2 text-right text-slate-500 text-xs whitespace-nowrap">{timeAgo(account.last_seen)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollRows>

      <div className="px-4 py-2.5 border-t border-slate-700 text-xs text-slate-400">
        {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
      </div>
    </div>
  );
}
