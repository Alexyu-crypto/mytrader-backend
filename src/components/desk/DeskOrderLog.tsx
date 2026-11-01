import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { ORDER_TYPE_LABEL, isBuy, type DeskOrder } from '@/lib/desk';
import { timeAgo } from '@/lib/format';

const STATUS = {
  pending: { label: 'Sent 已發送', cls: 'text-slate-300 bg-slate-700/50', icon: Clock },
  processing: { label: 'Executing 執行中', cls: 'text-cyan-300 bg-cyan-500/10', icon: Loader2 },
  filled: { label: 'Filled 已成交', cls: 'text-emerald-300 bg-emerald-500/10', icon: CheckCircle2 },
  failed: { label: 'Failed 失敗', cls: 'text-red-300 bg-red-500/10', icon: XCircle },
  expired: { label: 'Expired 逾時', cls: 'text-amber-300 bg-amber-500/10', icon: XCircle },
  cancelled: { label: 'Cancelled 已取消', cls: 'text-amber-300 bg-amber-500/10', icon: XCircle },
} as const;

export function DeskOrderLog({ orders }: { orders: DeskOrder[] }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60">
      <header className="border-b border-slate-800 px-5 py-3">
        <h3 className="text-sm font-semibold text-white">Recent desk orders 最近落單</h3>
      </header>
      {orders.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No orders yet 暫無落單</p>
      ) : (
        <ul className="divide-y divide-slate-800/70">
          {orders.map((o) => {
            const s = STATUS[o.status] ?? STATUS.pending;
            const Icon = s.icon;
            return (
              <li key={o.id} className="px-5 py-2.5 animate-fade-in">
                <div className="flex items-center gap-3 text-sm">
                  <span className={`w-20 shrink-0 text-xs font-bold ${isBuy(o.order_type) ? 'text-blue-400' : 'text-red-400'}`}>{ORDER_TYPE_LABEL[o.order_type]}</span>
                  <span className="font-medium text-white">{o.symbol}</span>
                  <span className="font-mono text-slate-400">{o.lots}</span>
                  {o.ticket && <span className="font-mono text-xs text-slate-500">#{o.ticket}</span>}
                  <span className={`ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
                    <Icon className={`h-3 w-3 ${o.status === 'processing' ? 'animate-spin' : ''}`} />
                    {s.label}
                  </span>
                </div>
                <div className="mt-0.5 flex gap-3 text-[11px] text-slate-500">
                  <span>{timeAgo(o.created_at)}</span>
                  {o.requested_email && <span className="truncate">{o.requested_email}</span>}
                  {o.error && <span className={`truncate ${o.status === 'filled' ? 'text-amber-300' : 'text-red-300'}`}>{o.error}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
