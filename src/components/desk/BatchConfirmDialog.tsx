import { useEffect, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { ORDER_TYPE_LABEL, fmtPrice, isBuy, type DeskOrderInput } from '@/lib/desk';

export interface BatchItem {
  ticketId: string;
  order: DeskOrderInput;
}

export function BatchConfirmDialog({
  items,
  skipped,
  onClose,
  onConfirm,
}: {
  items: BatchItem[];
  skipped: { label: string; reason: string }[];
  onClose: () => void;
  onConfirm: (items: BatchItem[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

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
    await onConfirm(items);
    setBusy(false);
    onClose();
  };

  const single = items.length === 1 ? items[0].order : null;
  const tone = single ? (isBuy(single.type) ? 'bg-blue-600 hover:bg-blue-500' : 'bg-red-600 hover:bg-red-500') : 'bg-cyan-600 hover:bg-cyan-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-bold text-white">{single ? 'Confirm order 確認落單' : `Send ${items.length} orders 一併下單`}</h2>
        <p className="mt-1 text-sm text-slate-400">Market orders, followers copy automatically. 市價成交，跟單帳戶自動複製。</p>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Side</th>
                <th className="px-3 py-2 text-right font-medium">Lots</th>
                <th className="px-3 py-2 text-right font-medium">SL / TP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {items.map(({ ticketId, order: o }) => (
                <tr key={ticketId}>
                  <td className="max-w-[120px] truncate px-3 py-2 text-slate-200">{o.account}</td>
                  <td className="px-3 py-2 font-medium text-white">{o.symbol}</td>
                  <td className={`px-3 py-2 text-xs font-bold ${isBuy(o.type) ? 'text-blue-400' : 'text-red-400'}`}>{ORDER_TYPE_LABEL[o.type]}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{o.lots}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                    {fmtPrice(o.sl, 5).replace(/0+$/, '').replace(/\.$/, '')} / {fmtPrice(o.tp, 5).replace(/0+$/, '').replace(/\.$/, '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {skipped.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <p className="font-semibold">Skipped 不會發送 ({skipped.length})</p>
            <ul className="mt-1 space-y-0.5">
              {skipped.map((s, i) => (
                <li key={i}>
                  {s.label} — {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button
            onClick={send}
            disabled={busy || items.length === 0}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${tone}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {single ? 'Send 發送' : `Send all ${items.length} 全部發送`}
          </button>
        </div>
      </div>
    </div>
  );
}
