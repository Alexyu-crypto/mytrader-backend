import { useEffect, useState } from 'react';
import { Loader2, X, XCircle } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { closeDeskSymbol, isBuy, type CloseSide } from '@/lib/desk';
import { formatSigned } from '@/lib/format';
import type { LivePosition } from '@/lib/types';

export interface CloseGroup {
  account: string;
  symbol: string;
  positions: LivePosition[];
}

const SIDES: { value: CloseSide; label: string }[] = [
  { value: 'ALL', label: 'All 全部' },
  { value: 'BUY', label: 'Buy only 只平買單' },
  { value: 'SELL', label: 'Sell only 只平賣單' },
];

const matches = (p: LivePosition, side: CloseSide) => side === 'ALL' || (side === 'BUY' ? isBuy(p.order_type) : !isBuy(p.order_type));
const pl = (list: LivePosition[]) => list.reduce((s, p) => s + (p.profit || 0) + (p.swap || 0), 0);

export function ClosePositionsDialog({ groups, onClose, onQueued }: { groups: CloseGroup[]; onClose: () => void; onQueued: (tickets: number[]) => void }) {
  const [side, setSide] = useState<CloseSide>('ALL');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const rows = groups
    .map((g) => ({ ...g, picked: g.positions.filter((p) => matches(p, side)) }))
    .filter((g) => g.picked.length > 0);
  const total = rows.reduce((s, r) => s + r.picked.length, 0);
  const totalPl = rows.reduce((s, r) => s + pl(r.picked), 0);

  const confirm = async () => {
    setBusy(true);
    setErrors([]);
    const results = await Promise.all(rows.map(async (r) => ({ r, n: await closeDeskSymbol(r.account, r.symbol, side) })));
    setBusy(false);
    const ok = results.filter((x) => x.n !== null);
    ok.forEach(({ r, n }) =>
      logActivity('close_all_positions', 'positions', r.account, { symbol: r.symbol, side, queued: n, source: 'trader_manager' }),
    );
    onQueued(ok.flatMap(({ r }) => r.picked.map((p) => p.ticket)));
    const failed = results.filter((x) => x.n === null);
    if (failed.length === 0) onClose();
    else setErrors(failed.map(({ r }) => `${r.account} ${r.symbol}`));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <XCircle className="h-5 w-5 text-red-400" />
          {groups.length === 1 ? 'Close positions 平倉' : 'Close all windows 一併平倉'}
        </h2>
        <p className="mt-1 text-sm text-slate-400">Market close. Followers close their copies automatically. 市價平倉，跟單帳戶會自動跟住平。</p>

        <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-700 text-xs font-semibold">
          {SIDES.map((s) => (
            <button
              key={s.value}
              onClick={() => setSide(s.value)}
              disabled={busy}
              className={`py-2 transition-colors ${side === s.value ? (s.value === 'BUY' ? 'bg-blue-500/25 text-blue-200' : s.value === 'SELL' ? 'bg-red-500/25 text-red-200' : 'bg-slate-700 text-white') : 'text-slate-400 hover:text-white'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing to close for this choice. 呢個選擇冇單可平。</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Symbol</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium">Lots</th>
                  <th className="px-3 py-2 text-right font-medium">P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {rows.map((r) => {
                  const v = pl(r.picked);
                  return (
                    <tr key={`${r.account}-${r.symbol}`}>
                      <td className="max-w-[140px] truncate px-3 py-2 text-slate-200">{r.account}</td>
                      <td className="px-3 py-2 font-medium text-white">{r.symbol}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{r.picked.length}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300">{Number(r.picked.reduce((s, p) => s + p.lots, 0).toFixed(2))}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSigned(v)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {errors.length > 0 && (
          <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            Could not send close for 未能發送平倉: {errors.join(', ')}. Please try again. 請再試。
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button
            onClick={confirm}
            disabled={busy || total === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Close {total} 平倉 <span className="font-mono text-xs opacity-80">({formatSigned(totalPl)})</span>
          </button>
        </div>
      </div>
    </div>
  );
}
