import { useEffect, useState } from 'react';
import { Check, Loader2, X, XCircle } from 'lucide-react';
import { PermissionToggles } from '@/components/agents/PermissionToggles';
import { approveApplication, checkSlugAvailable, rejectApplication, SLUG_PATTERN, type AgentApplication, type AgentPermissions } from '@/lib/agents';

export function ApplicationReviewDialog({ app, mode, onClose, onDone }: { app: AgentApplication; mode: 'approve' | 'reject'; onClose: () => void; onDone: () => void }) {
  const [slug, setSlug] = useState(app.desired_slug);
  const [perms, setPerms] = useState<AgentPermissions>({ clientSignup: true, viewTrades: true, viewActivity: false, manageClients: true, installTerminals: false });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (mode !== 'approve' || !SLUG_PATTERN.test(slug)) return setAvailable(null);
    let cancelled = false;
    const t = setTimeout(() => checkSlugAvailable(slug).then((ok) => !cancelled && setAvailable(ok)), 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [slug, mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = mode === 'approve' ? await approveApplication(app.id, slug, perms, note.trim()) : await rejectApplication(app.id, note.trim());
    setBusy(false);
    if (err) return setError(err);
    onDone();
    onClose();
  };

  const approving = mode === 'approve';
  const slugOk = SLUG_PATTERN.test(slug) && available !== false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <form onSubmit={submit} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-bold text-white">{approving ? 'Approve agent 批准代理商' : 'Reject application 拒絕申請'}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {app.brand_name} · {app.email}
        </p>

        {approving && (
          <>
            <label className="mt-6 block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Login link name 登入連結名稱</span>
              <div className="flex items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950 focus-within:border-teal-400/60">
                <span className="pl-3 text-sm text-slate-500">/a/</span>
                <input
                  value={slug}
                  maxLength={30}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))}
                  className="w-full bg-transparent px-1 py-2.5 text-sm text-white outline-none"
                />
              </div>
              <span className={`mt-1.5 block text-xs ${!SLUG_PATTERN.test(slug) || available === false ? 'text-red-300' : available ? 'text-emerald-300' : 'text-slate-500'}`}>
                {!SLUG_PATTERN.test(slug) ? '3-30 lowercase letters, numbers or dashes 需 3-30 個小寫字母、數字或「-」' : available === false ? 'Already taken 已被使用' : available ? 'Available 可以使用' : 'Checking 檢查中…'}
              </span>
            </label>
            <div className="mt-5">
              <span className="mb-2 block text-xs font-medium text-slate-400">Permissions 權限</span>
              <PermissionToggles value={perms} onChange={setPerms} disabled={busy} />
            </div>
          </>
        )}

        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">{approving ? 'Note (optional) 備註' : 'Reason shown to applicant 拒絕原因（申請人可見）'}</span>
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-400/60" />
        </label>

        {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800">
            Cancel 取消
          </button>
          <button
            type="submit"
            disabled={busy || (approving && !slugOk)}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${approving ? 'bg-teal-400 text-black hover:bg-teal-300' : 'bg-red-500 text-white hover:bg-red-400'}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : approving ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {approving ? 'Approve 批准' : 'Reject 拒絕'}
          </button>
        </div>
      </form>
    </div>
  );
}
