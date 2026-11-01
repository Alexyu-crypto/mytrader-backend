import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activityLog';
import { Logo } from '@/components/Logo';

interface Props {
  ready: boolean;
  hasSession: boolean;
  linkError: string | null;
  onDone: () => void;
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-black/40 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20';

export function ResetPassword({ ready, hasSession, linkError, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('Password must be at least 6 characters · 密碼最少 6 個字元');
    if (password !== confirm) return setError('The two passwords do not match · 兩次輸入的密碼不一致');
    setBusy(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        const m = err.message.toLowerCase();
        setError(m.includes('different') || m.includes('same')
          ? 'Choose a password different from your old one · 新密碼不可與舊密碼相同'
          : 'Could not update your password. Please try again · 未能更新密碼，請再試');
      } else {
        setSaved(true);
        logActivity('password_changed', 'auth');
      }
    } catch {
      setError('Network error, please try again · 網絡錯誤，請再試');
    } finally {
      setBusy(false);
    }
  };

  const invalid = !!linkError || (ready && !hasSession);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080808] px-4">
      <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-cyan-500/10 to-transparent pointer-events-none" />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0D0D0D] p-8 shadow-2xl shadow-cyan-500/10 animate-pop-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="mb-4 h-12 w-12" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {saved ? 'Password updated' : invalid ? 'Link expired' : 'Set a new password'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {saved ? '密碼已更新' : invalid ? '重設連結已失效' : '設定新密碼'}
          </p>
        </div>

        {!ready && !linkError ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          </div>
        ) : saved ? (
          <div className="space-y-5 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <p className="text-sm leading-relaxed text-slate-300">
              You are signed in with your new password.
              <br />
              您已用新密碼登入。
            </p>
            <button onClick={onDone} className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black transition-all hover:bg-cyan-400">
              Continue · 繼續
            </button>
          </div>
        ) : invalid ? (
          <div className="space-y-5 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-400" />
            <p className="text-sm leading-relaxed text-slate-300">
              Reset links work once and expire after a while. Request a new one from the sign-in window.
              <br />
              重設連結只可用一次並會過期，請在登入視窗再申請一次。
            </p>
            {linkError && <p className="text-xs text-slate-500">{linkError}</p>}
            <button onClick={onDone} className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black transition-all hover:bg-cyan-400">
              Back to sign in · 返回登入
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {[
              ['New password 新密碼', password, setPassword] as const,
              ['Confirm password 確認密碼', confirm, setConfirm] as const,
            ].map(([label, value, setValue]) => (
              <label key={label} className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            ))}

            {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black transition-all hover:bg-cyan-400 hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save new password · 儲存新密碼
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
