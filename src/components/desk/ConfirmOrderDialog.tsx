import { useEffect, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { ORDER_TYPE_LABEL, fmtPrice, isBuy, placeDeskOrder, type DeskOrderInput } from '@/lib/desk';

export function ConfirmOrderDialog({ order, digits, onClose, onSent }: { order: DeskOrderInput; digits: number; onClose: () => void; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const buy = isBuy(order.type);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const send = async () => {
    setBusy(true);
    setError('');
    const { error: err } = await placeDeskOrder(order);
    setBusy(false);
    if (err) {
      setError(`Order not sent 未能落單: ${err}`);
      return;
    }
    logActivity('desk_order', 'positions', order.account, { symbol: order.symbol, type: order.type, lots: order.lots, price: order.price || null, sl: order.sl || null, tp: order.tp || null });
    onSent();
    onClose();
  };

  const rows: [string, string][] = [
    ['Account 帳戶', order.account],
    ['Symbol 產品', order.symbol],
    ['Volume 手數', String(order.lots)],
    ...(order.price ? ([['Price 價格', fmtPrice(order.price, digits)]] as [string, string][]) : []),
    ['Stop Loss 止損', fmtPrice(order.sl, digits)],
    ['Take Profit 止賺', fmtPrice(order.tp, digits)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${buy ? 'bg-blue-500/15 text-blue-300' : 'bg-red-500/15 text-red-300'}`}>{ORDER_TYPE_LABEL[order.type]}</span>
        <h2 className="mt-3 text-lg font-bold text-white">Confirm order 確認落單</h2>
        <dl className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-slate-500">{k}</dt>
              <dd className="truncate font-mono font-medium text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">Followers in this group will copy it automatically. 跟單帳戶會自動複製。</p>
        {error && <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button
            onClick={send}
            disabled={busy}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${buy ? 'bg-blue-600 hover:bg-blue-500' : 'bg-red-600 hover:bg-red-500'}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send 發送
          </button>
        </div>
      </div>
    </div>
  );
}
