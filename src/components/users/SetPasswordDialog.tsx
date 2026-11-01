import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Shuffle, X } from 'lucide-react';
import { callAdminUsers, type Member } from '@/lib/members';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function randomPassword(len = 12) {
  const bytes = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
}

export function SetPasswordDialog({ member, isSelf, onClose }: { member: Member; isSelf: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [signOut, setSignOut] = useState(!isSelf);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = await callAdminUsers({ action: 'set_password', user_id: member.user_id, password, sign_out: signOut && !isSelf });
    setBusy(false);
    if (err) setError(err);
    else setDone(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${member.email}\n${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('copy failed', err);
    }
  };

  const input =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
          <KeyRound className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">Set new password 設定新密碼</h2>
        <p className="mt-1 truncate text-sm text-slate-400">{member.email}</p>

        {done ? (
          <div className="mt-5 space-y-4 animate-fade-in">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Check className="h-4 w-4" /> Password changed 密碼已更改</p>
              <p className="mt-3 text-xs text-slate-400">New password 新密碼 (shown only now 只顯示這一次)</p>
              <p className="mt-1 select-all break-all font-mono text-lg text-white">{password}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={copy} className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied 已複製' : 'Copy 複製'}
              </button>
              <button type="button" onClick={onClose} className="rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-cyan-400">
                Done 完成
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">New password 新密碼 (6-72)</span>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={show ? 'text' : 'password'}
                      required
                      minLength={6}
                      maxLength={72}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className={`${input} pr-10 font-mono`}
                    />
                    <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label={show ? 'Hide password' : 'Show password'}>
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(randomPassword());
                      setShow(true);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    <Shuffle className="h-4 w-4" /> Generate 產生
                  </button>
                </div>
              </label>
              {!isSelf && (
                <label className="flex items-start gap-2.5 text-sm text-slate-300">
                  <input type="checkbox" checked={signOut} onChange={(e) => setSignOut(e.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-500" />
                  <span>Sign this user out on all devices 同時登出此用戶所有裝置</span>
                </label>
              )}
              <p className="text-xs text-slate-500">
                Existing passwords are stored scrambled and can never be viewed, not even by admins. 現有密碼經加密保存，任何人（包括管理員）都無法查看。
              </p>
            </div>

            {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
                Cancel 取消
              </button>
              <button type="submit" disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save 儲存
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
