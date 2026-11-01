import { CornerDownRight, Crown } from 'lucide-react';
import { TimingCell } from '@/components/history/TimingCell';
import { DelayValue } from '@/components/copy/DelayValue';
import { openDelayOf, type TradeTiming } from '@/lib/tradeOrigin';
import type { TradeHistory } from '@/lib/types';

export type RowRole = 'plain' | 'lead' | 'follower';

const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const ROW_TONE: Record<RowRole, string> = {
  plain: 'border-b border-slate-700/50 hover:bg-slate-700/30',
  lead: 'border-t-2 border-t-slate-600 border-b border-b-cyan-500/20 bg-cyan-500/[0.06] hover:bg-cyan-500/10',
  follower: 'border-b border-slate-800 bg-slate-900/40 hover:bg-slate-700/30',
};

function GroupSummary({ followers, timings }: { followers: TradeHistory[]; timings: Map<string, TradeTiming> }) {
  const delays = followers.map((f) => openDelayOf(timings.get(f.id))).filter((d): d is number => d !== null);
  if (delays.length === 0) return null;
  const avg = delays.reduce((s, d) => s + d, 0) / delays.length;
  return (
    <div className="mt-1 space-y-0.5 border-t border-cyan-500/20 pt-1">
      <DelayValue label="Avg 平均" ms={Math.round(avg)} />
      <DelayValue label="Slowest 最慢" ms={Math.max(...delays)} />
    </div>
  );
}

export function TradeRow({ trade, role, timings, followers = [] }: {
  trade: TradeHistory;
  role: RowRole;
  timings: Map<string, TradeTiming>;
  followers?: TradeHistory[];
}) {
  const profit = trade.profit || 0;
  return (
    <tr className={`transition-colors ${ROW_TONE[role]}`}>
      <td className={`py-2 pr-3 ${role === 'follower' ? 'pl-7' : 'pl-3'} ${role === 'lead' ? 'shadow-[inset_3px_0_0_#22d3ee]' : role === 'follower' ? 'shadow-[inset_3px_0_0_rgba(34,211,238,0.25)]' : ''}`}>
        <div className="flex items-center gap-2">
          {role === 'follower' && <CornerDownRight className="w-3.5 h-3.5 text-cyan-500/60 shrink-0" />}
          {role === 'lead' && <Crown className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
          <span className={role === 'lead' ? 'text-white font-semibold' : 'text-slate-300 font-medium'}>{trade.account_name}</span>
          {role === 'lead' && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-medium">
              {followers.length} {followers.length === 1 ? 'copy' : 'copies'} · 跟單
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-slate-400">{trade.ticket}</td>
      <td className="px-3 py-2 text-white font-medium">{trade.symbol}</td>
      <td className="px-3 py-2">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${trade.order_type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{trade.order_type}</span>
      </td>
      <td className="px-3 py-2 text-right text-slate-300">{trade.lots}</td>
      <td className="px-3 py-2 text-right text-slate-300">{trade.open_price}</td>
      <td className="px-3 py-2 text-right text-slate-300">{trade.close_price}</td>
      <td className={`px-3 py-2 text-right font-medium ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{profit >= 0 ? '+' : ''}{profit.toFixed(2)}</td>
      <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{formatTime(trade.open_time)}</td>
      <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{formatTime(trade.close_time)}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap text-right">
        <TimingCell timing={timings.get(trade.id)} />
        {role === 'lead' && <GroupSummary followers={followers} timings={timings} />}
      </td>
    </tr>
  );
}
