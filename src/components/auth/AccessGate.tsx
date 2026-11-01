import { Loader2, LogOut, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { Logo } from '@/components/Logo';
import type { AuthStatus } from '@/hooks/useAuth';

export function AccessGate({
  status,
  email,
  onRetry,
  onSignOut,
}: {
  status: Exclude<AuthStatus, 'active' | 'signed_out'>;
  email: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  if (status === 'loading' || status === 'checking') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0A0A0A]">
        <Logo className="h-12 w-12 animate-pulse" />
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
      </div>
    );
  }

  const noAccess = status === 'no_access';
  const Icon = noAccess ? ShieldAlert : WifiOff;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0D0D0D] p-8 text-center animate-pop-in">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl ${noAccess ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-bold">{noAccess ? 'Waiting for approval' : "Couldn't verify access"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {noAccess
            ? 'This account is signed in but does not have dashboard access yet. Please ask the owner to approve it. 此帳戶尚未獲批准，請聯絡管理員。'
            : 'Please check your connection and try again. 無法確認權限，請檢查網絡後再試。'}
        </p>
        {email && <p className="mt-4 rounded-lg bg-white/[0.03] px-3 py-2 font-mono text-xs text-slate-400">{email}</p>}
        <div className="mt-6 flex justify-center gap-2">
          {!noAccess && (
            <button onClick={onRetry} className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400">
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          )}
          <button onClick={onSignOut} className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
