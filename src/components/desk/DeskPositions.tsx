import { useEffect, useState } from 'react';
import { Loader2, Pencil, X, XCircle } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { ModifyDialog } from '@/components/desk/ModifyDialog';
import { CloseAllDialog } from '@/components/positions/CloseAllDialog';
import { logActivity } from '@/lib/activityLog';
import { closeDeskPosition, guessDigits, isBuy } from '@/lib/desk';
import { formatSigned } from '@/lib/format';
import type { LivePosition } from '@/lib/types';

const CLOSE_WAIT_MS = 20000;

export function DeskPositions({ account, positions, followerTrades, canTrade }: { account: string; positions: LivePosition[]; followerTrades: number; canTrade: boolean }) {
  const [closing, setClosing] = useState<Set<number>>(new Set());
  const [modifying, setModifying] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<LivePosition | null>(null);
  const [closeAll, setCloseAll] = useState(false);
  const [error, setError] = useState('');

  const posKey = positions.map((p) => `${p.ticket}:${p.sl}:${p.tp}`).join('|');
  useEffect(() => {
    const live = new Set(positions.map((p) => p.ticket));
    setClosing((prev) => new Set([...prev].filter((t) => live.has(t))));
    setModifying(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey]);

  const close = async (p: LivePosition) => {
    setError('');
    setClosing((prev) => new Set(prev).add(p.ticket));
    const ok = await closeDeskPosition(account, p.ticket);
    if (!ok) {
      setClosing((prev) => {
        const next = new Set(prev);
        next.delete(p.ticket);
        return next;
      });
      setError(`Could not close #${p.ticket}. Please try again. 無法平倉，請再試。`);
      return;
    }
    logActivity('close_position', 'positions', account, { ticket: p.ticket, symbol: p.symbol, lots: p.lots });
    setTimeout(() => {
      setClosing((prev) => {
        if (!prev.has(p.ticket)) return prev;
        setError(`#${p.ticket}: the MT terminal has not picked up the close order yet. It stays queued and will run once the EA responds. 終端尚未接收平倉指令，指令仍在排隊，EA 回應後會自動執行。`);
        const next = new Set(prev);
        next.delete(p.ticket);
        return next;
      });
    }, CLOSE_WAIT_MS);
  };

  const total = positions.reduce((s, p) => s + (p.profit || 0) + (p.swap || 0), 0);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60">
      <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-3">
        <h3 className="text-sm font-semibold text-white">Open positions 持倉</h3>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{positions.length}</span>
        <span className={`ml-auto text-sm font-semibold tabular-nums ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSigned(total)}</span>
        {positions.length > 0 && (
          <button
            onClick={() => setCloseAll(true)}
            disabled={!canTrade}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <XCircle className="h-3.5 w-3.5" />
            Close all 全部平倉
          </button>
        )}
      </header>
      {error && <p className="mx-5 mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {positions.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">No open positions 沒有持倉</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                {['Ticket', 'Symbol', 'Type', 'Lots', 'Open', 'S/L', 'T/P', 'Profit', ''].map((h, i) => (
                  <th key={i} className={`px-3 py-2 font-medium ${i >= 3 && i <= 7 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {positions.map((p) => {
                const d = guessDigits(p.open_price);
                const pl = (p.profit || 0) + (p.swap || 0);
                const isClosing = closing.has(p.ticket);
                return (
                  <tr key={p.ticket} className={`transition-colors hover:bg-slate-800/40 ${isClosing ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{p.ticket}</td>
                    <td className="px-3 py-2 font-medium text-white">{p.symbol}</td>
                    <td className={`px-3 py-2 text-xs font-bold ${isBuy(p.order_type) ? 'text-blue-400' : 'text-red-400'}`}>{p.order_type}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-200">{p.lots}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">{p.open_price.toFixed(d)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{p.sl ? p.sl.toFixed(d) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{p.tp ? p.tp.toFixed(d) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSigned(pl)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {modifying.has(p.ticket) ? (
                          <Loader2 className="h-7 w-7 animate-spin p-1.5 text-amber-300" />
                        ) : (
                          <IconButton label="Modify SL/TP 修改止損止賺" tone="amber" onClick={() => setEditing(p)} disabled={!canTrade || isClosing}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                        {isClosing ? (
                          <Loader2 className="h-7 w-7 animate-spin p-1.5 text-red-300" />
                        ) : (
                          <IconButton label="Close 平倉" tone="red" onClick={() => close(p)} disabled={!canTrade}>
                            <X className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ModifyDialog position={editing} onClose={() => setEditing(null)} onQueued={(t) => setModifying((prev) => new Set(prev).add(t))} />}
      {closeAll && (
        <CloseAllDialog
          account={account}
          positions={positions}
          followerTrades={followerTrades}
          onClose={() => setCloseAll(false)}
          onQueued={() => setClosing(new Set(positions.map((p) => p.ticket)))}
        />
      )}
    </section>
  );
}
