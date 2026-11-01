import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, HandCoins, Landmark, Loader2, Pencil, Plus, RefreshCw, Scale, Trash2 } from 'lucide-react';
import {
  OVERDUE_AFTER_DAYS,
  RECON_META,
  deleteStatement,
  fetchRebateBrokers,
  fetchStatements,
  money,
  reconStatus,
  type RebateBroker,
  type RebateStatement,
  type ReconStatus,
} from '@/lib/ibRebates';
import { StatementDialog } from '@/components/rebates/StatementDialog';
import { ReceiptDialog } from '@/components/rebates/ReceiptDialog';
import { IconButton } from '@/components/IconButton';
import { useConfirm } from '@/hooks/useConfirm';

type Filter = 'all' | 'open' | 'issues' | ReconStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All 全部' },
  { key: 'open', label: 'Not received 未到帳' },
  { key: 'issues', label: 'Needs attention 需處理' },
  { key: 'matched', label: 'Matched 相符' },
];

function sumByCurrency(rows: RebateStatement[], pick: (s: RebateStatement) => number | null): string {
  const totals = new Map<string, number>();
  rows.forEach((s) => {
    const v = pick(s);
    if (v !== null) totals.set(s.currency, (totals.get(s.currency) ?? 0) + Number(v));
  });
  if (totals.size === 0) return '—';
  return [...totals].map(([c, v]) => money(v, c)).join(' · ');
}

export function RebatesPage({ isAdmin }: { isAdmin: boolean }) {
  const ask = useConfirm();
  const [brokers, setBrokers] = useState<RebateBroker[]>([]);
  const [statements, setStatements] = useState<RebateStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [brokerFilter, setBrokerFilter] = useState('');
  const [editing, setEditing] = useState<RebateStatement | null | 'new'>(null);
  const [receiving, setReceiving] = useState<RebateStatement | null>(null);

  const load = useCallback(async () => {
    const [b, s] = await Promise.all([fetchRebateBrokers(), fetchStatements()]);
    setBrokers(b.brokers);
    setStatements(s.statements);
    setError(b.error ?? s.error ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const brokerName = useMemo(() => new Map(brokers.map((b) => [b.id, b.broker_name])), [brokers]);
  const withStatus = useMemo(() => statements.map((s) => ({ s, status: reconStatus(s) })), [statements]);
  const countOf = (...keys: ReconStatus[]) => withStatus.filter((x) => keys.includes(x.status)).length;

  const visible = withStatus.filter(({ s, status }) => {
    if (brokerFilter && s.broker_id !== brokerFilter) return false;
    if (filter === 'all') return true;
    if (filter === 'open') return status === 'pending' || status === 'overdue';
    if (filter === 'issues') return status === 'overdue' || status === 'short' || status === 'over';
    return status === filter;
  });

  const outstanding = sumByCurrency(statements.filter((s) => s.received_amount === null), (s) => s.expected_amount);

  const stats = [
    { label: 'Awaiting payment 待到帳', value: countOf('pending'), icon: Clock, tone: 'text-sky-300 bg-sky-500/10' },
    { label: `Overdue >${OVERDUE_AFTER_DAYS}d 逾期`, value: countOf('overdue'), icon: AlertTriangle, tone: countOf('overdue') ? 'text-red-300 bg-red-500/15' : 'text-slate-400 bg-slate-700/30' },
    { label: 'Amount mismatch 金額不符', value: countOf('short', 'over'), icon: Scale, tone: countOf('short', 'over') ? 'text-amber-300 bg-amber-500/15' : 'text-slate-400 bg-slate-700/30' },
    { label: 'Matched 已核對', value: countOf('matched'), icon: CheckCircle2, tone: 'text-emerald-300 bg-emerald-500/10' },
  ];

  const remove = async (s: RebateStatement) => {
    if (!(await ask('Delete this statement? 確定刪除此結算單？', { tone: 'danger', confirmLabel: 'Delete · 刪除' }))) return;
    const err = await deleteStatement(s.id);
    if (err) setError(err);
    else load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Rebate reconciliation 回傭到帳核對</h1>
          <p className="mt-1 text-sm text-slate-400">Check every IB rebate the brokers owe us actually arrived, and in full. 核對經紀商應付的每筆回傭是否足額到帳。</p>
        </div>
        <div className="flex gap-2">
          <IconButton label="Refresh · 重新整理" tone="slate" size="md" onClick={() => { setLoading(true); load(); }}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
          <IconButton label="New statement · 新增結算單" tone="solid" size="md" onClick={() => setEditing('new')} disabled={brokers.length === 0}>
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
        <HandCoins className="h-5 w-5 text-cyan-300" />
        <span className="text-sm text-slate-300">Still to receive 尚未到帳</span>
        <span className="ml-auto font-semibold tabular-nums text-white">{outstanding}</span>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {brokers.length > 0 && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {brokers.map((b) => {
            const rows = statements.filter((s) => s.broker_id === b.id);
            const active = brokerFilter === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setBrokerFilter(active ? '' : b.id)}
                className={`rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 ${active ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-white">{b.broker_name}</p>
                  <span className="shrink-0 text-xs text-slate-500">{b.referral_count} clients 客戶</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {[b.rebate_type, b.rebate_per_lot !== null ? `${b.rebate_per_lot}/lot 每手` : '', b.payout_cycle].filter(Boolean).join(' · ') || 'No rebate terms yet 未填回傭條款'}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-slate-500">Expected 應收</dt><dd className="mt-0.5 truncate tabular-nums text-slate-200">{sumByCurrency(rows, (s) => s.expected_amount)}</dd></div>
                  <div><dt className="text-slate-500">Received 實收</dt><dd className="mt-0.5 truncate tabular-nums text-slate-200">{sumByCurrency(rows, (s) => s.received_amount)}</dd></div>
                </dl>
              </button>
            );
          })}
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-4">
          <h2 className="mr-auto font-semibold text-white">
            Statements 結算單{brokerFilter && <span className="ml-2 text-sm font-normal text-cyan-300">· {brokerName.get(brokerFilter)}</span>}
          </h2>
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f.key ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && statements.length === 0 ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <Scale className="mx-auto h-9 w-9 text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">
              {brokers.length === 0 ? 'No approved IB brokers yet. 尚未有已開通的代理經紀商。' : statements.length ? 'Nothing matches this filter. 沒有符合的記錄。' : 'Add the first rebate statement to start reconciling. 新增第一張結算單開始核對。'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2.5 font-medium">Broker / period 經紀商 / 結算期</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lots 手數</th>
                  <th className="px-3 py-2.5 text-right font-medium">Expected 應收</th>
                  <th className="px-3 py-2.5 text-right font-medium">Received 實收</th>
                  <th className="px-3 py-2.5 font-medium">Status 狀態</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visible.map(({ s, status }) => {
                  const diff = s.received_amount === null ? null : Number(s.received_amount) - Number(s.expected_amount);
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-slate-800/30">
                      <td className="px-3 py-2">
                        <p className="font-medium text-white">{brokerName.get(s.broker_id) ?? '—'}</p>
                        <p className="text-xs tabular-nums text-slate-500">{s.period_start} – {s.period_end}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {s.lots ?? '—'}
                        {s.rate_per_lot !== null && <p className="text-xs text-slate-500">@ {s.rate_per_lot}</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-200">{money(s.expected_amount, s.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <p className="text-slate-200">{money(s.received_amount, s.currency)}</p>
                        {diff !== null && Math.abs(diff) >= 0.01 && <p className={`text-xs ${diff < 0 ? 'text-amber-300' : 'text-orange-300'}`}>{diff > 0 ? '+' : '−'}{money(Math.abs(diff), s.currency)}</p>}
                        {s.received_on && <p className="text-xs text-slate-500">{s.received_on}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${RECON_META[status].tone}`}>{RECON_META[status].label}</span>
                        {s.reference && <p className="mt-1 max-w-[160px] truncate text-xs text-slate-500" title={s.reference}>Ref {s.reference}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <IconButton label={s.received_amount === null ? 'Record payment · 登記到帳' : 'Edit payment · 修改到帳'} tone="green" onClick={() => setReceiving(s)}>
                            <Landmark className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Edit statement · 修改結算單" tone="ghost" onClick={() => setEditing(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          {isAdmin && (
                            <IconButton label="Delete · 刪除" tone="red" onClick={() => remove(s)}>
                              <Trash2 className="h-3.5 w-3.5" />
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
      </section>

      {editing && (
        <StatementDialog
          brokers={brokers}
          statement={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {receiving && (
        <ReceiptDialog
          statement={receiving}
          brokerName={brokerName.get(receiving.broker_id) ?? ''}
          onClose={() => setReceiving(null)}
          onSaved={() => { setReceiving(null); load(); }}
        />
      )}
    </div>
  );
}
