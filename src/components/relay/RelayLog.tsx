import { ScrollText } from 'lucide-react';
import { formatTime } from '@/lib/format';
import type { RelayLogRow } from '@/lib/relay';

const STATUS: Record<RelayLogRow['status'], { label: string; cls: string }> = {
  pending: { label: 'Pending 等待', cls: 'text-slate-300 border-slate-600' },
  copied: { label: 'Copied 已跟', cls: 'text-emerald-300 border-emerald-500/40' },
  missed: { label: 'Missed 漏單', cls: 'text-red-300 border-red-500/50 bg-red-500/10' },
  failed: { label: 'Failed 失敗', cls: 'text-amber-300 border-amber-500/40' },
};

const delayCls = (ms: number) => (ms < 1000 ? 'text-emerald-300' : ms < 3000 ? 'text-amber-300' : 'text-red-300');

export function RelayLog({ rows }: { rows: RelayLogRow[] }) {
  const missedByBroker = new Map<string, number>();
  for (const r of rows) if (r.status === 'missed') missedByBroker.set(r.broker || '-', (missedByBroker.get(r.broker || '-') ?? 0) + 1);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          <ScrollText className="h-3.5 w-3.5" /> Relay log 跟單記錄
        </p>
        {missedByBroker.size > 0 && (
          <p className="text-xs text-red-300">
            Missed 漏單: {[...missedByBroker].map(([b, n]) => `${b} ×${n}`).join(' · ')}
          </p>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-700/80">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-900 text-left text-xs text-slate-400">
            <tr>
              {['Master 出單時間', 'Follower 收單時間', '延遲 Delay', 'Status 狀態', 'Broker 券商', 'Symbol', 'Follower'].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                  No data yet · 暫時未有數據
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={r.status === 'missed' ? 'bg-red-500/5' : ''}>
                <td className="px-3 py-2 tabular-nums text-slate-300">{formatTime(r.master_opened_at)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-300">{r.follower_received_at ? formatTime(r.follower_received_at) : '-'}</td>
                <td className={`px-3 py-2 tabular-nums ${r.delay_ms == null ? 'text-slate-500' : delayCls(r.delay_ms)}`}>
                  {r.delay_ms == null ? '-' : `${(r.delay_ms / 1000).toFixed(2)} s`}
                </td>
                <td className="px-3 py-2">
                  <span title={r.reason ?? undefined} className={`rounded border px-1.5 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                </td>
                <td className="px-3 py-2 text-slate-300">{r.broker || '-'}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{r.symbol}</td>
                <td translate="no" className="notranslate px-3 py-2 text-slate-300">{r.follower_account}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
