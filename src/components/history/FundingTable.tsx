import type { BalanceOperation } from '@/lib/types';
import { OP_LABEL } from '@/lib/accountData';
import { formatCurrency } from '@/lib/format';

const formatTime = (value: string) =>
  new Date(value).toLocaleString('en-US', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

const TONE: Record<BalanceOperation['op_type'], string> = {
  deposit: 'bg-emerald-500/15 text-emerald-400',
  withdrawal: 'bg-red-500/15 text-red-400',
  credit: 'bg-sky-500/15 text-sky-400',
};

export function fundingTotals(ops: BalanceOperation[]) {
  const deposits = ops.filter((o) => o.op_type === 'deposit').reduce((s, o) => s + o.amount, 0);
  const withdrawals = ops.filter((o) => o.op_type === 'withdrawal').reduce((s, o) => s + Math.abs(o.amount), 0);
  const credit = ops.filter((o) => o.op_type === 'credit').reduce((s, o) => s + o.amount, 0);
  return { deposits, withdrawals, credit, net: deposits - withdrawals };
}

export function FundingTable({ ops, showAccount = true, showTotals = true }: { ops: BalanceOperation[]; showAccount?: boolean; showTotals?: boolean }) {
  const totals = fundingTotals(ops);
  const cards: Array<[string, number, string]> = [
    ['Deposits', totals.deposits, 'text-emerald-400'],
    ['Withdrawals', -totals.withdrawals, 'text-red-400'],
    ['Net funding', totals.net, totals.net >= 0 ? 'text-white' : 'text-red-400'],
  ];

  return (
    <div className="space-y-4">
      {showTotals && (
        <div className="grid grid-cols-3 gap-3">
          {cards.map(([label, value, tone]) => (
            <div key={label} className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
              <p className="text-slate-500 text-xs">{label}</p>
              <p className={`text-lg font-semibold mt-0.5 tabular-nums ${tone}`}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto border border-slate-700 rounded-lg">
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wide">
              {showAccount && <th className="text-left px-3 py-2.5 font-medium">Account</th>}
              <th className="text-left px-3 py-2.5 font-medium">Time</th>
              <th className="text-left px-3 py-2.5 font-medium">Type</th>
              <th className="text-left px-3 py-2.5 font-medium">Ticket</th>
              <th className="text-left px-3 py-2.5 font-medium w-full">Comment</th>
              <th className="text-right px-3 py-2.5 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {ops.length === 0 ? (
              <tr>
                <td colSpan={showAccount ? 6 : 5} className="text-center text-slate-500 py-8">
                  No deposits or withdrawals recorded yet
                </td>
              </tr>
            ) : (
              ops.map((op) => (
                <tr key={op.id} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors">
                  {showAccount && <td className="px-3 py-2 text-slate-200 font-mono text-xs">{op.account_name}</td>}
                  <td className="px-3 py-2 text-slate-400 text-xs tabular-nums">{formatTime(op.op_time)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${TONE[op.op_type]}`}>{OP_LABEL[op.op_type]}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs tabular-nums">{op.ticket}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs max-w-0 truncate" title={op.comment || undefined}>{op.comment || '—'}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${op.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {op.amount >= 0 ? '+' : ''}
                    {formatCurrency(op.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
