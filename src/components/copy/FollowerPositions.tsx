import { Loader2, XCircle } from 'lucide-react';
import { tradeKey } from '@/lib/copyDelay';
import type { LivePosition } from '@/lib/types';
import { Hint, IconButton } from '@/components/IconButton';

export function FollowerPositions({
  positions,
  closing,
  canClose,
  onClose,
}: {
  positions: LivePosition[];
  closing: Set<string>;
  canClose: boolean;
  onClose: (p: LivePosition) => void;
}) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-slate-500 uppercase">
          <th className="text-left px-3 py-1.5 font-medium">Ticket</th>
          <th className="text-left px-3 py-1.5 font-medium">Symbol</th>
          <th className="text-left px-3 py-1.5 font-medium">Type</th>
          <th className="text-right px-3 py-1.5 font-medium">Lots</th>
          <th className="text-right px-3 py-1.5 font-medium">Open Price</th>
          <th className="text-right px-3 py-1.5 font-medium">Profit</th>
          <th className="text-right px-3 py-1.5 font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const profit = p.profit || 0;
          return (
            <tr key={p.id} className="border-t border-slate-700/40">
              <td className="px-3 py-1.5 text-slate-400 tabular-nums">{p.ticket}</td>
              <td className="px-3 py-1.5 text-white font-medium">{p.symbol}</td>
              <td className="px-3 py-1.5">
                <span className={`px-2 py-0.5 rounded font-medium ${p.order_type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{p.order_type}</span>
              </td>
              <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{p.lots}</td>
              <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{p.open_price}</td>
              <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {profit >= 0 ? '+' : ''}
                {profit.toFixed(2)}
              </td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                {!canClose ? (
                  <span className="text-slate-600">—</span>
                ) : closing.has(tradeKey(p.account_name, p.ticket)) ? (
                  <Hint label="Closing · 平倉中">
                    <span className="inline-flex items-center justify-center w-7 h-7 text-amber-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </span>
                  </Hint>
                ) : (
                  <IconButton label="Close position · 平倉" tone="red" onClick={() => onClose(p)}>
                    <XCircle className="w-3.5 h-3.5" />
                  </IconButton>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
