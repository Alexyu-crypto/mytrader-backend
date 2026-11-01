import { useState } from 'react';
import { Ban, ChevronDown, ClipboardList, Loader2, X } from 'lucide-react';
import { STATUS_META, cancelCopyRequest, isOpen, type CopyRequest } from '@/lib/copyRequests';
import { formatCurrency, timeAgo } from '@/lib/format';
import { IconButton } from '@/components/IconButton';

export function MyApplications({ requests, onChanged }: { requests: CopyRequest[]; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const openCount = requests.filter((r) => isOpen(r.status)).length;

  const cancel = async (id: string) => {
    setBusyId(id);
    setError('');
    const err = await cancelCopyRequest(id);
    setBusyId(null);
    setConfirmId(null);
    if (err) setError(err);
    else onChanged();
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800/30">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-800/50">
        <ClipboardList className="h-4 w-4 text-cyan-400" />
        <span className="flex-1 text-sm font-semibold text-white">
          My applications 我的申請 <span className="font-normal text-slate-500">({requests.length})</span>
        </span>
        {openCount > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-400/30">{openCount} in progress 處理中</span>}
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-800">
          {error && <p className="mx-5 mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          <ul className="divide-y divide-slate-800">
            {requests.map((r) => {
              const meta = STATUS_META[r.status];
              const confirming = confirmId === r.id;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{r.master_account}</p>
                    <p className="text-xs text-slate-500">
                      {r.platform}
                      {r.capital !== null && ` · ${formatCurrency(r.capital)}`} · Sent {timeAgo(r.created_at)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${meta.tone}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                  {isOpen(r.status) &&
                    (confirming ? (
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() => cancel(r.id)}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/25"
                        >
                          {busyId === r.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          Confirm cancel 確認取消
                        </button>
                        <IconButton label="Keep application · 保留申請" tone="ghost" onClick={() => setConfirmId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </IconButton>
                      </span>
                    ) : (
                      <IconButton label="Cancel application · 取消申請" tone="red" onClick={() => setConfirmId(r.id)}>
                        <Ban className="h-3.5 w-3.5" />
                      </IconButton>
                    ))}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
