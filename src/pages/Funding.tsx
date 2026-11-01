import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAccounts } from '@/hooks/useRealtime';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import type { FundingRequest, FundingRequestStatus, FundingRequestType } from '@/lib/types';
import {
  fetchFundingRequests,
  createFundingRequest,
  confirmFundingRequest,
  rejectFundingRequest,
  reopenFundingRequest,
  deleteFundingRequest,
  updateFundingRequest,
  statusLabel,
  statusBadge,
} from '@/lib/fundingReconciliation';
import { formatCurrency } from '@/lib/format';
import { fetchBrokerRisk, isDepositBlockedError, blockReasonLabel, riskAdvice, type BrokerRisk } from '@/lib/brokerRisk';
import { BrokerRiskPanel } from '@/components/funding/BrokerRiskPanel';
import { IconButton } from '@/components/IconButton';
import {
  Plus, Check, X, RotateCcw, Trash2, Loader2, Copy, ChevronDown,
  Pencil, Download, AlertTriangle, Landmark, ShieldAlert, Ban, List,
} from 'lucide-react';

const STATUS_FILTERS: { key: FundingRequestStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All 全部' },
  { key: 'pending', label: 'Pending 待處理' },
  { key: 'confirmed', label: 'Confirmed 已到帳' },
  { key: 'rejected', label: 'Rejected 已拒絕' },
];

const fmtDate = (ts: string | null) =>
  ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function ageDays(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
}

function ageClass(ts: string, status: FundingRequestStatus): string {
  if (status !== 'pending') return '';
  const d = ageDays(ts);
  if (d >= 60) return 'funding-flash-red';
  if (d >= 30) return 'bg-red-500/10';
  if (d >= 7) return 'bg-orange-500/10';
  if (d >= 3) return 'bg-yellow-500/8';
  return '';
}

function AgeBadge({ ts, status }: { ts: string; status: FundingRequestStatus }) {
  if (status !== 'pending') return null;
  const d = ageDays(ts);
  if (d < 3) return null;
  const label = d >= 60 ? `${d}d !!` : d >= 30 ? `${d}d !` : `${d}d`;
  const cls = d >= 60 ? 'text-red-400 animate-pulse font-bold' : d >= 30 ? 'text-red-400 font-semibold' : d >= 7 ? 'text-orange-400' : 'text-yellow-400';
  return <span className={`text-[10px] ml-1 ${cls}`}>{label}</span>;
}

function exportCSV(rows: FundingRequest[], filename: string) {
  const header = 'Account,Type,Amount,Currency,Reference,Status,Requested,Confirmed,Notes';
  const lines = rows.map((r) =>
    [r.account_name, r.request_type, r.amount, r.currency, r.reference_code, r.status, r.requested_at, r.confirmed_at ?? '', r.notes]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function FundingPage() {
  const { accounts } = useAccounts();
  const ask = useConfirm();
  const auth = useAuth();
  const userName = auth.status === 'active' ? auth.email : '';
  const isAdmin = auth.role === 'admin';
  const canEdit = isAdmin || auth.role === 'finance';

  const [rows, setRows] = useState<FundingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<FundingRequestStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<FundingRequestType | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRow, setEditingRow] = useState<FundingRequest | null>(null);
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<'records' | 'risk'>('records');
  const [risks, setRisks] = useState<BrokerRisk[]>([]);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskError, setRiskError] = useState('');

  const loadRisk = useCallback(async () => {
    try {
      setRisks(await fetchBrokerRisk());
      setRiskError('');
    } catch {
      setRiskError('Failed to load broker risk. 未能載入經紀商風險。');
    } finally {
      setRiskLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await fetchFundingRequests());
      setError('');
    } catch {
      setError('Failed to load funding requests. 未能載入出入金記錄。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRisk(); }, [loadRisk, rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.request_type !== typeFilter) return false;
      if (accountFilter && r.account_name !== accountFilter) return false;
      return true;
    });
  }, [rows, statusFilter, typeFilter, accountFilter]);

  const stats = useMemo(() => {
    const bucket = (status: FundingRequestStatus, type: FundingRequestType) => {
      const arr = rows.filter((r) => r.status === status && r.request_type === type);
      return { amount: arr.reduce((s, r) => s + r.amount, 0), count: arr.length };
    };
    return {
      pendingDep: bucket('pending', 'deposit'),
      pendingWd: bucket('pending', 'withdrawal'),
      confirmedDep: bucket('confirmed', 'deposit'),
      confirmedWd: bucket('confirmed', 'withdrawal'),
      rejectedDep: bucket('rejected', 'deposit'),
      rejectedWd: bucket('rejected', 'withdrawal'),
      totalCount: rows.length,
      pendingCount: rows.filter((r) => r.status === 'pending').length,
      confirmedCount: rows.filter((r) => r.status === 'confirmed').length,
    };
  }, [rows]);

  const doAction = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id);
    try { await fn(id); await load(); } catch { setError('Action failed. 操作失敗。'); }
    setBusy('');
  };

  const allAccountNames = useMemo(() => accounts.map((a) => a.account_name).sort(), [accounts]);

  const urgentPending = useMemo(() => rows.filter((r) => r.status === 'pending' && ageDays(r.requested_at) >= 3), [rows]);
  const flaggedBrokers = useMemo(() => risks.filter((r) => r.deposit_blocked || r.risk_level === 'high'), [risks]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <Landmark className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Funding Reconciliation 出入金核對</h1>
          <p className="text-slate-400 text-sm">Track deposit and withdrawal requests across all accounts 追蹤所有帳戶嘅出入金記錄</p>
        </div>
      </div>

      {flaggedBrokers.length > 0 && (
        <button type="button" onClick={() => setTab('risk')}
          className="w-full text-left bg-red-500/10 hover:bg-red-500/15 border border-red-500/30 rounded-xl px-5 py-3 flex items-start gap-3 transition-colors"
        >
          <ShieldAlert className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-red-200 text-sm font-medium">
              Risk alert 風控提示: {flaggedBrokers.length} broker{flaggedBrokers.length > 1 ? 's' : ''} need attention 有 {flaggedBrokers.length} 間經紀商需要注意
            </p>
            <ul className="mt-1 space-y-0.5">
              {flaggedBrokers.slice(0, 4).map((b) => (
                <li key={b.broker} className="text-xs text-red-300/80 truncate">
                  <span className="font-semibold text-red-200">{b.broker}</span>
                  {b.deposit_blocked ? ` · ${blockReasonLabel(b)}` : ` · ${riskAdvice(b)}`}
                </li>
              ))}
            </ul>
          </div>
        </button>
      )}

      <div className="flex max-w-full flex-wrap items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 w-fit">
        {([['records', 'Records 記錄', List], ['risk', 'Broker risk 經紀商風控', ShieldAlert]] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {key === 'risk' && flaggedBrokers.length > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{flaggedBrokers.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'risk' ? (
        <BrokerRiskPanel risks={risks} loading={riskLoading} error={riskError} canEdit={canEdit} onChanged={loadRisk} />
      ) : (<>

      {/* Summary cards — deposits */}
      <div>
        <p className="text-xs font-medium text-emerald-400/70 uppercase tracking-wider mb-2">Deposits 入金</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Pending 待處理" amount={stats.pendingDep.amount} count={stats.pendingDep.count} tone="amber" />
          <SummaryCard label="Confirmed 已到帳" amount={stats.confirmedDep.amount} count={stats.confirmedDep.count} tone="emerald" />
          <SummaryCard label="Rejected 已拒絕" amount={stats.rejectedDep.amount} count={stats.rejectedDep.count} tone="red" />
          <SummaryCard label="Total deposits 入金總額" amount={stats.confirmedDep.amount + stats.pendingDep.amount} count={stats.confirmedDep.count + stats.pendingDep.count + stats.rejectedDep.count} tone="emerald" sub={`${stats.confirmedDep.count} confirmed · ${stats.pendingDep.count} pending`} />
        </div>
      </div>

      {/* Summary cards — withdrawals */}
      <div>
        <p className="text-xs font-medium text-red-400/70 uppercase tracking-wider mb-2">Withdrawals 出金</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Pending 待處理" amount={stats.pendingWd.amount} count={stats.pendingWd.count} tone="amber" />
          <SummaryCard label="Confirmed 已到帳" amount={stats.confirmedWd.amount} count={stats.confirmedWd.count} tone="emerald" />
          <SummaryCard label="Rejected 已拒絕" amount={stats.rejectedWd.amount} count={stats.rejectedWd.count} tone="red" />
          <SummaryCard label="Total withdrawals 出金總額" amount={stats.confirmedWd.amount + stats.pendingWd.amount} count={stats.confirmedWd.count + stats.pendingWd.count + stats.rejectedWd.count} tone="red" sub={`${stats.confirmedWd.count} confirmed · ${stats.pendingWd.count} pending`} />
        </div>
      </div>

      {/* Net difference */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SummaryCard label="Confirmed net 已確認淨額" amount={stats.confirmedDep.amount - stats.confirmedWd.amount} count={null} tone="cyan" sub="Confirmed deposits - Confirmed withdrawals" />
        <SummaryCard label="Pending net 待處理淨額" amount={stats.pendingDep.amount - stats.pendingWd.amount} count={null} tone="amber" sub="Pending deposits - Pending withdrawals" />
        <SummaryCard label="Total cases 總記錄" amount={null} count={stats.totalCount} tone="slate" sub={`${stats.pendingCount} pending · ${stats.confirmedCount} confirmed`} />
      </div>

      {/* Urgent banner */}
      {urgentPending.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-200 text-sm font-medium">
              {urgentPending.length} pending request{urgentPending.length > 1 ? 's' : ''} overdue 有 {urgentPending.length} 筆逾期待處理
            </p>
            <p className="text-amber-300/60 text-xs mt-0.5">
              Yellow = 3+ days · Orange = 7+ days · Red = 30+ days · Flashing = 60+ days
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full flex-wrap items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setStatusFilter(f.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === f.key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
          {([['all', 'All'], ['deposit', 'Deposit 入金'], ['withdrawal', 'Withdrawal 出金']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTypeFilter(key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${typeFilter === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
            className="appearance-none bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All accounts 全部帳戶</option>
            {allAccountNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ExportMenu rows={rows} filtered={filtered} statusFilter={statusFilter} />
          {canEdit && (
          <IconButton label="New request · 新增" tone="solid" size="md" onClick={() => { setEditingRow(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" />
          </IconButton>
          )}
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

      {showForm && (
        <RequestForm
          accounts={accounts}
          risks={risks}
          editing={editingRow}
          userName={userName}
          onDone={() => { setShowForm(false); setEditingRow(null); load(); }}
          onCancel={() => { setShowForm(false); setEditingRow(null); }}
        />
      )}

      {/* Table */}
      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-slate-500 text-center py-12">No funding requests found. 沒有出入金記錄。</div>
      ) : (
        <div className="overflow-x-auto border border-slate-700 rounded-xl">
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                <th className="text-left px-3 py-2.5 font-medium">Account 帳戶</th>
                <th className="text-left px-3 py-2.5 font-medium">Type 類型</th>
                <th className="text-right px-3 py-2.5 font-medium">Amount 金額</th>
                <th className="text-left px-3 py-2.5 font-medium">Currency</th>
                <th className="text-left px-3 py-2.5 font-medium">Reference 參考碼</th>
                <th className="text-left px-3 py-2.5 font-medium">Status 狀態</th>
                <th className="text-left px-3 py-2.5 font-medium">Requested 申請日</th>
                <th className="text-left px-3 py-2.5 font-medium">Confirmed 到帳日</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes 備註</th>
                <th className="text-left px-3 py-2.5 font-medium">Created by 建立者</th>
                {canEdit && <th className="text-right px-3 py-2.5 font-medium">Actions 操作</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-slate-700/50 transition-colors hover:bg-slate-700/20 ${ageClass(r.requested_at, r.status)}`}>
                  <td className="px-3 py-2 text-slate-300 font-medium whitespace-nowrap">{r.account_name}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.request_type === 'deposit' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {r.request_type === 'deposit' ? 'Deposit 入金' : 'Withdrawal 出金'}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${r.request_type === 'deposit' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.request_type === 'withdrawal' ? '-' : ''}{formatCurrency(r.amount)}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{r.currency}</td>
                  <td className="px-3 py-2">
                    {r.reference_code ? (
                      <div className="flex items-center gap-1.5 max-w-[180px]">
                        <span className="truncate text-xs text-slate-300 font-mono" title={r.reference_code}>{r.reference_code}</span>
                        <IconButton label="Copy · 複製" tone="ghost" onClick={() => navigator.clipboard.writeText(r.reference_code)}>
                          <Copy className="w-3.5 h-3.5" />
                        </IconButton>
                      </div>
                    ) : <span className="text-slate-600">--</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center border rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                    <AgeBadge ts={r.requested_at} status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{fmtDate(r.requested_at)}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{fmtDate(r.confirmed_at)}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs max-w-[140px] truncate" title={r.notes || undefined}>{r.notes || '--'}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap max-w-[160px] truncate" title={r.created_by_email || undefined}>{r.created_by_email || '--'}</td>
                  {canEdit && (
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : (<>
                        <IconButton label="Edit · 修改" tone="cyan" onClick={() => { setEditingRow(r); setShowForm(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </IconButton>
                        {r.status === 'pending' && (<>
                          <IconButton label="Confirm · 確認到帳" tone="green" onClick={() => doAction(r.id, confirmFundingRequest)}>
                            <Check className="w-3.5 h-3.5" />
                          </IconButton>
                          <IconButton label="Reject · 拒絕" tone="red" onClick={() => doAction(r.id, rejectFundingRequest)}>
                            <X className="w-3.5 h-3.5" />
                          </IconButton>
                        </>)}
                        {r.status !== 'pending' && (
                          <IconButton label="Reopen · 重開" tone="amber" onClick={() => doAction(r.id, reopenFundingRequest)}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </IconButton>
                        )}
                        {isAdmin && (
                          <IconButton label="Delete · 刪除" tone="red" onClick={async () => { if (await ask('Delete this request? 確定刪除？', { tone: 'danger', confirmLabel: 'Delete · 刪除' })) doAction(r.id, deleteFundingRequest); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </IconButton>
                        )}
                      </>)}
                    </div>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>)}
    </div>
  );
}

/* ---------- Summary card ---------- */

function SummaryCard({ label, amount, count, sub, tone }: {
  label: string;
  amount: number | null;
  count: number | null;
  sub?: string;
  tone: 'amber' | 'emerald' | 'red' | 'cyan' | 'slate';
}) {
  const colors: Record<string, { border: string; text: string; bg: string }> = {
    amber: { border: 'border-amber-500/30', text: 'text-amber-400', bg: 'bg-amber-500/5' },
    emerald: { border: 'border-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/5' },
    red: { border: 'border-red-500/30', text: 'text-red-400', bg: 'bg-red-500/5' },
    cyan: { border: 'border-cyan-500/30', text: 'text-cyan-400', bg: 'bg-cyan-500/5' },
    slate: { border: 'border-slate-700', text: 'text-white', bg: 'bg-slate-800/40' },
  };
  const c = colors[tone];

  return (
    <div className={`rounded-xl border p-4 ${c.border} ${c.bg}`}>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        {amount !== null && <p className={`text-xl font-bold tabular-nums ${c.text}`}>{formatCurrency(amount)}</p>}
        {count !== null && <span className={`text-sm font-semibold tabular-nums ${amount !== null ? 'text-slate-500' : c.text}`}>{amount !== null ? `${count} case${count !== 1 ? 's' : ''}` : count}</span>}
      </div>
      {sub && <p className="text-slate-500 text-[11px] mt-1 tabular-nums">{sub}</p>}
    </div>
  );
}

/* ---------- Export dropdown ---------- */

function ExportMenu({ rows, filtered, statusFilter }: { rows: FundingRequest[]; filtered: FundingRequest[]; statusFilter: string }) {
  const [open, setOpen] = useState(false);
  const date = new Date().toISOString().slice(0, 10);

  const options: { label: string; fn: () => void }[] = [
    { label: 'Export current view 匯出目前列表', fn: () => exportCSV(filtered, `funding-${statusFilter}-${date}.csv`) },
    { label: 'Export all 匯出全部', fn: () => exportCSV(rows, `funding-all-${date}.csv`) },
    { label: 'Export pending only 僅待處理', fn: () => exportCSV(rows.filter((r) => r.status === 'pending'), `funding-pending-${date}.csv`) },
    { label: 'Export confirmed only 僅已到帳', fn: () => exportCSV(rows.filter((r) => r.status === 'confirmed'), `funding-confirmed-${date}.csv`) },
    { label: 'Export rejected only 僅已拒絕', fn: () => exportCSV(rows.filter((r) => r.status === 'rejected'), `funding-rejected-${date}.csv`) },
    { label: 'Export deposits only 僅入金', fn: () => exportCSV(rows.filter((r) => r.request_type === 'deposit'), `funding-deposits-${date}.csv`) },
    { label: 'Export withdrawals only 僅出金', fn: () => exportCSV(rows.filter((r) => r.request_type === 'withdrawal'), `funding-withdrawals-${date}.csv`) },
  ];

  return (
    <div className="relative">
      <IconButton label="Export · 匯出" tone={open ? 'solid' : 'slate'} size="md" onClick={() => setOpen(!open)}>
        <Download className="w-4 h-4" />
      </IconButton>
      {open && (<>
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-full mt-1 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-40 py-1">
          {options.map((o) => (
            <button key={o.label} type="button" onClick={() => { o.fn(); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              {o.label}
            </button>
          ))}
        </div>
      </>)}
    </div>
  );
}

/* ---------- Create / Edit form ---------- */

function RequestForm({ accounts, risks, editing, userName, onDone, onCancel }: {
  accounts: { account_name: string; broker: string }[];
  risks: BrokerRisk[];
  editing: FundingRequest | null;
  userName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [accountName, setAccountName] = useState(editing?.account_name ?? accounts[0]?.account_name ?? '');
  const [requestType, setRequestType] = useState<FundingRequestType>(editing?.request_type ?? 'deposit');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [currency, setCurrency] = useState(editing?.currency ?? 'USDT');
  const [referenceCode, setReferenceCode] = useState(editing?.reference_code ?? '');
  const [requestedAt, setRequestedAt] = useState(
    editing ? new Date(editing.requested_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)
  );
  const [notes, setNotes] = useState(editing?.notes ?? (editing ? '' : `Created by ${userName}`));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const broker = accounts.find((a) => a.account_name === accountName)?.broker.trim() ?? '';
  const risk = risks.find((r) => r.broker === broker);
  const unchangedDeposit = editing?.request_type === 'deposit' && editing.account_name === accountName;
  const depositBlocked = requestType === 'deposit' && !!risk?.deposit_blocked && !unchangedDeposit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (depositBlocked) return;
    const amt = parseFloat(amount);
    if (!accountName || isNaN(amt) || amt <= 0) { setErr('Please fill in account and a valid amount. 請填寫帳戶及有效金額。'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateFundingRequest(editing.id, {
          account_name: accountName,
          request_type: requestType,
          amount: amt,
          currency,
          reference_code: referenceCode,
          requested_at: new Date(requestedAt).toISOString(),
          notes,
        });
      } else {
        await createFundingRequest({
          account_name: accountName,
          request_type: requestType,
          amount: amt,
          currency,
          reference_code: referenceCode,
          requested_at: new Date(requestedAt).toISOString(),
          notes,
        });
      }
      onDone();
    } catch (e) {
      setErr(isDepositBlockedError(e)
        ? 'Deposits to this broker are blocked by risk control. 此經紀商已被風控禁止入金。'
        : 'Failed to save. 儲存失敗。');
    }
    setSaving(false);
  };

  const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500';

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">
        {editing ? 'Edit request 修改記錄' : 'New funding request 新增出入金記錄'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Account 帳戶</label>
          <select value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls}>
            {accounts.map((a) => <option key={a.account_name} value={a.account_name}>{a.account_name}</option>)}
            {editing && !accounts.find((a) => a.account_name === editing.account_name) && (
              <option value={editing.account_name}>{editing.account_name}</option>
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type 類型</label>
          <div className="flex gap-2">
            {(['deposit', 'withdrawal'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setRequestType(t)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  requestType === t
                    ? t === 'deposit' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-red-500 bg-red-500/15 text-red-300'
                    : 'border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {t === 'deposit' ? 'Deposit 入金' : 'Withdrawal 出金'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Amount 金額</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Currency 幣種</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USDT" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Reference code / Hash ID 參考碼</label>
          <input value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder="TxID or bank ref" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Requested at 申請日期</label>
          <input type="datetime-local" value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-xs text-slate-400 mb-1">Notes 備註</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className={inputCls} />
        </div>
      </div>

      {requestType === 'deposit' && risk && (risk.deposit_blocked || risk.risk_level !== 'low') && (
        <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs ${depositBlocked || risk.risk_level === 'high' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
          {depositBlocked ? <Ban className="w-4 h-4 shrink-0 mt-0.5" /> : <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />}
          <div>
            <p className="font-semibold">
              {depositBlocked ? 'Deposit blocked 禁止入金' : 'Risk warning 風控提示'} · {risk.broker} (score {risk.risk_score})
            </p>
            <p className="opacity-80 mt-0.5">{risk.deposit_blocked ? blockReasonLabel(risk) : riskAdvice(risk)}</p>
          </div>
        </div>
      )}

      {err && <p className="text-red-400 text-xs">{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving || depositBlocked}
          className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {editing ? 'Update 更新' : 'Save 儲存'}
        </button>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white text-sm px-3 py-2 transition-colors">
          Cancel 取消
        </button>
      </div>
    </form>
  );
}
