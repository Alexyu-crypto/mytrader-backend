import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Crown, FileSpreadsheet, Loader2, Users, XCircle } from 'lucide-react';
import { PinnedTop } from '@/components/PinnedTop';
import { ScrollRows } from '@/components/ScrollRows';
import { Hint, IconButton } from '@/components/IconButton';
import { formatTime } from '@/lib/format';
import { exportPositionsWorkbook } from '@/lib/historyExport';
import { logActivity } from '@/lib/activityLog';
import type { Account, LivePosition } from '@/lib/types';
import type { CloseGroup } from '@/components/desk/ClosePositionsDialog';

type SortKey = 'account_name' | 'ticket' | 'symbol' | 'order_type' | 'lots' | 'open_price' | 'sl' | 'tp' | 'profit' | 'open_time';

const COLUMNS: [string, SortKey, 'text-left' | 'text-right'][] = [
  ['Account', 'account_name', 'text-left'],
  ['Ticket', 'ticket', 'text-left'],
  ['Symbol', 'symbol', 'text-left'],
  ['Type', 'order_type', 'text-left'],
  ['Lots', 'lots', 'text-right'],
  ['Open Price', 'open_price', 'text-right'],
  ['SL', 'sl', 'text-right'],
  ['TP', 'tp', 'text-right'],
  ['Profit', 'profit', 'text-right'],
  ['Open Time', 'open_time', 'text-left'],
];

type Scope = 'master' | 'follower';

export function MasterPositionsPanel({ masters, followers, positions, closing, onClose }: {
  masters: Account[];
  followers: Account[];
  positions: LivePosition[];
  closing: Set<number>;
  onClose: (groups: CloseGroup[]) => void;
}) {
  const [scope, setScope] = useState<Scope>('master');
  const [selected, setSelected] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('open_time');
  const [sortDesc, setSortDesc] = useState(true);

  const isMaster = scope === 'master';
  const scopeAccounts = isMaster ? masters : followers;
  const masterNames = useMemo(() => new Set(masters.map((m) => m.account_name)), [masters]);
  const followerNames = useMemo(() => new Set(followers.map((f) => f.account_name)), [followers]);
  const masterPositions = useMemo(() => positions.filter((p) => masterNames.has(p.account_name)), [positions, masterNames]);
  const followerPositions = useMemo(() => positions.filter((p) => followerNames.has(p.account_name)), [positions, followerNames]);
  const scopePositions = isMaster ? masterPositions : followerPositions;
  const filtered = selected === 'all' ? scopePositions : scopePositions.filter((p) => p.account_name === selected);
  const countOf = (name: string) => scopePositions.filter((p) => p.account_name === name).length;

  const switchScope = (next: Scope) => {
    setScope(next);
    setSelected('all');
  };

  const sorted = [...filtered].sort((a, b) => {
    const value = (p: LivePosition) => (sortKey === 'open_time' ? (p.open_time ? new Date(p.open_time).getTime() : null) : p[sortKey] ?? null);
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
    return sortDesc ? -cmp : cmp;
  });

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(false);
    }
  };

  const handleExport = () => {
    const label = selected === 'all' ? (isMaster ? 'All masters' : 'All followers') : selected;
    exportPositionsWorkbook(`${scope}-positions-${new Date().toISOString().slice(0, 10)}`, sorted, new Map(), label);
    logActivity('export', 'positions', label, { positions: sorted.length });
  };

  const floating = filtered.reduce((s, p) => s + (p.profit || 0), 0);
  const buyLots = filtered.filter((p) => p.order_type === 'BUY').reduce((s, p) => s + (p.lots || 0), 0);
  const sellLots = filtered.filter((p) => p.order_type !== 'BUY').reduce((s, p) => s + (p.lots || 0), 0);
  const stats: [string, string, string][] = [
    ['Open Positions', String(filtered.length), 'text-white'],
    ['Floating P&L', `${floating >= 0 ? '+' : ''}$${floating.toFixed(2)}`, floating >= 0 ? 'text-emerald-400' : 'text-red-400'],
    ['Buy Lots', buyLots.toFixed(2), 'text-emerald-400'],
    ['Sell Lots', sellLots.toFixed(2), 'text-red-400'],
  ];

  const chip = (key: string, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setSelected(key)}
      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        selected === key ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[11px] font-semibold ${selected === key ? 'bg-white/20' : 'bg-slate-700 text-slate-300'}`}>{count}</span>
    </button>
  );

  return (
    <section className="space-y-5 border-t border-slate-800 pt-8">
      <PinnedTop>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Live Positions 即時持倉</h2>
          <p className="mt-1 text-sm text-slate-400">
            {isMaster ? 'Open trades on master accounts, updated in real time · 主帳戶即時持倉' : 'Open trades on all follower accounts, updated in real time · 所有跟單帳戶即時持倉'}
          </p>
        </div>
        <IconButton label="Export Excel · 匯出" tone="primary" size="md" onClick={handleExport} disabled={sorted.length === 0}>
          <FileSpreadsheet className="h-4 w-4" />
        </IconButton>
      </div>

      <div role="tablist" className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1">
        {([
          ['master', 'Masters 主帳戶', Crown, masterPositions.length],
          ['follower', 'Followers 跟單帳戶', Users, followerPositions.length],
        ] as const).map(([key, label, Icon, count]) => {
          const active = scope === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchScope(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                active ? (key === 'master' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300') : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className={`rounded-full px-1.5 text-[11px] ${active ? 'bg-white/10' : 'bg-slate-800 text-slate-400'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {chip('all', isMaster ? 'All masters 全部主帳戶' : 'All followers 全部跟單帳戶', scopePositions.length)}
        {scopeAccounts.map((a) => chip(a.account_name, a.account_name, countOf(a.account_name)))}
      </div>
      </PinnedTop>

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50">
        <ScrollRows rows={100}>
          <table className="w-full whitespace-nowrap text-[13px]">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase text-slate-400">
                {COLUMNS.map(([label, key, align]) => {
                  const active = sortKey === key;
                  return (
                    <th key={key} className={`${align} whitespace-nowrap px-3 py-2.5 font-medium`} aria-sort={active ? (sortDesc ? 'descending' : 'ascending') : 'none'}>
                      <button type="button" onClick={() => handleSort(key)} className={`inline-flex items-center gap-1.5 uppercase transition-colors hover:text-white ${active ? 'text-cyan-400' : ''}`} aria-label={`Sort by ${label}`}>
                        {label}
                        {!active ? <ArrowUpDown size={13} className="opacity-50" /> : sortDesc ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                      </button>
                    </th>
                  );
                })}
                {isMaster && <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">Action</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={isMaster ? 11 : 10} className="py-8 text-center text-slate-500">
                    {isMaster ? 'No open master positions 主帳戶暫無持倉' : 'No open follower positions 跟單帳戶暫無持倉'}
                  </td>
                </tr>
              ) : (
                sorted.map((pos) => {
                  const profit = pos.profit || 0;
                  return (
                    <tr key={pos.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="px-3 py-2 font-medium text-slate-300">
                        <span className="inline-flex items-center gap-2">
                          {isMaster ? <Crown className="h-3.5 w-3.5 text-cyan-400" /> : <Users className="h-3.5 w-3.5 text-amber-400" />}
                          {pos.account_name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{pos.ticket}</td>
                      <td className="px-3 py-2 font-medium text-white">{pos.symbol}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${pos.order_type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{pos.order_type}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">{pos.lots}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{pos.open_price}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{pos.sl || '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{pos.tp || '—'}</td>
                      <td className={`px-3 py-2 text-right font-medium ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{profit >= 0 ? '+' : ''}{profit.toFixed(2)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">{formatTime(pos.open_time)}</td>
                      {isMaster && <td className="whitespace-nowrap px-3 py-2 text-right">
                        {closing.has(pos.ticket) ? (
                          <Hint label="Closing · 平倉中">
                            <span className="inline-flex h-7 w-7 items-center justify-center text-amber-300">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            </span>
                          </Hint>
                        ) : (
                          <IconButton label="Close position · 平倉" tone="red" onClick={() => onClose([{ account: pos.account_name, symbol: pos.symbol, positions: [pos] }])}>
                            <XCircle className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                      </td>}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ScrollRows>
      </div>
    </section>
  );
}
