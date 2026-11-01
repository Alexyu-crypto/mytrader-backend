import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCw, X } from 'lucide-react';
import { ORDER_TYPE_LABEL, isBuy } from '@/lib/desk';
import type { BatchItem } from '@/components/desk/BatchConfirmDialog';

export interface SendFailure {
  item: BatchItem;
  reason: string;
  retryable: boolean;
}

export function SendFailedDialog({ failures, onClose, onRetry }: { failures: SendFailure[]; onClose: () => void; onRetry: (items: BatchItem[]) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const retryable = failures.filter((f) => f.retryable).map((f) => f.item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const retry = async () => {
    setBusy(true);
    onClose();
    await onRetry(retryable);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          {failures.length === 1 ? 'Order not filled 落單失敗' : `${failures.length} orders not filled 落單失敗`}
        </h2>
        <p className="mt-1 text-sm text-slate-400">Retry now at the current market price, or cancel. 以現價重試，定係取消？</p>

        <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {failures.map(({ item: { ticketId, order: o }, reason, retryable: canRetry }) => (
            <li key={ticketId} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className={`text-xs font-bold ${isBuy(o.type) ? 'text-blue-400' : 'text-red-400'}`}>{ORDER_TYPE_LABEL[o.type]}</span>
                <span className="font-mono text-slate-200">{o.lots}</span>
                <span className="font-medium text-white">{o.symbol}</span>
                <span className="ml-auto max-w-[45%] truncate text-xs text-slate-400">{o.account}</span>
              </div>
              <p className={`mt-1 text-xs ${canRetry ? 'text-red-300' : 'text-amber-300'}`}>{reason}</p>
            </li>
          ))}
        </ul>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button
            onClick={retry}
            disabled={busy || retryable.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            Retry {retryable.length > 1 ? `${retryable.length} ` : ''}重試
          </button>
        </div>
      </div>
    </div>
  );
}
