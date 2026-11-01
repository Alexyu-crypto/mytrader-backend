import { useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import type { Account, LivePosition } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatSigned, isOnline } from '@/lib/format';
import { ScrollRows } from '@/components/ScrollRows';

interface GroupRow {
  master: string;
  name: string;
  followers: number;
  online: number;
  positions: number;
  balance: number;
  equity: number;
  floating: number;
  closed: number;
}

const plTone = (v: number) => (v >= 0 ? 'text-emerald-400' : 'text-red-400');

export function CopyGroupSubtotals({
  accounts,
  positions,
  closedPl,
}: {
  accounts: Account[];
  positions: LivePosition[];
  closedPl: Map<string, number> | null;
}) {
  const [links, setLinks] = useState<{ master_account: string; follower_account: string }[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [s, g] = await Promise.all([
        supabase.from('copy_settings').select('master_account, follower_account'),
        supabase.from('copy_groups').select('master_account, name'),
      ]);
      if (cancelled) return;
      if (s.error || g.error || !Array.isArray(s.data)) {
        setError(true);
        return;
      }
      setError(false);
      setLinks(s.data as { master_account: string; follower_account: string }[]);
      setNames(new Map((g.data ?? []).map((r) => [r.master_account as string, r.name as string])));
    };
    load();
    const poll = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  const rows = useMemo(() => {
    if (!links) return [];
    const byName = new Map(accounts.map((a) => [a.account_name, a]));
    const pos = new Map<string, { profit: number; count: number }>();
    for (const p of positions) {
      const s = pos.get(p.account_name) ?? { profit: 0, count: 0 };
      s.profit += p.profit || 0;
      s.count += 1;
      pos.set(p.account_name, s);
    }
    const followersOf = new Map<string, Set<string>>();
    for (const l of links) {
      if (!byName.has(l.follower_account)) continue;
      const set = followersOf.get(l.master_account) ?? new Set<string>();
      set.add(l.follower_account);
      followersOf.set(l.master_account, set);
    }
    const list: GroupRow[] = [];
    for (const [master, followers] of followersOf) {
      const row: GroupRow = { master, name: names.get(master) ?? '', followers: followers.size, online: 0, positions: 0, balance: 0, equity: 0, floating: 0, closed: 0 };
      for (const f of followers) {
        const a = byName.get(f)!;
        row.balance += Number(a.balance) || 0;
        row.equity += Number(a.equity) || 0;
        if (isOnline(a)) row.online += 1;
        const p = pos.get(f);
        if (p) {
          row.floating += p.profit;
          row.positions += p.count;
        }
        row.closed += closedPl?.get(f) ?? 0;
      }
      list.push(row);
    }
    return list.sort((a, b) => b.balance - a.balance || a.master.localeCompare(b.master));
  }, [links, names, accounts, positions, closedPl]);

  if (error || !links || rows.length === 0) return null;

  const sum = rows.reduce(
    (t, r) => ({ balance: t.balance + r.balance, equity: t.equity + r.equity, floating: t.floating + r.floating, closed: t.closed + r.closed }),
    { balance: 0, equity: 0, floating: 0, closed: 0 },
  );

  const th = 'px-3 py-2.5 font-medium whitespace-nowrap';
  const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Layers className="w-4 h-4 text-teal-400" />
          Copy Groups · 跟單組別
        </h2>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Total <span className="text-white">{rows.length}</span>
        </span>
      </div>
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <ScrollRows rows={6}>
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                <th className={`${th} text-left`}>Group · 組別</th>
                <th className={`${th} text-right`}>Followers</th>
                <th className={`${th} text-right`}>Balance · 結餘</th>
                <th className={`${th} text-right`}>Equity · 淨值</th>
                <th className={`${th} text-right`}>Floating P&L</th>
                <th className={`${th} text-right`}>Total P&L · 總盈虧</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const total = r.closed + r.floating;
                return (
                  <tr key={r.master} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors">
                    <td className="px-3 py-2">
                      <span className="text-white font-medium whitespace-nowrap">{r.name || r.master}</span>
                      <p className="text-slate-500 text-xs whitespace-nowrap">{r.name ? `Master ${r.master}` : 'No group name set · 未命名'}</p>
                    </td>
                    <td className={td}>
                      <span className="text-white">{r.followers}</span>
                      <span className="block text-[11px] text-emerald-400">{r.online} online</span>
                    </td>
                    <td className={`${td} text-white`}>{formatCurrency(r.balance)}</td>
                    <td className={`${td} ${r.equity >= r.balance ? 'text-white' : 'text-red-300'}`}>{formatCurrency(r.equity)}</td>
                    <td className={td}>
                      <span className={`font-medium ${plTone(r.floating)}`}>{formatSigned(r.floating)}</span>
                      <span className="block text-[11px] text-slate-500">{r.positions} open</span>
                    </td>
                    <td className={`${td} font-medium ${closedPl ? plTone(total) : 'text-slate-500'}`}>{closedPl ? formatSigned(total) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRows>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2.5 border-t border-slate-700 text-xs text-slate-400 tabular-nums">
          <span>Totals are for the follower accounts in each group. 數字為各組跟單戶口合計。</span>
          <span className="flex flex-wrap gap-x-4">
            <span>Balance <span className="text-white">{formatCurrency(sum.balance)}</span></span>
            <span>Equity <span className="text-white">{formatCurrency(sum.equity)}</span></span>
            <span>Floating <span className={plTone(sum.floating)}>{formatSigned(sum.floating)}</span></span>
            {closedPl && <span>Total P&L <span className={plTone(sum.closed + sum.floating)}>{formatSigned(sum.closed + sum.floating)}</span></span>}
          </span>
        </div>
      </div>
    </div>
  );
}
