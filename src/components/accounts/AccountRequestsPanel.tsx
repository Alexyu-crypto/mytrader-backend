import { useCallback, useEffect, useState } from 'react';
import { Check, X, Loader2, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { useConfirm, useNotice } from '@/hooks/useConfirm';
import { cancelAccountRequest, fetchAccountRequests, reviewAccountRequest, type AccountRequest, type AccountRequestStatus } from '@/lib/accountRequests';
import { timeAgo } from '@/lib/format';

const STATUS: Record<AccountRequestStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  pending: { label: 'Pending 待審批', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', Icon: Clock },
  approved: { label: 'Approved 已批准', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: CheckCircle2 },
  rejected: { label: 'Rejected 已拒絕', cls: 'bg-red-500/15 text-red-300 border-red-500/30', Icon: XCircle },
  cancelled: { label: 'Cancelled 已取消', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30', Icon: Ban },
};

export function AccountRequestsPanel({ mode, userId, version, onApproved }: {
  mode: 'operator' | 'self';
  userId: string | null;
  version: number;
  onApproved?: () => void;
}) {
  const ask = useConfirm();
  const notify = useNotice();
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchAccountRequests();
    setRequests(res.requests);
    setError(res.error ?? '');
  }, []);

  useEffect(() => { void load(); }, [load, version]);

  const visible = mode === 'operator' ? requests.filter((r) => r.status === 'pending') : requests.slice(0, 20);
  if (!error && visible.length === 0) return null;

  const review = async (r: AccountRequest, approve: boolean) => {
    const ok = await ask(
      approve
        ? `Approve ${r.account_name}? The account will be created and start copying ${r.master_account}.\n批准後會建立帳戶並開始跟隨 ${r.master_account}。`
        : `Reject ${r.account_name}?\n確認拒絕此申請？`,
      { tone: approve ? 'info' : 'danger', title: approve ? 'Approve account · 批准帳戶' : 'Reject account · 拒絕帳戶', confirmLabel: approve ? 'Approve · 批准' : 'Reject · 拒絕' },
    );
    if (!ok) return;
    setBusyId(r.id);
    const err = await reviewAccountRequest(r.id, approve, '');
    setBusyId(null);
    if (err) {
      void notify(err, { tone: 'warning', title: 'Not saved · 未儲存' });
      return;
    }
    await load();
    if (approve) onApproved?.();
  };

  const cancel = async (r: AccountRequest) => {
    if (!(await ask(`Cancel the request for ${r.account_name}?\n確認取消此申請？`, { tone: 'warning', title: 'Cancel request · 取消申請', confirmLabel: 'Cancel request · 取消' }))) return;
    setBusyId(r.id);
    const err = await cancelAccountRequest(r.id);
    setBusyId(null);
    if (err) void notify(err, { tone: 'warning', title: 'Not saved · 未儲存' });
    await load();
  };

  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
        <h3 className="text-white font-semibold text-sm">
          {mode === 'operator' ? 'Account approvals 待批核帳戶' : 'My account requests 我的開戶申請'}
        </h3>
        {mode === 'operator' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{visible.length}</span>}
      </div>
      {error && <p className="px-5 py-3 text-red-400 text-sm">{error}</p>}
      <ul className="divide-y divide-slate-700/60">
        {visible.map((r) => {
          const s = STATUS[r.status];
          const busy = busyId === r.id;
          return (
            <li key={r.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-slate-800/60 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-white text-sm truncate">{r.account_name}</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {r.holder_name} · {r.broker}{r.broker_server ? ` · ${r.broker_server}` : ''} · {r.platform} · EA · Follows 跟隨 <span className="font-mono text-slate-300">{r.master_account}</span>
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {timeAgo(r.created_at)}
                  {r.requested_by !== r.for_user_id && ' · Submitted by agent 代理商提交'}
                  {r.review_note && ` · ${r.review_note}`}
                </p>
              </div>
              {mode === 'self' && (
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${s.cls}`}>
                  <s.Icon className="w-3.5 h-3.5" />
                  {s.label}
                </span>
              )}
              {mode === 'self' && r.status === 'pending' && r.requested_by === userId && (
                <button onClick={() => cancel(r)} disabled={busy} className="text-xs text-slate-400 hover:text-red-300 disabled:opacity-50 transition-colors">
                  Cancel 取消
                </button>
              )}
              {mode === 'operator' && (
                <div className="flex items-center gap-2">
                  <button onClick={() => review(r, false)} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:text-red-300 hover:border-red-500/50 text-xs font-medium disabled:opacity-50 transition-colors">
                    <X className="w-3.5 h-3.5" /> Reject 拒絕
                  </button>
                  <button onClick={() => review(r, true)} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve 批准
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
