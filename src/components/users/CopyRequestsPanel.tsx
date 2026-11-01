import { useMemo, useState } from 'react';
import { ChevronRight, Download, Inbox, Loader2, Search } from 'lucide-react';
import { STATUS_META, STATUS_ORDER, isOpen, type CopyRequest, type CopyStatus } from '@/lib/copyRequests';
import { formatCurrency, timeAgo } from '@/lib/format';
import { CopyRequestDrawer } from '@/components/users/CopyRequestDrawer';
import { downloadCsv } from '@/lib/csv';
import { logActivity } from '@/lib/activityLog';
import { HEAD_OFFICE, SourceBadge, sourceName } from '@/components/agents/SourceBadge';
import type { Agent } from '@/lib/agents';
import { IconButton } from '@/components/IconButton';

type Filter = 'open' | 'all' | CopyStatus;

const STALE_MS = 24 * 3600 * 1000;


function exportCsv(rows: CopyRequest[], sourceByUser: Map<string, Agent | null>) {
  const header = ['Submitted', 'Status', 'Signal', 'Name', 'Email', 'Source', 'Contact', 'Platform', 'Broker', 'Account no.', 'Capital', 'Message', 'Admin note'];
  downloadCsv(
    `copy-applications-${new Date().toISOString().slice(0, 10)}.csv`,
    header,
    rows.map((r) => [r.created_at, STATUS_META[r.status].label, r.master_account, r.contact_name, r.email, sourceName(sourceByUser.get(r.user_id)), r.contact, r.platform, r.broker, r.account_number, r.capital, r.message, r.admin_note]),
  );
  logActivity('export', 'copy_requests', 'Copy applications CSV', { rows: rows.length });
}

export function CopyRequestsPanel({
  requests,
  loading,
  error,
  emailById,
  sourceByUser,
  agents,
  onReload,
}: {
  requests: CopyRequest[];
  loading: boolean;
  error: string | null;
  emailById: Map<string, string>;
  sourceByUser: Map<string, Agent | null>;
  agents: Agent[];
  onReload: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  const [signal, setSignal] = useState('');
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<CopyStatus, number>;
    requests.forEach((r) => c[r.status]++);
    return c;
  }, [requests]);

  const signals = useMemo(() => [...new Set(requests.map((r) => r.master_account))].sort(), [requests]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter(
      (r) =>
        (filter === 'all' || (filter === 'open' ? isOpen(r.status) : r.status === filter)) &&
        (!signal || r.master_account === signal) &&
        (!source || (source === 'head' ? !sourceByUser.get(r.user_id) : sourceByUser.get(r.user_id)?.id === source)) &&
        (!q || [r.contact_name, r.email, r.contact, r.broker, r.account_number].some((v) => v.toLowerCase().includes(q))),
    );
  }, [requests, filter, signal, source, sourceByUser, query]);

  const tabs: [Filter, string, number][] = [
    ['open', 'To follow up 待跟進', counts.pending + counts.contacted],
    ...STATUS_ORDER.map((s) => [s, STATUS_META[s].label, counts[s]] as [Filter, string, number]),
    ['all', 'All 全部', requests.length],
  ];

  const selected = requests.find((r) => r.id === selectedId) ?? null;
  const totalCapital = requests.filter((r) => isOpen(r.status)).reduce((sum, r) => sum + (r.capital ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['New 新申請', counts.pending, 'text-amber-300'],
          ['Contacted 已聯絡', counts.contacted, 'text-sky-300'],
          ['Approved 已批准', counts.approved, 'text-emerald-300'],
          ['Open capital 待跟進資金', formatCurrency(totalCapital), 'text-white'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 p-1">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === key ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
            <span className={`rounded px-1.5 text-[10px] tabular-nums ${filter === key ? 'bg-cyan-500/20' : 'bg-slate-800'}`}>{count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, contact 搜尋..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <select
          value={signal}
          onChange={(e) => setSignal(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
        >
          <option value="">All signals 全部信號</option>
          {signals.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Filter by source"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
        >
          <option value="">All sources 全部來源</option>
          <option value="head">{HEAD_OFFICE}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.brand_name}</option>
          ))}
        </select>
        <IconButton label="Export CSV · 匯出" size="md" onClick={() => exportCsv(rows, sourceByUser)} disabled={rows.length === 0}>
          <Download className="h-4 w-4" />
        </IconButton>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <button onClick={onReload} className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Retry 重試</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Inbox className="h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">{requests.length === 0 ? 'No applications yet. 暫時未有申請。' : 'Nothing here. 沒有符合的申請。'}</p>
            {requests.length === 0 && <p className="text-xs text-slate-600">Clients apply with the "Copy this" button on the Signals page.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Applicant 申請人</th>
                  <th className="px-3 py-2.5 font-medium">Signal 信號</th>
                  <th className="px-3 py-2.5 font-medium">Contact 聯絡</th>
                  <th className="px-3 py-2.5 font-medium">Platform 平台</th>
                  <th className="px-3 py-2.5 text-right font-medium">Capital 資金</th>
                  <th className="px-3 py-2.5 font-medium">Status 狀態</th>
                  <th className="px-3 py-2.5 font-medium">Submitted 提交</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {rows.map((r) => {
                  const meta = STATUS_META[r.status];
                  const waiting = r.status === 'pending' && Date.now() - new Date(r.created_at).getTime() > STALE_MS;
                  return (
                    <tr key={r.id} onClick={() => setSelectedId(r.id)} className="cursor-pointer transition-colors hover:bg-slate-700/25">
                      <td className="px-4 py-2">
                        <p className="font-medium text-white">{r.contact_name}</p>
                        <p className="max-w-[200px] truncate text-xs text-slate-500">{r.email}</p>
                        <div className="mt-1"><SourceBadge agent={sourceByUser.get(r.user_id)} /></div>
                      </td>
                      <td className="px-3 py-2 text-cyan-200">{r.master_account}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-slate-300">{r.contact}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {r.platform}
                        {r.broker && <span className="block max-w-[140px] truncate text-xs text-slate-500">{r.broker}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{r.capital === null ? '—' : formatCurrency(r.capital)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${meta.tone}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        {r.admin_note && <p className="mt-1 max-w-[160px] truncate text-[11px] text-slate-500" title={r.admin_note}>{r.admin_note}</p>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        <span className={waiting ? 'font-medium text-amber-300' : 'text-slate-400'}>{timeAgo(r.created_at)}</span>
                        {waiting && <span className="block text-[10px] text-amber-400/80">Waiting over 1 day 超過一天</span>}
                      </td>
                      <td className="pr-4"><ChevronRight className="h-4 w-4 text-slate-600" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <CopyRequestDrawer
          request={selected}
          handlerEmail={selected.handled_by ? emailById.get(selected.handled_by) ?? null : null}
          onClose={() => setSelectedId(null)}
          onChanged={onReload}
        />
      )}
    </div>
  );
}
