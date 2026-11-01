import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { CopyRequestDrawer } from '@/components/users/CopyRequestDrawer';
import { STATUS_META, fetchCopyRequests, isOpen, type CopyRequest } from '@/lib/copyRequests';
import { timeAgo } from '@/lib/format';

type Filter = 'open' | 'all';

export function AgentCopyRequests({ clientIds, onCountChange }: { clientIds: Set<string>; onCountChange: (open: number) => void }) {
  const [requests, setRequests] = useState<CopyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchCopyRequests();
    const mine = res.requests.filter((r) => clientIds.has(r.user_id));
    setRequests(mine);
    setError(res.error ?? '');
    setLoading(false);
    onCountChange(mine.filter((r) => isOpen(r.status)).length);
  }, [clientIds, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => (filter === 'open' ? requests.filter((r) => isOpen(r.status)) : requests), [requests, filter]);
  const selected = requests.find((r) => r.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/40">
      <header className="flex flex-col gap-3 border-b border-slate-700 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-white">Copy-trading applications 跟單申請</p>
          <p className="text-xs text-slate-400">Applications from your clients. You decide 由您審批旗下客戶的申請。</p>
        </div>
        <div className="flex max-w-full flex-wrap rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs">
          {(['open', 'all'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${filter === f ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>
              {f === 'open' ? 'To handle 待處理' : 'All 全部'}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="border-b border-slate-700 bg-red-500/10 px-5 py-3 text-sm text-red-300">{error}</p>}

      <ul className="divide-y divide-slate-700/60">
        {rows.map((r) => {
          const meta = STATUS_META[r.status];
          return (
            <li key={r.id}>
              <button onClick={() => setSelectedId(r.id)} className="flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-slate-700/20 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{r.contact_name} <span className="font-normal text-slate-500">{r.email}</span></p>
                  <p className="text-xs text-slate-500">
                    Signal 信號 <span className="text-slate-300">{r.master_account}</span> · {r.platform} · {r.broker} · {timeAgo(r.created_at)}
                  </p>
                </div>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${meta.tone}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-slate-500">
            <ClipboardList className="h-6 w-6 text-slate-600" />
            {filter === 'open' ? 'Nothing to handle 沒有待處理申請' : 'No applications yet 尚未有申請'}
          </li>
        )}
      </ul>

      {selected && <CopyRequestDrawer request={selected} handlerEmail={null} asAgent onClose={() => setSelectedId(null)} onChanged={load} />}
    </section>
  );
}
