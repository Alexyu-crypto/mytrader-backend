import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, History as HistoryIcon, Loader2, LogIn, PencilLine, Search, Users as UsersIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/lib/debounce';
import { downloadCsv } from '@/lib/csv';
import { ACTION_META, CATEGORY_LABEL, PAGE_SIZE, fetchActivity, type ActivityEntry } from '@/lib/activityLog';
import type { Member } from '@/lib/members';
import { ActivityEntryRow } from '@/components/users/ActivityEntryRow';
import { IconButton } from '@/components/IconButton';

const PERIODS: [number, string][] = [
  [1, 'Today 今日'],
  [7, '7 days 7日'],
  [30, '30 days 30日'],
  [0, 'All 全部'],
];

const CHANGE_ACTIONS = new Set(['insert', 'update', 'delete', 'user_created', 'user_deleted', 'password_reset', 'close_position']);

const selectClass = 'rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500';

export function ActivityLogPanel({ members, actorId, onActorChange }: { members: Member[]; actorId: string; onActorChange: (id: string) => void }) {
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [sinceDays, setSinceDays] = useState(7);
  const [hideViews, setHideViews] = useState(true);
  const [search, setSearch] = useState('');

  const query = useMemo(() => ({ actorId, category, sinceDays, hideViews }), [actorId, category, sinceDays, hideViews]);

  const load = useCallback(async () => {
    const res = await fetchActivity(query);
    setRows(res.rows);
    setError(res.error ?? '');
    setHasMore(res.rows.length === PAGE_SIZE);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    setLoading(true);
    load();
    const reload = debounce(load, 800);
    const channel = supabase
      .channel(`activity-log-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, reload)
      .subscribe();
    return () => {
      reload.cancel();
      supabase.removeChannel(channel);
    };
  }, [load]);

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const res = await fetchActivity({ ...query, before: last.created_at });
    if (res.error) setError(res.error);
    else {
      setRows((prev) => [...prev, ...res.rows]);
      setHasMore(res.rows.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.actor_email} ${r.target} ${r.action} ${r.category} ${JSON.stringify(r.changes ?? '')} ${JSON.stringify(r.meta ?? '')}`.toLowerCase().includes(q));
  }, [rows, search]);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const r of shown) {
      const day = new Date(r.created_at).toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const list = map.get(day);
      if (list) list.push(r);
      else map.set(day, [r]);
    }
    return [...map.entries()];
  }, [shown]);

  const stats = [
    { label: 'Entries 記錄', value: shown.length, icon: HistoryIcon, tone: 'text-cyan-300 bg-cyan-500/10' },
    { label: 'Users 用戶', value: new Set(shown.map((r) => r.actor_id)).size, icon: UsersIcon, tone: 'text-sky-300 bg-sky-500/10' },
    { label: 'Changes 變更', value: shown.filter((r) => CHANGE_ACTIONS.has(r.action)).length, icon: PencilLine, tone: 'text-amber-300 bg-amber-500/10' },
    { label: 'Sign-ins 登入', value: shown.filter((r) => r.action === 'sign_in').length, icon: LogIn, tone: 'text-emerald-300 bg-emerald-500/10' },
  ];

  const exportRows = () =>
    downloadCsv(
      `activity-log-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Time', 'User', 'Action', 'Area', 'Target', 'Changes', 'Details'],
      shown.map((r) => [r.created_at, r.actor_email, ACTION_META[r.action]?.label ?? r.action, CATEGORY_LABEL[r.category] ?? r.category, r.target, r.changes, r.meta]),
    );

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-bold text-white">{value}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative min-w-0 flex-1 lg:min-w-[14rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search account, email, field… 搜尋"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
          />
        </div>
        <select value={actorId} onChange={(e) => onActorChange(e.target.value)} className={selectClass} aria-label="User">
          <option value="">All users 所有用戶</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.email}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass} aria-label="Area">
          <option value="">All areas 所有範疇</option>
          {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-700 bg-slate-800 p-1">
          {PERIODS.map(([days, label]) => (
            <button
              key={days}
              onClick={() => setSinceDays(days)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${sinceDays === days ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={hideViews} onChange={(e) => setHideViews(e.target.checked)} className="h-4 w-4 accent-cyan-500" />
          Hide page views 隱藏瀏覽
        </label>
        <IconButton label="Export CSV · 匯出" size="md" onClick={exportRows} disabled={shown.length === 0}>
          <Download className="h-4 w-4" />
        </IconButton>
      </section>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

      <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          </div>
        ) : groups.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <HistoryIcon className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">No activity for these filters 沒有符合的操作記錄</p>
          </div>
        ) : (
          groups.map(([day, list]) => (
            <div key={day}>
              <h3 className="border-b border-slate-700 bg-slate-800/95 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">

                {day} <span className="ml-1 font-normal normal-case text-slate-500">· {list.length}</span>
              </h3>
              <ul>
                {list.map((entry) => (
                  <ActivityEntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ))
        )}
        {hasMore && !loading && (
          <div className="border-t border-slate-700 px-5 py-3 text-center">
            <button onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 disabled:opacity-60">
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Load older 載入更早記錄
            </button>
          </div>
        )}
      </section>
      <p className="text-xs text-slate-500">
        Every change made by a signed-in user is recorded automatically and cannot be edited or deleted. 所有已登入用戶的操作均會自動記錄，無法修改或刪除。
      </p>
    </div>
  );
}
