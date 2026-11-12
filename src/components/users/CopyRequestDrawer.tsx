import { useEffect, useState } from 'react';
import { Check, Clock, Copy, Loader2, Mail, Phone, RotateCcw, Save, Trash2, X, XCircle } from 'lucide-react';
import { STATUS_META, agentHandleCopyRequest, deleteCopyRequest, updateCopyRequest, type CopyRequest, type CopyStatus } from '@/lib/copyRequests';
import { formatCurrency, formatTime, timeAgo } from '@/lib/format';
import { IconButton } from '@/components/IconButton';

const ACTIONS: { status: CopyStatus; label: string; icon: typeof Check; tone: string }[] = [
  { status: 'contacted', label: 'Mark contacted 已聯絡', icon: Phone, tone: 'border-sky-500/30 text-sky-300 hover:bg-sky-500/10' },
  { status: 'approved', label: 'Approve 批准', icon: Check, tone: 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10' },
  { status: 'rejected', label: 'Reject 拒絕', icon: XCircle, tone: 'border-red-500/30 text-red-300 hover:bg-red-500/10' },
  { status: 'pending', label: 'Back to new 重設為新', icon: RotateCcw, tone: 'border-slate-600 text-slate-300 hover:bg-slate-800' },
];

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={done ? 'Copied · 已複製' : 'Copy · 複製'}
      tone="ghost"
      onClick={() =>
        navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        })
      }
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </IconButton>
  );
}

export function CopyRequestDrawer({
  request,
  handlerEmail,
  onClose,
  onChanged,
  asAgent = false,
}: {
  request: CopyRequest;
  handlerEmail: string | null;
  onClose: () => void;
  onChanged: () => void;
  asAgent?: boolean;
}) {
  const [note, setNote] = useState(request.admin_note);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = STATUS_META[request.status];
  const noteDirty = note !== request.admin_note;

  useEffect(() => setNote(request.admin_note), [request.id, request.admin_note]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async (key: string, action: () => Promise<string | null>, closeAfter = false) => {
    setBusy(key);
    setError('');
    const err = await action();
    setBusy(null);
    if (err) return setError(err);
    onChanged();
    if (closeAfter) onClose();
  };

  const setStatus = (status: CopyStatus) =>
    run(status, () => (asAgent ? agentHandleCopyRequest(request.id, status, note) : updateCopyRequest(request.id, noteDirty ? { status, admin_note: note } : { status })));
  const saveNote = () => run('note', () => (asAgent ? agentHandleCopyRequest(request.id, request.status, note) : updateCopyRequest(request.id, { admin_note: note })));

  const details: [string, string][] = [
    ['Platform 平台', request.platform],
    ['Broker 經紀商', request.broker || '—'],
    ['Account no. 帳戶號碼', request.account_number || '—'],
    ['Capital 資金', request.capital === null ? '—' : formatCurrency(request.capital)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 shadow-2xl animate-fade-in">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-800 bg-slate-900/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">Copy application 跟單申請</p>
            <p className="truncate text-lg font-semibold text-white">{request.contact_name}</p>
            <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${meta.tone}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 p-6">
          <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <p className="text-xs text-slate-500">Wants to copy 想跟單</p>
            <p className="mt-0.5 font-semibold text-cyan-200">{request.master_account}</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact 聯絡</h3>
            <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
              <Phone className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{request.contact}</span>
              <CopyButton value={request.contact} />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
              <Mail className="h-4 w-4 shrink-0 text-slate-500" />
              <a href={`mailto:${request.email}`} className="min-w-0 flex-1 truncate text-sm text-cyan-300 hover:underline">
                {request.email}
              </a>
              <CopyButton value={request.email} />
            </div>
          </section>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
            {details.map(([label, value]) => (
              <div key={label} className="bg-slate-900 px-4 py-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-0.5 truncate text-sm font-medium text-white">{value}</dd>
              </div>
            ))}
          </dl>

          {request.message && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Password 密碼</h3>
              <p className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm leading-relaxed text-slate-300">{request.message}</p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Update status 更新狀態</h3>
            <div className="grid grid-cols-2 gap-2">
              {ACTIONS.filter((a) => a.status !== request.status).map(({ status, label, icon: Icon, tone }) => (
                <button
                  key={status}
                  onClick={() => setStatus(status)}
                  disabled={!!busy}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${tone}`}
                >
                  {busy === status ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Internal notes 內部備註</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Call summary, next steps... 通話紀錄、下一步..."
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] text-slate-600">{asAgent ? 'Only you and head office can see this. 只有您及總公司可見。' : 'Only admins can see this. 只有管理員可見。'}</p>
              <button
                onClick={saveNote}
                disabled={!noteDirty || !!busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === 'note' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save note 儲存
              </button>
            </div>
          </section>

          <section className="space-y-2 text-xs text-slate-500">
            <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Submitted {formatTime(request.created_at)} ({timeAgo(request.created_at)})</p>
            <p className="flex items-center gap-2"><RotateCcw className="h-3.5 w-3.5" /> Last updated {timeAgo(request.updated_at)}{handlerEmail ? ` by ${handlerEmail}` : ''}</p>
          </section>

          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>

        {!asAgent && (
        <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-900/95 px-6 py-3 backdrop-blur">
          {confirmDelete ? (
            <>
              <span className="mr-auto text-xs text-red-300">Delete permanently? 永久刪除？</span>
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">Keep 保留</button>
              <button
                onClick={() => run('delete', () => deleteCopyRequest(request.id), true)}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400"
              >
                {busy === 'delete' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete 刪除
              </button>
            </>
          ) : (
            <IconButton label="Delete application · 刪除申請" tone="red" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </footer>
        )}
      </aside>
    </div>
  );
}
