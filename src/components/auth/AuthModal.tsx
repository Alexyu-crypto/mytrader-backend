import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, MailCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activityLog';
import { Logo } from '@/components/Logo';
import { BrandMark } from '@/components/agents/BrandMark';
import type { PublicBrand } from '@/lib/agents';

export type AuthMode = 'signin' | 'signup';

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Incorrect email or password · 電郵或密碼錯誤';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many sign-in attempts. Please wait a few minutes and try again · 登入嘗試太頻密，請稍等幾分鐘再試';
  if (m.includes('banned')) return 'This account has been suspended. Please contact the administrator · 此帳戶已被停用，請聯絡管理員';
  if (m.includes('already registered') || m.includes('already exists')) return 'We could not complete the sign up with that email. If you already have an account, please sign in · 未能以此電郵完成註冊，如已有帳戶請直接登入';
  if (m.includes('password')) return 'Password must be at least 6 characters · 密碼最少 6 個字元';
  if (m.includes('email')) return 'Please enter a valid email · 請輸入有效電郵';
  if (m.includes('fetch') || m.includes('network')) return 'Network error, please try again · 網絡錯誤，請再試';
  return `Something went wrong. Please try again · 發生錯誤，請再試 (${message})`;
}

export function AuthModal({ mode, onModeChange, onClose, brand }: { mode: AuthMode; onModeChange: (m: AuthMode) => void; onClose: () => void; brand?: PublicBrand }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setError('');
    setForgot(false);
  }, [mode]);

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      });
      if (err) {
        const m = err.message.toLowerCase();
        setError(m.includes('rate') || m.includes('seconds')
          ? 'Too many requests. Please wait a few minutes and try again · 請求太頻密，請稍後再試'
          : friendlyError(err.message));
      } else setResetSent(true);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'network'));
    } finally {
      setBusy(false);
    }
  };

  const backToSignIn = () => {
    setForgot(false);
    setResetSent(false);
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError(friendlyError('password'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data, error: err } =
        mode === 'signin'
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
          : await supabase.auth.signUp({ email: email.trim(), password, options: brand ? { data: { agent_slug: brand.slug } } : undefined });
      if (err) {
        console.error('auth request failed', err);
        setError(friendlyError(err.message));
      } else if (data.session) {
        logActivity(mode === 'signin' ? 'sign_in' : 'sign_up', 'auth');
        const { error: claimErr } = await supabase.rpc('claim_login');
        if (claimErr) console.error('claim_login failed', claimErr);
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'network'));
    } finally {
      setBusy(false);
    }
  };

  const isSignIn = mode === 'signin';
  const modes: AuthMode[] = brand && !brand.signup_open ? ['signin'] : ['signin', 'signup'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0D0D0D] p-8 shadow-2xl shadow-cyan-500/10 animate-pop-in">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>

        {forgot ? (
          <ForgotView
            email={email}
            onEmailChange={setEmail}
            busy={busy}
            error={error}
            sent={resetSent}
            onSubmit={sendReset}
            onBack={backToSignIn}
          />
        ) : (
        <>
        <div className="mb-6 flex flex-col items-center text-center">
          {brand ? <BrandMark brand={brand} className="mb-4 h-14 w-14" /> : <Logo className="mb-4 h-12 w-12" />}
          <h2 className="text-2xl font-bold tracking-tight text-white">{isSignIn ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {brand ? `${brand.brand_name} · ${isSignIn ? '客戶登入' : '客戶註冊'}` : isSignIn ? '登入以管理您的跟單系統' : '建立帳戶以管理您的跟單系統'}
          </p>
        </div>

        <div className={`mb-6 grid rounded-lg border border-white/5 bg-white/[0.02] p-1 ${modes.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`rounded-md py-2 text-sm font-medium transition-all ${mode === m ? 'bg-cyan-500 text-black shadow' : 'text-slate-400 hover:text-white'}`}
            >
              {m === 'signin' ? 'Sign In 登入' : 'Sign Up 註冊'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Email 電郵</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-white/10 bg-black/40 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-400">
              Password 密碼
              {isSignIn && (
                <button
                  type="button"
                  onClick={() => {
                    setForgot(true);
                    setError('');
                  }}
                  className="text-cyan-400 transition-colors hover:text-cyan-300"
                >
                  Forgot password? 忘記密碼
                </button>
              )}
            </span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/10 bg-black/40 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
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

          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black transition-all hover:bg-cyan-400 hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignIn ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {!isSignIn && brand && (
          <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
            Your account will be registered under {brand.brand_name}.
            <br />
            您的帳戶將登記於 {brand.brand_name} 旗下。
          </p>
        )}
        {!isSignIn && !brand && (
          <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
            The first account created becomes the owner. New accounts can view trading signals straight away.
            <br />
            第一個註冊的帳戶會成為管理員，新帳戶註冊後即可查看交易信號。
          </p>
        )}
        </>
        )}
      </div>
    </div>
  );
}

function ForgotView({ email, onEmailChange, busy, error, sent, onSubmit, onBack }: {
  email: string;
  onEmailChange: (v: string) => void;
  busy: boolean;
  error: string;
  sent: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
          {sent ? <MailCheck className="h-6 w-6 text-cyan-400" /> : <KeyRound className="h-6 w-6 text-cyan-400" />}
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">{sent ? 'Check your email' : 'Reset your password'}</h2>
        <p className="mt-1 text-sm text-slate-400">{sent ? '請查看您的電郵' : '重設密碼'}</p>
      </div>

      {sent ? (
        <div className="space-y-5">
          <p className="text-center text-sm leading-relaxed text-slate-300">
            If <span className="font-medium text-white">{email.trim()}</span> has an account, a reset link is on its way. Open it on this device to set a new password.
            <br />
            <span className="text-slate-400">如此電郵已註冊，重設連結已發出。請打開連結設定新密碼；如未收到，請查看垃圾郵件。</span>
          </p>
          <button onClick={onBack} className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5">
            <ArrowLeft className="h-4 w-4" /> Back to sign in · 返回登入
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-400">
            Enter the email you sign in with and we will send you a link to choose a new password.
            <br />
            輸入登入電郵，我們會發送重設密碼連結。
          </p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Email 電郵</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-white/10 bg-black/40 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </label>

          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black transition-all hover:bg-cyan-400 hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link · 發送重設連結
          </button>
          <button type="button" onClick={onBack} className="flex w-full items-center justify-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to sign in · 返回登入
          </button>
        </form>
      )}
    </div>
  );
}
