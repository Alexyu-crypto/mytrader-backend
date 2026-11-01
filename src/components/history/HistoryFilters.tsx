import { CalendarRange, RotateCcw, Search, X } from 'lucide-react';
import type { TradeHistory } from '@/lib/types';
import { IconButton } from '@/components/IconButton';

export type Period = 'all' | 'today' | 'week' | 'month' | 'custom';

export const PERIOD_LABEL: Record<Period, string> = { all: 'All time', today: 'Today', week: 'This week', month: 'This month', custom: 'Custom range' };

export function getPeriodRange(period: Period, fromDate: string, toDate: string): { from: Date | null; to: Date | null } {
  if (period === 'all') return { from: null, to: null };
  if (period === 'custom') {
    return {
      from: fromDate ? new Date(`${fromDate}T00:00:00`) : null,
      to: toDate ? new Date(`${toDate}T23:59:59.999`) : null,
    };
  }
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = from.getDay();
    from.setDate(from.getDate() - (day === 0 ? 6 : day - 1));
  } else if (period === 'month') {
    from.setDate(1);
  }
  return { from, to: now };
}

export const PERIODS: Array<[Period, string]> = [
  ['all', 'All Time'],
  ['today', 'Today'],
  ['week', 'This Week'],
  ['month', 'This Month'],
  ['custom', 'Custom'],
];

export const dateCls =
  'bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 [color-scheme:dark]';

export function HistoryFilters({
  trades,
  shownCount,
  searchQuery,
  setSearchQuery,
  period,
  setPeriod,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onReset,
}: {
  trades: TradeHistory[];
  shownCount: number;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  period: Period;
  setPeriod: (value: Period) => void;
  fromDate: string;
  setFromDate: (value: string) => void;
  toDate: string;
  setToDate: (value: string) => void;
  onReset: () => void;
}) {

  const active = !!searchQuery || period !== 'all' || !!fromDate || !!toDate;

  return (
    <>
    <section className="bg-slate-800/40 border border-slate-700 rounded-xl divide-y divide-slate-700/70">
      <div className="p-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <div className="relative max-w-xl">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search anything: date, time, account, symbol, buy/sell… 模糊搜尋"
              aria-label="Search history"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg pl-9 pr-9 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex">
                <IconButton label="Clear search · 清除" tone="ghost" onClick={() => setSearchQuery('')}>
                  <X className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            Mix any words, e.g. <span className="font-mono text-slate-400">xau sell 10/13</span>, <span className="font-mono text-slate-400">cbcx 16:54</span>, <span className="font-mono text-slate-400">equiti loss</span> · 可混合輸入日期、時間、帳戶、品種、買賣
          </p>
        </div>

        <div className="space-y-2">
          <div role="group" aria-label="Time period" className="inline-flex flex-wrap bg-slate-900/70 border border-slate-700 rounded-lg p-1 gap-1">
            {PERIODS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  period === value ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {value === 'custom' && <CalendarRange className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label="From date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className={dateCls} />
              <span className="text-slate-500 text-xs">to</span>
              <input type="date" aria-label="To date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className={dateCls} />
            </div>
          )}
        </div>
      </div>
    </section>

      <div className="!mt-2 flex flex-nowrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs">
        <p className="min-w-0 text-slate-400">
          Showing <span className="text-white font-medium tabular-nums">{shownCount}</span> of{' '}
          <span className="tabular-nums">{trades.length}</span> trades
        </p>
        <IconButton label="Reset filters · 重設篩選" tone="ghost" onClick={onReset} disabled={!active}>
          <RotateCcw className="w-3.5 h-3.5" />
        </IconButton>
      </div>
    </>
  );
}
