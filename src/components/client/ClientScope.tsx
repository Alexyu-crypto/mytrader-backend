import type { ReactNode } from 'react';
import { Link2, Loader2, Radio, User } from 'lucide-react';
import type { LinkedAccounts } from '@/lib/clientAccounts';

export function ClientScopeGate({
  linked,
  loading,
  error,
  children,
}: {
  linked: LinkedAccounts | null;
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>;
  if (!linked || linked.own.length + linked.signals.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-700 bg-slate-800/40 px-6 py-12 text-center animate-fade-in">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
          <Link2 className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">No linked accounts yet 尚未連結帳戶</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Apply to copy a signal. Once our team links your trading account, your trades and the signals you follow will show up here.
        </p>
        <p className="mt-1 text-sm text-slate-500">申請跟單後，管理員連結您的交易帳戶，您的交易及已參加的信號便會在此顯示。</p>
        <a href="#/signals" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-cyan-400">
          <Radio className="h-4 w-4" />
          Browse signals 瀏覽信號
        </a>
      </div>
    );
  }
  return <>{children}</>;
}

export function ClientScopeChips({ linked }: { linked: LinkedAccounts }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {linked.own.map((n) => (
        <span key={`o-${n}`} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-200">
          <User className="h-3 w-3" />
          {n}
        </span>
      ))}
      {linked.signals.map((n) => (
        <span key={`s-${n}`} className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 font-medium text-cyan-200">
          <Radio className="h-3 w-3" />
          {n}
        </span>
      ))}
    </div>
  );
}
