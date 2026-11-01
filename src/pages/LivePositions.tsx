import { useEffect, useMemo, useState } from 'react';
import { useAccounts, useLivePositions } from '@/hooks/useRealtime';
import { DelayValue } from '@/components/copy/DelayValue';
import { PinnedTop } from '@/components/PinnedTop';
import { ScrollRows } from '@/components/ScrollRows';
import { formatTime } from '@/lib/format';
import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, Loader2, XCircle } from 'lucide-react';
import { exportPositionsWorkbook } from '@/lib/historyExport';
import { Hint, IconButton } from '@/components/IconButton';
import { logActivity } from '@/lib/activityLog';
import { ClosePositionDialog } from '@/components/positions/ClosePositionDialog';
import type { LivePosition } from '@/lib/types';
import { diffMs, fetchCopyLinks, serverDelayMs, tradeKey, type CopyLink } from '@/lib/copyDelay';
import { useLinkedAccounts } from '@/hooks/useLinkedAccounts';
import { ClientScopeChips, ClientScopeGate } from '@/components/client/ClientScope';

type TypeFilter = 'all' | 'master' | 'follower' | 'own' | 'signal';
type SortKey = 'account_name' | 'ticket' | 'symbol' | 'order_type' | 'lots' | 'open_price' | 'sl' | 'tp' | 'profit' | 'open_time' | 'delay';

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
  ['Delay', 'delay', 'text-right'],
];

const ADMIN_FILTERS: [TypeFilter, string][] = [['all', 'All Accounts'], ['master', 'Masters'], ['follower', 'Followers']];
const CLIENT_FILTERS: [TypeFilter, string][] = [['all', 'All 全部'], ['own', 'My accounts 我的帳戶'], ['signal', 'Signals 信號']];

export function LivePositions({ canEdit, clientView = false }: { canEdit: boolean; clientView?: boolean }) {
  const { accounts } = useAccounts();
  const { positions: allPositions } = useLivePositions();
  const scope = useLinkedAccounts(clientView);
  const linked = scope.linked;
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [links, setLinks] = useState<CopyLink[]>([]);
  const [confirming, setConfirming] = useState<LivePosition | null>(null);
  const [closing, setClosing] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('open_time');
  const [sortDesc, setSortDesc] = useState(true);

  const positions = useMemo(() => {
    if (!clientView) return allPositions;
    if (!linked) return [];
    const allowed = new Set([...linked.own, ...linked.signals]);
    return allPositions.filter((p) => allowed.has(p.account_name));
  }, [allPositions, clientView, linked]);

  const positionKeys = positions.map((p) => tradeKey(p.account_name, p.ticket)).sort().join(',');
  useEffect(() => {
    setClosing((prev) => {
      const live = new Set(positionKeys.split(','));
      const next = new Set([...prev].filter((k) => live.has(k)));
      return next.size === prev.size ? prev : next;
    });
    let cancelled = false;
    fetchCopyLinks('open').then((data) => {
      if (!cancelled) setLinks(data);
    });
    return () => {
      cancelled = true;
    };
  }, [positionKeys]);

  const delays = useMemo(() => {
    const byKey = new Map(positions.map((p) => [tradeKey(p.account_name, p.ticket), p]));
    const result = new Map<string, number | null>();
    for (const link of links) {
      const follower = byKey.get(tradeKey(link.follower_account, link.follower_ticket));
      const master = byKey.get(tradeKey(link.master_account, link.master_ticket));
      if (follower && master) result.set(follower.id, serverDelayMs(link.created_at, link.opened_at, master.open_time) ?? diffMs(follower.open_time, master.open_time));
    }
    return result;
  }, [positions, links]);

  const accountType = new Map(accounts.map((a) => [a.account_name, a.type]));
  const ownSet = new Set(linked?.own ?? []);
  const groupOf = (name: string): TypeFilter | undefined => (clientView ? (ownSet.has(name) ? 'own' : 'signal') : accountType.get(name));
  const isSignalSide = (name: string) => (clientView ? !ownSet.has(name) : accountType.get(name) === 'master');
  const filtered = positions.filter((p) => typeFilter === 'all' || groupOf(p.account_name) === typeFilter);

  const sorted = [...filtered].sort((a, b) => {
    const value = (p: LivePosition): number | string | null => {
      if (sortKey === 'delay') return delays.get(p.id) ?? null;
      if (sortKey === 'open_time') return p.open_time ? new Date(p.open_time).getTime() : null;
      return p[sortKey] ?? null;
    };
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
    const filterLabel = (clientView ? CLIENT_FILTERS : ADMIN_FILTERS).find(([t]) => t === typeFilter)?.[1] ?? 'All';
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    exportPositionsWorkbook(`live-positions-${typeFilter}-${date}`, sorted, delays, filterLabel);
    logActivity('export', 'positions', typeFilter, { positions: sorted.length });
  };

  const floating = filtered.reduce((sum, p) => sum + (p.profit || 0), 0);
  const buyLots = filtered.filter((p) => p.order_type === 'BUY').reduce((sum, p) => sum + (p.lots || 0), 0);
  const sellLots = filtered.filter((p) => p.order_type !== 'BUY').reduce((sum, p) => sum + (p.lots || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-white">{clientView ? 'Live Trading 即時交易' : 'Live Positions'}</h1>
        <p className="text-slate-400 text-sm mt-1">
          {clientView ? 'Open trades on your accounts and the signals you joined, updated in real time · 您的帳戶及已參加信號的即時持倉' : 'Open trades across all connected accounts, updated in real time'}
        </p>
      </div>
        <IconButton label="Export Excel · 匯出" tone="primary" size="md" onClick={handleExport} disabled={sorted.length === 0}>
          <FileSpreadsheet className="w-4 h-4" />
        </IconButton>
      </div>

      {clientView ? (
        <ClientScopeGate {...scope}>
          {linked && <ClientScopeChips linked={linked} />}
          {body()}
        </ClientScopeGate>
      ) : (
        body()
      )}
    </div>
  );

  function body() {
    return (
    <>
      <PinnedTop>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Open Positions</p>
          <p className="text-xl font-bold text-white mt-1">{filtered.length}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Floating P&L</p>
          <p className={`text-xl font-bold mt-1 ${floating >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {floating >= 0 ? '+' : ''}${floating.toFixed(2)}
          </p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Buy Lots</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{buyLots.toFixed(2)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Sell Lots</p>
          <p className="text-xl font-bold text-red-400 mt-1">{sellLots.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {(clientView ? CLIENT_FILTERS : ADMIN_FILTERS).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              typeFilter === t ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      </PinnedTop>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <ScrollRows rows={100}>
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                {COLUMNS.map(([label, key, align]) => {
                  const active = sortKey === key;
                  return (
                    <th key={key} className={`${align} px-3 py-2.5 font-medium whitespace-nowrap`} aria-sort={active ? (sortDesc ? 'descending' : 'ascending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => handleSort(key)}
                        className={`inline-flex items-center gap-1.5 uppercase transition-colors hover:text-white ${active ? 'text-cyan-400' : ''}`}
                        aria-label={`Sort by ${label}`}
                      >
                        {label}
                        {!active ? <ArrowUpDown size={13} className="opacity-50" /> : sortDesc ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                      </button>
                    </th>
                  );
                })}
                <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center text-slate-500 py-8">No open positions</td>
                </tr>
              ) : (
                sorted.map((pos) => (
                  <tr key={pos.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-3 py-2 text-slate-300 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isSignalSide(pos.account_name) ? 'bg-cyan-400' : 'bg-amber-400'}`} />
                        {pos.account_name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{pos.ticket}</td>
                    <td className="px-3 py-2 text-white font-medium">{pos.symbol}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          pos.order_type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {pos.order_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">{pos.lots}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{pos.open_price}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{pos.sl || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{pos.tp || '—'}</td>
                    <td className={`px-3 py-2 text-right font-medium ${(pos.profit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(pos.profit || 0) >= 0 ? '+' : ''}{(pos.profit || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{formatTime(pos.open_time)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-right">
                      {delays.has(pos.id) ? <DelayValue ms={delays.get(pos.id) ?? null} /> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {!canEdit || clientView || accountType.get(pos.account_name) !== 'follower' ? (
                        <span className="text-slate-600 text-xs">—</span>
                      ) : closing.has(tradeKey(pos.account_name, pos.ticket)) ? (
                        <Hint label="Closing · 平倉中">
                          <span className="inline-flex items-center justify-center w-7 h-7 text-amber-300">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          </span>
                        </Hint>
                      ) : (
                        <IconButton label="Close position · 平倉" tone="red" onClick={() => setConfirming(pos)}>
                          <XCircle className="w-3.5 h-3.5" />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollRows>
      </div>

      {confirming && (
        <ClosePositionDialog
          position={confirming}
          onClose={() => setConfirming(null)}
          onQueued={() => {
            const key = tradeKey(confirming.account_name, confirming.ticket);
            setClosing((prev) => new Set(prev).add(key));
          }}
        />
      )}
    </>
    );
  }
}
