import { useEffect, useState } from 'react';
import { Landmark, Loader2, X } from 'lucide-react';
import { inputCls } from '@/components/ib/IbFields';
import { IconButton } from '@/components/IconButton';
import { money, recordReceipt, type RebateStatement } from '@/lib/ibRebates';

export function ReceiptDialog({ statement, brokerName, onClose, onSaved }: { statement: RebateStatement; brokerName: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(statement.received_amount === null ? String(statement.expected_amount) : String(statement.received_amount));
  const [date, setDate] = useState(statement.received_on ?? new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState(statement.reference ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const parsed = amount.trim() === '' ? NaN : Number(amount);
  const diff = Number.isFinite(parsed) ? parsed - Number(statement.expected_amount) : null;

  const save = async (clear: boolean) => {
    setBusy(true);
    setError('');
    const err = await recordReceipt(statement.id, clear ? { received_amount: null, received_on: null, reference: '' } : { received_amount: parsed, received_on: date || null, reference });
    setBusy(false);
    if (err) setError(err);
    else onSaved();
  };

  const label = 'mb-1.5 block text-xs font-medium text-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <div className="absolute right-4 top-4 flex">
          <IconButton label="Close · 關閉" tone="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
          <Landmark className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">Record payment received 登記到帳</h2>
        <p className="mt-1 text-sm text-slate-400">{brokerName} · {statement.period_start} – {statement.period_end}</p>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-950/70 px-3 py-2.5 text-sm">
          <span className="text-slate-400">Expected 應收</span>
          <span className="font-semibold tabular-nums text-white">{money(statement.expected_amount, statement.currency)}</span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Amount received 實收金額 *</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus />
          </label>
          <label className="block">
            <span className={label}>Received on 到帳日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Bank / payment reference 銀行或付款編號</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className={inputCls} />
          </label>
        </div>

        {diff !== null && (
          <p className={`mt-3 text-sm ${Math.abs(diff) < 0.01 ? 'text-emerald-300' : diff < 0 ? 'text-amber-300' : 'text-orange-300'}`}>
            {Math.abs(diff) < 0.01 ? 'Matches the expected amount 與應收金額相符' : `${diff < 0 ? 'Short 少收' : 'Over 多收'} ${money(Math.abs(diff), statement.currency)}`}
          </p>
        )}

        {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex gap-2">
          {statement.received_amount !== null && (
            <button type="button" onClick={() => save(true)} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white">
              Undo receipt 取消到帳
            </button>
          )}
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button type="submit" disabled={busy || diff === null} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm 確認
          </button>
        </div>
      </form>
    </div>
  );
}
