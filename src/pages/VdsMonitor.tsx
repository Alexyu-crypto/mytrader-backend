import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Server, Wifi, WifiOff, Users, ArrowDownUp, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAccounts } from '@/hooks/useRealtime';
import { fetchAccountIps, type LoginIp } from '@/lib/accountCredentials';
import { loadVdsInstallations, type Installation } from '@/lib/terminalInstaller';
import { buildVdsList, type Vds } from '@/lib/vdsMonitor';
import { VdsCard } from '@/components/vds/VdsCard';
import { supabase } from '@/lib/supabase';

async function loadGroupNames() {
  const [s, g] = await Promise.all([
    supabase.from('copy_settings').select('master_account, follower_account'),
    supabase.from('copy_groups').select('master_account, name'),
  ]);
  if (s.error || g.error) return null;
  const named = new Map((g.data ?? []).map((r) => [r.master_account as string, r.name as string]));
  const result = new Map<string, string>();
  for (const [master, name] of named) result.set(master, name);
  for (const l of s.data ?? []) {
    const name = named.get(l.master_account as string) ?? `跟 ${l.master_account}`;
    if (!result.has(l.follower_account as string)) result.set(l.follower_account as string, name);
  }
  return result;
}

const RELOAD_MS = 30_000;
const PAGE_SIZE = 10;

type VdsSortKey = 'problems' | 'ip' | 'offline' | 'rate' | 'contact' | 'total';

const SORTS: { key: VdsSortKey; label: string }[] = [
  { key: 'problems', label: '問題優先 · Problems first' },
  { key: 'ip', label: 'IP' },
  { key: 'offline', label: '離線數 · Offline' },
  { key: 'rate', label: '在線率 · Online %' },
  { key: 'contact', label: '最後聯絡 · Last contact' },
  { key: 'total', label: '帳戶數 · Accounts' },
];

const ipValue = (ip: string | null) => (ip ?? '').split('.').map((p) => p.padStart(3, '0')).join('.');
const rate = (v: Vds) => (v.total ? v.onlineCount / v.total : 1);

const COMPARE: Record<VdsSortKey, (a: Vds, b: Vds) => number> = {
  problems: () => 0,
  ip: (a, b) => ipValue(a.ip).localeCompare(ipValue(b.ip)),
  offline: (a, b) => a.total - a.onlineCount - (b.total - b.onlineCount),
  rate: (a, b) => rate(a) - rate(b),
  contact: (a, b) => (a.lastContact ?? '').localeCompare(b.lastContact ?? ''),
  total: (a, b) => a.total - b.total,
};

export function VdsMonitorPage({ canEdit }: { canEdit: boolean }) {
  const { accounts } = useAccounts();
  const [installs, setInstalls] = useState<Installation[] | null>(null);
  const [ips, setIps] = useState<Record<string, LoginIp>>({});
  const [groupOf, setGroupOf] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [sortKey, setSortKey] = useState<VdsSortKey>('problems');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [rows, names] = await Promise.all([loadVdsInstallations(), loadGroupNames()]);
      setInstalls(rows);
      if (names) setGroupOf(names);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load VDS list.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchAccountIps().then((r) => r && setIps(r));
    const timer = window.setInterval(load, RELOAD_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const list = useMemo(() => buildVdsList(installs ?? [], accounts, ips, groupOf), [installs, accounts, ips, groupOf]);

  const stats = useMemo(() => {
    const total = list.reduce((n, v) => n + v.total, 0);
    const online = list.reduce((n, v) => n + v.onlineCount, 0);
    return { vds: list.length, vdsOnline: list.filter((v) => v.online).length, total, online };
  }, [list]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((v) => {
      if (onlyProblems && v.online && v.onlineCount === v.total) return false;
      if (!q) return true;
      return (
        (v.ip ?? '').includes(q) ||
        (v.machine ?? '').toLowerCase().includes(q) ||
        v.installs.some((i) => i.install.group_name.toLowerCase().includes(q) || i.accounts.some((a) => a.login.includes(q) || a.name.toLowerCase().includes(q))) ||
        v.manual.some((g) => g.name.toLowerCase().includes(q) || g.accounts.some((a) => a.login.includes(q) || a.name.toLowerCase().includes(q)))
      );
    });
  }, [list, query, onlyProblems]);

  const sorted = useMemo(() => {
    const order = new Map(shown.map((v, i) => [v.key, i]));
    const cmp = COMPARE[sortKey];
    return [...shown].sort((a, b) => (cmp(a, b) || order.get(a.key)! - order.get(b.key)!) * sortDir);
  }, [shown, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageItems = sorted.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const changeSort = (key: VdsSortKey) => {
    setSortKey(key);
    setSortDir(1);
    setPage(0);
  };

  const cards = [
    { label: 'VDS 總數', value: stats.vds, icon: Server, tone: 'text-cyan-300 bg-cyan-500/10' },
    { label: 'VDS 在線', value: `${stats.vdsOnline} / ${stats.vds}`, icon: Wifi, tone: 'text-emerald-300 bg-emerald-500/10' },
    { label: '帳戶在線 · AC Live', value: `${stats.online} / ${stats.total}`, icon: Users, tone: 'text-sky-300 bg-sky-500/10' },
    { label: '帳戶離線', value: stats.total - stats.online, icon: WifiOff, tone: stats.total - stats.online ? 'text-red-300 bg-red-500/10' : 'text-slate-400 bg-slate-800' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">VDS Monitor · VDS 監察</h1>
          <p className="text-sm text-slate-400 mt-1">所有已安裝 EA 嘅 VDS、帳戶即時連線狀態，同遠端加速 / 解除安裝。</p>
        </div>
        <button type="button" onClick={load} disabled={refreshing} className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-60 transition-colors">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh · 重新整理
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center gap-3">
            <span className={`w-10 h-10 rounded-lg grid place-items-center ${c.tone}`}>
              <c.icon className="w-5 h-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className="text-xl font-semibold text-slate-100 tabular-nums">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="搜尋 IP、電腦名、群組或帳號…" className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60" />
        </label>
        <button type="button" onClick={() => { setOnlyProblems((v) => !v); setPage(0); }} className={`text-sm px-3 py-2 rounded-lg border transition-colors ${onlyProblems ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
          只看有問題 · Problems only
        </button>
        <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 focus-within:border-cyan-500/60 transition-colors">
          <label className="flex items-center gap-2 pl-3 text-sm text-slate-400">
            <ArrowDownUp className="w-4 h-4" />
            <span className="sr-only">排序 · Sort</span>
            <select value={sortKey} onChange={(e) => changeSort(e.target.value as VdsSortKey)} className="bg-transparent py-2 pr-2 text-sm text-slate-100 focus:outline-none cursor-pointer">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key} className="bg-slate-900">
                  排序：{s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => { setSortDir((d) => (d === 1 ? -1 : 1)); setPage(0); }}
            title={sortDir === 1 ? '升序 · Ascending（按一下反轉）' : '降序 · Descending（按一下反轉）'}
            className="px-2.5 py-2 border-l border-slate-700 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded-r-lg transition-colors"
          >
            {sortDir === 1 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {installs === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
          <Server className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-slate-400 mt-3">{list.length ? '冇符合條件嘅 VDS' : '暫時未有已安裝 EA 嘅 VDS'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {pageItems.map((v) => (
              <VdsCard key={v.key} vds={v} canEdit={canEdit} onChanged={load} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-slate-500 tabular-nums">
              顯示 {current * PAGE_SIZE + 1}–{current * PAGE_SIZE + pageItems.length} / 共 {sorted.length} 部 VDS
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                  <ChevronLeft className="w-4 h-4" />上一頁
                </button>
                {Array.from({ length: pageCount }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i)}
                    aria-current={i === current ? 'page' : undefined}
                    className={`w-8 h-8 rounded-lg tabular-nums transition-colors ${i === current ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                  下一頁<ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
