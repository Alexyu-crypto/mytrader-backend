import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activityLog';
import type { LivePosition } from '@/lib/types';

export function CloseAllDialog({
  account,
  positions,
  followerTrades,
  onClose,
  onQueued,
}: {
  account: string;
  positions: LivePosition[];
  followerTrades: number;
  onClose: () => void;
  onQueued: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('request_close_all', { p_account: account });
    setBusy(false);
    if (err || typeof data !== 'number') {
      setError('Could not send the close request. Please try again. 無法發送平倉指令，請再試。');
      return;
    }
    logActivity('close_all_positions', 'positions', account, { orders: positions.length, queued: data });
    onQueued();
    onClose();
  };

  const profit = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
  const lots = positions.reduce((sum, p) => sum + (p.lots || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">Close all orders? 全部平倉？</h2>
        <p className="mt-1 text-sm text-slate-400">Every open order on this account will be closed at market price. 此帳戶所有持倉會以市價平倉。</p>

        <dl className="mt-5 space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          {[
            ['Account', account],
            ['Open orders 持倉', String(positions.length)],
            ['Total lots 總手數', lots.toFixed(2)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-slate-500">{k}</dt>
              <dd className="truncate font-medium text-slate-200">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Floating P&L</dt>
            <dd className={`font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {profit >= 0 ? '+' : ''}
              {profit.toFixed(2)}
            </dd>
          </div>
        </dl>

        {followerTrades > 0 && (
          <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Followers will also close their {followerTrades} copied trade{followerTrades === 1 ? '' : 's'}. 跟單帳戶的 {followerTrades} 張複製單亦會一併平倉。
          </p>
        )}

        {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Close all 全部平倉
          </button>
        </div>
      </div>
    </div>
  );
}
