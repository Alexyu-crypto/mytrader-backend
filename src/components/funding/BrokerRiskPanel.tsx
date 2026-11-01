import { useState } from 'react';
import { Ban, CheckCircle2, Info, Settings2, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { RISK_BADGE, RISK_LABEL, blockReasonLabel, riskAdvice, type BrokerRisk } from '@/lib/brokerRisk';
import { BrokerRuleDialog } from '@/components/funding/BrokerRuleDialog';
import { IconButton } from '@/components/IconButton';

export function BrokerRiskPanel({ risks, loading, error, canEdit, onChanged }: {
  risks: BrokerRisk[];
  loading: boolean;
  error: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<BrokerRisk | null>(null);
  const blocked = risks.filter((r) => r.deposit_blocked).length;
  const high = risks.filter((r) => r.risk_level === 'high').length;
  const medium = risks.filter((r) => r.risk_level === 'medium').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Brokers 經紀商" value={risks.length} cls="text-white" />
        <Stat label="Deposits blocked 禁止入金" value={blocked} cls="text-red-400" />
        <Stat label="High risk 高風險" value={high} cls="text-red-400" />
        <Stat label="Medium risk 中風險" value={medium} cls="text-amber-400" />
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3 leading-relaxed">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p>
          Risk score (0-100) is based on your funding records: withdrawal rejection rate (40), average withdrawal delay (25),
          withdrawals pending over 7 days (20) and profit withholding (15). 風險分數根據出入金核對記錄計算：出金拒絕率、平均到帳延遲、逾期出金及只出本金。
        </p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : risks.length === 0 ? (
        <div className="text-slate-500 text-center py-12">No brokers found. 沒有經紀商資料。</div>
      ) : (
        <div className="overflow-x-auto border border-slate-700 rounded-xl">
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                <th className="text-left px-3 py-2.5 font-medium">Broker 經紀商</th>
                <th className="text-left px-3 py-2.5 font-medium">Risk 風險</th>
                <th className="text-left px-3 py-2.5 font-medium">Deposits 入金狀態</th>
                <th className="text-right px-3 py-2.5 font-medium">Rejected 出金拒絕</th>
                <th className="text-right px-3 py-2.5 font-medium">Avg delay 平均延遲</th>
                <th className="text-right px-3 py-2.5 font-medium">Pending 待到帳出金</th>
                <th className="text-right px-3 py-2.5 font-medium">Net exposure 淨曝險</th>
                <th className="text-left px-3 py-2.5 font-medium">Advice 建議</th>
                {canEdit && <th className="text-right px-3 py-2.5 font-medium">Rules 設定</th>}
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => {
                const totalWd = r.wd_confirmed + r.wd_rejected;
                const barCls = r.risk_level === 'high' ? 'bg-red-500' : r.risk_level === 'medium' ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <tr key={r.broker} className={`border-b border-slate-700/50 transition-colors hover:bg-slate-700/20 ${r.deposit_blocked ? 'bg-red-500/5' : ''}`}>
                    <td className="px-3 py-2">
                      <p className="text-white font-medium whitespace-nowrap">{r.broker || '—'}</p>
                      <p className="text-slate-500 text-[11px]">
                        {r.account_count} account{r.account_count !== 1 ? 's' : ''}
                        {r.restricts_profit && <span className="ml-1.5 text-red-400">· Withholds profit 只出本金</span>}
                      </p>
                      {r.notes && <p className="text-slate-500 text-[11px] max-w-[220px] truncate" title={r.notes}>{r.notes}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex border rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${RISK_BADGE[r.risk_level]}`}>{RISK_LABEL[r.risk_level]}</span>
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${barCls} transition-all duration-500`} style={{ width: `${r.risk_score}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 tabular-nums">{r.risk_score}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {r.deposit_blocked ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 whitespace-nowrap"><Ban className="w-3.5 h-3.5" /> Blocked 禁止</span>
                          <p className="text-[11px] text-red-300/70 max-w-[220px]">{blockReasonLabel(r)}</p>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 whitespace-nowrap"><CheckCircle2 className="w-3.5 h-3.5" /> Allowed 允許</span>
                          {r.block_deposits_after && <p className="text-[11px] text-amber-300/80">Blocks from 將於 {r.block_deposits_after} 禁止</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      <span className={r.wd_rejected > 0 ? 'text-red-400 font-semibold' : 'text-slate-400'}>{r.wd_rejected}</span>
                      <span className="text-slate-600"> / {totalWd}</span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums text-xs ${r.avg_wd_delay_days >= 7 ? 'text-red-400' : r.avg_wd_delay_days >= 3 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {r.wd_confirmed > 0 ? `${r.avg_wd_delay_days}d` : '—'}
                      {r.max_wd_delay_days > 0 && <p className="text-[10px] text-slate-500">max {r.max_wd_delay_days}d</p>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      <span className={r.wd_overdue > 0 ? 'text-red-400 font-semibold' : 'text-slate-400'}>{r.wd_pending}</span>
                      {r.wd_pending > 0 && <p className="text-[10px] text-slate-500">oldest {r.oldest_pending_days}d</p>}
                      {r.wd_overdue > 0 && <p className="text-[10px] text-red-400">{formatCurrency(r.wd_overdue_amount)} overdue</p>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums text-xs font-medium ${r.net_exposure > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                      {formatCurrency(r.net_exposure)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300 min-w-[220px] max-w-[280px] whitespace-normal">
                      <span className="inline-flex items-start gap-1.5">
                        {r.risk_level !== 'low' || r.deposit_blocked ? <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /> : null}
                        {riskAdvice(r)}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <IconButton label="Broker rules · 風控設定" tone="slate" onClick={() => setEditing(r)}>
                          <Settings2 className="w-3.5 h-3.5" />
                        </IconButton>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <BrokerRuleDialog
          risk={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
