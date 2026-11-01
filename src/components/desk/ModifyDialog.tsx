import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { guessDigits, modifyDeskPosition } from '@/lib/desk';
import type { LivePosition } from '@/lib/types';

const inputCls = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none';

export function ModifyDialog({ position, onClose, onQueued }: { position: LivePosition; onClose: () => void; onQueued: (ticket: number) => void }) {
  const digits = guessDigits(position.open_price);
  const [sl, setSl] = useState(position.sl ? position.sl.toFixed(digits) : '');
  const [tp, setTp] = useState(position.tp ? position.tp.toFixed(digits) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const parse = (s: string) => {
    const v = parseFloat(s);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };

  const save = async () => {
    setBusy(true);
    setError('');
    const ok = await modifyDeskPosition(position.account_name, position.ticket, parse(sl), parse(tp));
    setBusy(false);
    if (!ok) {
      setError('Could not send the change. Please try again. 無法發送修改，請再試。');
      return;
    }
    logActivity('desk_modify', 'positions', position.account_name, { ticket: position.ticket, sl: parse(sl) || null, tp: parse(tp) || null });
    onQueued(position.ticket);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-bold text-white">Modify SL / TP 修改止損止賺</h2>
        <p className="mt-1 text-sm text-slate-400">
          #{position.ticket} · {position.order_type} {position.lots} {position.symbol} @ {position.open_price.toFixed(digits)}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Stop Loss 止損</span>
            <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="0 = none" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Take Profit 止賺</span>
            <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="0 = none" className={inputCls} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Leave empty to remove. 留空即取消。</p>
        {error && <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button onClick={save} disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save 儲存
          </button>
        </div>
      </div>
    </div>
  );
}
