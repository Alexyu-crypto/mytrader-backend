import { useEffect, useState } from 'react';
import { ArrowDownToLine, FileSpreadsheet, Loader2, Radar, SearchCheck, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { inputCls } from '@/components/ib/IbFields';
import { CURRENCIES, fetchTrackedLots, saveStatement, type RebateBroker, type RebateStatement } from '@/lib/ibRebates';

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export function StatementDialog({ brokers, statement, onClose, onSaved }: { brokers: RebateBroker[]; statement: RebateStatement | null; onClose: () => void; onSaved: () => void }) {
  const first = brokers[0];
  const [brokerId, setBrokerId] = useState(statement?.broker_id ?? first?.id ?? '');
  const [start, setStart] = useState(statement?.period_start ?? '');
  const [end, setEnd] = useState(statement?.period_end ?? '');
  const [currency, setCurrency] = useState(statement?.currency ?? 'USD');
  const [lots, setLots] = useState(str(statement?.lots));
  const [rate, setRate] = useState(str(statement?.rate_per_lot ?? first?.rebate_per_lot));
  const [expected, setExpected] = useState(str(statement?.expected_amount));
  const [expectedTouched, setExpectedTouched] = useState(!!statement);
  const [notes, setNotes] = useState(statement?.notes ?? '');
  const [tracked, setTracked] = useState<{ lots: number; accounts: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (expectedTouched) return;
    const l = num(lots);
    const r = num(rate);
    setExpected(l !== null && r !== null && Number.isFinite(l * r) ? (Math.round(l * r * 100) / 100).toString() : '');
  }, [lots, rate, expectedTouched]);

  const pickBroker = (id: string) => {
    setBrokerId(id);
    setTracked(null);
    const b = brokers.find((x) => x.id === id);
    if (!statement && b?.rebate_per_lot !== null && b?.rebate_per_lot !== undefined) setRate(String(b.rebate_per_lot));
  };

  const checkTracked = async () => {
    if (!brokerId || !start || !end) {
      setError('Choose a broker and period first. 請先選擇經紀商及結算期。');
      return;
    }
    setChecking(true);
    setError('');
    const res = await fetchTrackedLots(brokerId, start, end);
    setChecking(false);
    if (!res) setError('Could not check tracked lots. 未能查詢系統手數。');
    setTracked(res);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = await saveStatement(statement?.id ?? null, {
      broker_id: brokerId,
      period_start: start,
      period_end: end,
      currency,
      lots: num(lots),
      rate_per_lot: num(rate),
      expected_amount: num(expected) ?? NaN,
      notes,
    });
    setBusy(false);
    if (err) setError(err);
    else onSaved();
  };

  const label = 'mb-1.5 block text-xs font-medium text-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <form onSubmit={submit} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <div className="absolute right-4 top-4 flex">
          <IconButton label="Close · 關閉" tone="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300">
          <FileSpreadsheet className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">{statement ? 'Edit statement 修改結算單' : 'New rebate statement 新增回傭結算單'}</h2>
        <p className="mt-1 text-sm text-slate-400">Enter what the broker says we should be paid for the period. 輸入經紀商該期應付的回傭。</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>Broker 經紀商 *</span>
            <select value={brokerId} onChange={(e) => pickBroker(e.target.value)} className={inputCls} disabled={!!statement}>
              {brokers.map((b) => <option key={b.id} value={b.id}>{b.broker_name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Period from 結算期由 *</span>
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setTracked(null); }} className={inputCls} />
          </label>
          <label className="block">
            <span className={label}>Period to 至 *</span>
            <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setTracked(null); }} className={inputCls} />
          </label>
          <label className="block">
            <span className={label}>Lots on statement 結算單手數</span>
            <input type="number" min="0" step="0.01" value={lots} onChange={(e) => setLots(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className={label}>Rate per lot 每手回傭</span>
            <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className={label}>Currency 貨幣</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Expected amount 應收金額 *</span>
            <input type="number" min="0" step="0.01" value={expected} onChange={(e) => { setExpected(e.target.value); setExpectedTouched(true); }} className={inputCls} />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-cyan-400" />
            <p className="flex-1 text-xs text-slate-400">Compare with lots our system tracked for this broker's clients. 與系統記錄的客戶手數比對。</p>
            <IconButton label="Check tracked lots · 查詢" tone="cyan" onClick={checkTracked} disabled={checking}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchCheck className="h-3.5 w-3.5" />}
            </IconButton>
          </div>
          {tracked && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-white"><span className="font-semibold tabular-nums">{tracked.lots.toFixed(2)}</span> lots 手</span>
              <span className="text-slate-500">{tracked.accounts} accounts 個帳戶</span>
              <span className="ml-auto flex">
                <IconButton label="Use these lots · 套用" tone="cyan" onClick={() => setLots(tracked.lots.toFixed(2))}>
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                </IconButton>
              </span>
            </div>
          )}
        </div>

        <label className="mt-4 block">
          <span className={label}>Notes 備註</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className={inputCls} />
        </label>

        {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button type="submit" disabled={busy || !brokerId} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save 儲存
          </button>
        </div>
      </form>
    </div>
  );
}
