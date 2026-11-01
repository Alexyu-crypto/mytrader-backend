import { useMemo, useState } from 'react';
import { Check, History as HistoryIcon, Loader2, PauseCircle, Search, UserPlus, Users } from 'lucide-react';
import { setClientStatus, type AgentClient } from '@/lib/agents';
import { IconButton } from '@/components/IconButton';

export function AgentClientsList({
  clients,
  canViewActivity,
  canManage,
  onViewActivity,
  onChanged,
}: {
  clients: AgentClient[];
  canViewActivity: boolean;
  canManage: boolean;
  onViewActivity: (id: string) => void;
  onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const changeStatus = async (c: AgentClient, status: 'active' | 'pending') => {
    setBusyId(c.user_id);
    setError('');
    const err = await setClientStatus(c.user_id, status);
    setBusyId('');
    if (err) return setError(err);
    onChanged();
  };
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c) => c.email.toLowerCase().includes(term) || c.accounts.some((a) => a.toLowerCase().includes(term)));
  }, [clients, q]);
  const active = clients.filter((c) => c.status === 'active').length;

  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-6 py-14 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
          <UserPlus className="h-6 w-6" />
        </div>
        <p className="mt-4 font-semibold text-white">No clients yet 尚未有客戶</p>
        <p className="mt-1 text-sm text-slate-400">Share your login link above. New sign-ups will appear here. 分享上方連結，新註冊客戶會在此顯示。</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/40">
      <header className="flex flex-col gap-3 border-b border-slate-700 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2 text-white"><Users className="h-4 w-4 text-cyan-300" /> {clients.length} clients 客戶</span>
          <span className="text-emerald-300">{active} active 已啟用</span>
          {clients.length - active > 0 && <span className="text-amber-300">{clients.length - active} awaiting approval 待批核</span>}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 搜尋" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/60 sm:w-56" />
        </div>
      </header>
      {error && <p className="border-b border-slate-700 bg-red-500/10 px-5 py-3 text-sm text-red-300">{error}</p>}
      <ul className="divide-y divide-slate-700/60">
        {filtered.map((c) => (
          <li key={c.user_id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-700/20 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-sm font-semibold uppercase text-cyan-300">{c.email.charAt(0) || '?'}</div>
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{c.email}</p>
                <p className="text-xs text-slate-500">Joined 加入於 {new Date(c.joined_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.accounts.length ? (
                c.accounts.map((a) => (
                  <span key={a} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">{a}</span>
                ))
              ) : (
                <span className="text-xs text-slate-500">No linked account 未連結帳戶</span>
              )}
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                {c.status === 'active' ? 'Active' : 'Pending'}
              </span>
              {canManage &&
                (c.status === 'active' ? (
                  <IconButton label="Deactivate · 暫停客戶" tone="amber" onClick={() => changeStatus(c, 'pending')} disabled={!!busyId}>
                    {busyId === c.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                  </IconButton>
                ) : (
                  <IconButton label="Approve · 批核" tone="green" onClick={() => changeStatus(c, 'active')} disabled={!!busyId}>
                    {busyId === c.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </IconButton>
                ))}
              {canViewActivity && (
                <IconButton label="View activity · 查看操作記錄" onClick={() => onViewActivity(c.user_id)}>
                  <HistoryIcon className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </div>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">No matches 沒有結果</li>}
      </ul>
    </section>
  );
}
