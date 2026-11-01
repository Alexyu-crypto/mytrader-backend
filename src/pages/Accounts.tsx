import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { useAccounts } from '@/hooks/useRealtime';
import { useConfirm, useNotice, type Notify } from '@/hooks/useConfirm';
import { PinnedTop } from '@/components/PinnedTop';
import type { Account } from '@/lib/types';
import { X, Download, Plus, Trash2, Edit3, CheckCircle2, User, Hash, Server, Copy, Globe, Lock, Loader2, Upload, FileDown, KeyRound, Eye, EyeOff, Monitor, Search, Archive, ShieldAlert, BookOpen, ArrowUp, ArrowDown, ArrowUpDown, Cloud, Power, PowerOff } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { MAX_IP_LENGTH, MAX_PASSWORD_LENGTH, fetchAccountAccess, fetchAccountIps, saveAccountPasswords, type LoginIp } from '@/lib/accountCredentials';
import { connectMetaApi, suspendMetaApi } from '@/lib/metaapi';
import { isOnline as seenRecently, timeAgo } from '@/lib/format';
import { serverNow } from '@/lib/serverClock';
import { ACCOUNT_NAME_PATTERN, MAX_ACCOUNT_NAME_LENGTH, buildAccountName, exportAccountsCsv, toBrokerShort, toInitials } from '@/lib/accountImport';
import { BulkImportDialog } from '@/components/accounts/BulkImportDialog';
import { AccountArchiveDialog } from '@/components/accounts/AccountArchiveDialog';
import { ARCHIVE_STATUSES, MARKED_STATUSES } from '@/lib/accountArchive';
import type { ArchiveStatus, ConnectionMethod } from '@/lib/types';
import { CONNECTION_METHODS, ConnectionBadge } from '@/components/ConnectionBadge';
import { FollowMasterSection } from '@/components/accounts/FollowMasterSection';
import { RoleChangePanel, renamedForRole, roleChangeError, useRoleLinks } from '@/components/accounts/RoleChangePanel';
import { DEFAULT_PAIR_VALUES, pairValuesError, type PairValues } from '@/lib/copyGroupImport';
import { ScrollRows } from '@/components/ScrollRows';
import { fetchBridgeKey } from '@/lib/bridgeKeys';
import { loadServerChoices, type ServerChoice } from '@/lib/brokerFiles';
import { ServerSearch } from '@/components/metaapi/ServerSearch';

function escapeMqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function downloadCustomizedEA(platform: string, accountLabel: string | null, downloadName: string, notify: Notify) {
  const fileName = platform === 'MT4' ? 'MT4LiveBridge.mq4' : 'MT5LiveBridge.mq5';
  try {
    const response = await fetch(`/downloads/${fileName}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const template = await response.text();
    if (!template.includes('input string AccountLabel')) throw new Error('EA template not found');

    const bridgeKey = accountLabel ? await fetchBridgeKey(accountLabel) : null;
    if (accountLabel && !bridgeKey) {
      void notify('Could not load the secret key for this account. Only Trader/Admin can download a ready-to-use EA. 未能取得此帳戶的密鑰，只有 Trader / Admin 可下載。', { title: 'Download blocked · 未能下載' });
      return;
    }

    const customized = template
      .replace(
        /input string AccountLabel\s*=\s*"[^"]*";/,
        `input string AccountLabel    = "${accountLabel ? escapeMqlString(accountLabel) : 'CHANGE_ME'}";`
      )
      .replace(
        /input string SupabaseUrl\s*=\s*"[^"]*";/,
        `input string SupabaseUrl     = "${escapeMqlString(supabaseUrl)}";`
      )
      .replace(
        /input string SupabaseKey\s*=\s*"[^"]*";/,
        `input string SupabaseKey     = "${escapeMqlString(supabaseAnonKey)}";`
      )
      .replace(
        /input string BridgeKey\s*=\s*"[^"]*";/,
        `input string BridgeKey       = "${bridgeKey ? escapeMqlString(bridgeKey) : 'CHANGE_ME'}";`
      );

    const downloadUrl = URL.createObjectURL(new Blob([customized], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = downloadName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
  } catch (err) {
    console.error('EA download failed', err);
    void notify('Download failed. Please try again. 下載失敗，請再試。', { title: 'Download failed · 下載失敗' });
  }
}


type AccountSortKey = 'name' | 'broker' | 'ip' | 'platform' | 'status' | 'report';

function SortTh({ label, sortKey, active, direction, onSort, align = 'left' }: {
  label: string;
  sortKey: AccountSortKey;
  active: AccountSortKey;
  direction: 'asc' | 'desc';
  onSort: (key: AccountSortKey) => void;
  align?: 'left' | 'center';
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`text-${align} px-3 py-2.5 font-medium whitespace-nowrap`} aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)} className={`inline-flex items-center gap-1.5 uppercase transition-colors hover:text-white ${isActive ? 'text-cyan-400' : ''}`}>
        {label}
        <Icon className={`w-3 h-3 ${isActive ? '' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

export type AccountPrefill = { holderName: string; accountNumber: string; broker: string; platform: 'MT4' | 'MT5' };

export function Accounts({ canEdit, prefill, onPrefillUsed }: { canEdit: boolean; prefill?: AccountPrefill | null; onPrefillUsed?: () => void }) {
  const { accounts, loading, reload } = useAccounts();
  const confirmAsk = useConfirm();
  const notify = useNotice();
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [modalPrefill, setModalPrefill] = useState<AccountPrefill | null>(null);

  useEffect(() => {
    if (!prefill || !canEdit) return;
    setEditingAccount(null);
    setModalPrefill(prefill);
    setShowModal(true);
    onPrefillUsed?.();
  }, [prefill, canEdit, onPrefillUsed]);
  const [showInstructions, setShowInstructions] = useState<Account | null>(null);
  const [renamedFrom, setRenamedFrom] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingReportId, setSavingReportId] = useState<string | null>(null);
  const [powerBusyId, setPowerBusyId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const archiveAccount = archiveId ? accounts.find((a) => a.id === archiveId) ?? null : null;
  const [ips, setIps] = useState<Record<string, LoginIp>>({});
  const [ipsVersion, setIpsVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveStatus | 'all'>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const [sortKey, setSortKey] = useState<AccountSortKey>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleSort = (key: AccountSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'status' || key === 'report' ? 'desc' : 'asc');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== '/' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const archiveCounts = useMemo(() => {
    const m: Record<string, number> = { all: 0 };
    for (const s of MARKED_STATUSES) m[s] = 0;
    for (const a of accounts) {
      if (!a.frozen) continue;
      m.all++;
      m[a.archive_status] = (m[a.archive_status] || 0) + 1;
    }
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const isOnline = (a: Account) => seenRecently(a);
    const text = (v: string | null | undefined) => (v ?? '').toLowerCase();
    const sortValue = (a: Account): string | number => {
      switch (sortKey) {
        case 'name': return text(a.account_name);
        case 'broker': return text(a.broker);
        case 'ip': return text(ips[a.id]?.ip) || '\uffff';
        case 'platform': return `${a.platform}-${a.type}-${a.connection_method}`;
        case 'status': return Number(isOnline(a));
        case 'report': return Number(!!a.report_public);
      }
    };
    const sign = sortDir === 'asc' ? 1 : -1;
    const base = accounts
      .filter((a) => {
        if (!showArchived) return !a.frozen;
        if (archiveFilter === 'all') return a.frozen;
        return a.archive_status === archiveFilter;
      })
      .sort((a, b) => {
        const va = sortValue(a);
        const vb = sortValue(b);
        const cmp = typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp * sign;
        return Number(isOnline(b)) - Number(isOnline(a));
      });
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return base;
    return base.filter((a) => {
      const online = isOnline(a);
      const haystack = [
        a.account_name,
        a.broker,
        a.broker_server,
        a.platform,
        a.type,
        a.connection_method === 'metaapi' ? 'metaapi meta api' : 'ea installer',
        online ? 'online' : 'offline',
        a.report_public ? 'public' : 'members',
        a.frozen ? `${a.archive_status} ${ARCHIVE_STATUSES[a.archive_status].label} frozen` : null,
        ips[a.id]?.ip,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [accounts, query, ips, showArchived, archiveFilter, sortKey, sortDir, now]);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    fetchAccountIps().then((res) => {
      if (!cancelled && res) setIps(res);
    });
    return () => {
      cancelled = true;
    };
  }, [canEdit, ipsVersion]);

  const toggleReportPublic = async (account: Account) => {
    setSavingReportId(account.id);
    const { error } = await supabase.from('accounts').update({ report_public: !account.report_public }).eq('id', account.id);
    setSavingReportId(null);
    if (error) {
      void notify(`Could not change report access for "${account.account_name}". 未能更改報告權限，請再試。`);
      return;
    }
    reload();
  };

  const openAdd = () => {
    setEditingAccount(null);
    setModalPrefill(null);
    setShowModal(true);
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    setModalPrefill(null);
    setShowModal(true);
  };

  const toggleCloudPower = async (account: Account) => {
    const running = isCloudRunning(account);
    const ask = running
      ? `暫停 "${account.account_name}" 嘅 MetaApi 雲端？\n暫停後唔會再收費，但呢個帳戶會離線，亦唔會再跟單或者同步持倉。\n\nSuspend the MetaApi cloud for this account? Billing stops, but the account goes offline and stops copying and syncing.`
      : `重新啟動 "${account.account_name}" 嘅 MetaApi 雲端？\n啟動後會再開始收費，大約一至兩分鐘後上線。\n\nDeploy the MetaApi cloud again? Billing resumes and it comes online in a minute or two.`;
    if (!(await confirmAsk(ask, running ? { tone: 'warning', title: 'Suspend cloud · 暫停雲端', confirmLabel: 'Suspend · 暫停' } : { tone: 'info', title: 'Deploy cloud · 啟動雲端', confirmLabel: 'Deploy · 啟動' }))) return;
    setPowerBusyId(account.id);
    const error = running ? await suspendMetaApi(account.id) : (await connectMetaApi(account.id)).error;
    setPowerBusyId(null);
    if (error) void notify(`${account.account_name}: ${error}`, { title: running ? 'Could not suspend · 未能暫停' : 'Could not deploy · 未能啟動' });
    reload();
  };

  const handleDelete = async (account: Account) => {
    if (account.frozen) {
      void notify(`"${account.account_name}" is marked "${ARCHIVE_STATUSES[account.archive_status].label}" and its records are protected. Set it back to normal in Archive first. 此帳戶紀錄受保護，請先於存檔恢復正常。`, { tone: 'warning', title: 'Records protected · 紀錄受保護' });
      return;
    }
    if (!(await confirmAsk(`Delete account "${account.account_name}"? This will NOT delete live positions or history.`, { tone: 'danger', confirmLabel: 'Delete · 刪除' }))) return;
    const { error } = await supabase.from('accounts').delete().eq('id', account.id);
    if (error) {
      void notify(`Could not delete "${account.account_name}". Remove its copy settings and wait for its EA to stop first.
未能刪除，請先移除跟單設定並等 EA 停止。`, { title: 'Could not delete · 未能刪除' });
      return;
    }
    reload();
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      setTimeout(() => setCopiedId((id) => (id === key ? null : id)), 1500);
    } catch {
      void notify('Your browser blocked copying. Please copy it manually below. 瀏覽器不允許自動複製，請手動複製。', { title: 'Copy manually · 手動複製', copyValue: value });
    }
  };

  const handleDownloadEA = (account: Account | null) => {
    const platform = account?.platform || 'MT4';
    const ext = platform === 'MT4' ? 'mq4' : 'mq5';
    const label = account?.account_name || null;
    const downloadName = label ? `${label}-${platform}LiveBridge.${ext}` : `${platform}-LiveBridge.${ext}`;
    return downloadCustomizedEA(platform, label, downloadName, notify);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">MT4/MT5 Accounts</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your trading accounts and download EA bridge files</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Export CSV · 匯出" size="md" onClick={() => exportAccountsCsv(filtered)} disabled={filtered.length === 0}>
            <FileDown className="w-4 h-4" />
          </IconButton>
          {canEdit && (
            <>
              <IconButton label="Bulk import · 批量開戶" tone="cyan" size="md" onClick={() => setShowImport(true)}>
                <Upload className="w-4 h-4" />
              </IconButton>
              <IconButton label="Add new account · 新增帳戶" tone="solid" size="md" onClick={openAdd}>
                <Plus className="w-4 h-4" />
              </IconButton>
            </>
          )}
        </div>
      </div>

      {/* EA Downloads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Download className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">MT4 EA Bridge</h3>
              <p className="text-slate-500 text-xs">Pre-configured with Supabase connection</p>
            </div>
            <IconButton label="Download MT4 EA · 下載" size="md" onClick={() => handleDownloadEA(null)}>
              <Download className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Download className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">MT5 EA Bridge</h3>
              <p className="text-slate-500 text-xs">MetaTrader 5 Expert Advisor</p>
            </div>
            <IconButton label="Download MT5 EA · 下載" size="md" onClick={() => handleDownloadEA({ ...({} as Account), platform: 'MT5' })}>
              <Download className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      {loading ? (
        <div className="text-slate-400 text-center py-8">Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="text-slate-500 text-center py-12 border border-dashed border-slate-700 rounded-xl">
          No accounts yet. Click the + button to get started.
        </div>
      ) : (
        <div className="space-y-3">
        <PinnedTop>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder={`Search accounts 搜尋 — name, number, broker, server, ${canEdit ? 'IP, ' : ''}MT4/MT5, master/follower, online...`}
            className="w-full bg-slate-800/50 border border-slate-700 text-white placeholder:text-slate-500 rounded-xl pl-10 pr-20 py-2.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all [&::-webkit-search-cancel-button]:hidden"
          />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {query ? (
                <IconButton
                  label="Clear search · 清除搜尋"
                  tone="ghost"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                >
                  <X className="w-4 h-4" />
                </IconButton>
              ) : (
                <kbd className="hidden sm:inline px-1.5 py-0.5 rounded border border-slate-600 text-slate-500 text-[11px] font-mono">/</kbd>
              )}
            </div>
          </div>
          {archiveCounts.all > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setShowArchived((v) => !v); setQuery(''); setArchiveFilter('all'); }}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all ${
                  showArchived
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:text-white hover:border-slate-600'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden sm:inline">{showArchived ? 'Active 正常' : 'Archived 存檔'}</span>
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 rounded-full px-1.5 text-xs font-bold ${
                  showArchived ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-700 text-slate-300'
                }`}>{archiveCounts.all}</span>
              </button>
              {showArchived && MARKED_STATUSES.filter((s) => archiveCounts[s] > 0).length > 1 && (
                <div className="flex items-center gap-1">
                  {([['all', 'All 全部', 'bg-slate-600 text-white', 'bg-slate-700/60 text-slate-400 hover:text-white'] as const,
                    ...MARKED_STATUSES.filter((s) => archiveCounts[s] > 0).map((s) => {
                      const st = ARCHIVE_STATUSES[s];
                      return [s, st.short, st.badge, `border-slate-700 bg-slate-800/50 text-slate-400 hover:text-white`] as const;
                    }),
                  ] as const).map(([key, label, activeCls, inactiveCls]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setArchiveFilter(key)}
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                        archiveFilter === key
                          ? `border-transparent ${activeCls}`
                          : `border-slate-700/50 ${inactiveCls}`
                      }`}
                    >
                      {label}
                      <span className="opacity-70">{key === 'all' ? archiveCounts.all : archiveCounts[key]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </PinnedTop>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <ScrollRows rows={20}>
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                  <SortTh label="Account Name" sortKey="name" active={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortTh label="Broker" sortKey="broker" active={sortKey} direction={sortDir} onSort={handleSort} />
                  {canEdit && <SortTh label="Login IP" sortKey="ip" active={sortKey} direction={sortDir} onSort={handleSort} />}
                  <SortTh label="Platform / Type / Link" sortKey="platform" active={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortTh label="Status" sortKey="status" active={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortTh label="Report" sortKey="report" active={sortKey} direction={sortDir} onSort={handleSort} align="center" />
                  <th className="text-right px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 7 : 6} className="px-4 py-10 text-center text-slate-500">
                      {query.trim()
                        ? <>No accounts match "<span className="text-slate-300">{query.trim()}</span>". 找不到符合的帳戶。</>
                        : showArchived
                          ? 'No archived accounts. 沒有存檔帳戶。'
                          : 'No active accounts. 沒有正常帳戶。'}
                    </td>
                  </tr>
                )}
                {filtered.map((account) => {
                  const online = seenRecently(account);
                  return (
                    <tr key={account.id} className="group border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="px-3 py-2 text-white font-medium">
                        <div className="font-mono text-xs">{account.account_name}</div>
                        {account.frozen && (
                          <button
                            type="button"
                            onClick={() => setArchiveId(account.id)}
                            title={account.frozen_reason ?? ARCHIVE_STATUSES[account.archive_status].label}
                            className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 ${ARCHIVE_STATUSES[account.archive_status].badge}`}
                          >
                            <ShieldAlert className="w-3 h-3" />
                            {ARCHIVE_STATUSES[account.archive_status].short}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        <div>{account.broker || '—'}</div>
                        {account.broker_server && (
                          <button
                            type="button"
                            onClick={() => copyText(account.id, account.broker_server!)}
                            title="Click to copy server name"
                            className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-slate-500 hover:text-cyan-400 transition-colors"
                          >
                            <Server className="w-3 h-3" />
                            {account.broker_server}
                            {copiedId === account.id ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </button>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2">
                          {ips[account.id] ? (
                            <button
                              type="button"
                              onClick={() => copyText(`ip:${account.id}`, ips[account.id].ip)}
                              title={ips[account.id].auto
                                ? `Auto-detected from the EA, checked ${timeAgo(ips[account.id].checkedAt)}. Click to copy.`
                                : 'Entered manually. Click to copy.'}
                              className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300 hover:text-cyan-400 transition-colors whitespace-nowrap"
                            >
                              <Monitor className="w-3.5 h-3.5 text-slate-500" />
                              {ips[account.id].ip}
                              {ips[account.id].auto && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-label="Auto-detected" />}
                              {copiedId === `ip:${account.id}` ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </button>
                          ) : account.connection_method === 'metaapi' ? (
                            <span
                              title="Runs on MetaApi's cloud servers. MetaApi gives no fixed IP unless a dedicated IP is turned on for this account. 於 MetaApi 雲端運行，除非開通專屬 IP，否則沒有固定 IP。"
                              className="inline-flex items-center gap-1.5 text-xs text-sky-300 whitespace-nowrap"
                            >
                              <Cloud className="w-3.5 h-3.5 text-sky-400" />
                              MetaApi{account.metaapi_region ? ` · ${account.metaapi_region}` : ''}
                            </span>
                          ) : (
                            <IconButton label="Add IP · 加入 IP" tone="ghost" onClick={() => openEdit(account)}>
                              <Plus className="w-3.5 h-3.5" />
                            </IconButton>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${account.platform === 'MT4' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {account.platform}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium uppercase ${account.type === 'master' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {account.type}
                          </span>
                          <ConnectionBadge method={account.connection_method} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${online ? 'text-emerald-400' : 'text-slate-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          {online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleReportPublic(account)}
                          aria-label={account.report_public ? 'Report public · 公開' : 'Report members only · 限成員'}
                          disabled={!canEdit || savingReportId === account.id}
                          title={account.report_public
                            ? 'Anyone with the link can view. Click to make members-only. 任何人有連結都可看'
                            : 'Only signed-in members can view. Click to make public. 只限登入成員'}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full border transition-colors disabled:cursor-default ${
                            account.report_public
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 enabled:hover:bg-emerald-500/20'
                              : 'bg-slate-700/50 border-slate-600 text-slate-300 enabled:hover:bg-slate-700'
                          }`}
                        >
                          {savingReportId === account.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : account.report_public ? (
                            <Globe className="w-3.5 h-3.5" />
                          ) : (
                            <Lock className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          {account.connection_method !== 'metaapi' && (
                            <>
                              <IconButton label={`Download ${account.platform} EA · 下載 EA`} tone="ghost" onClick={() => handleDownloadEA(account)}>
                                <Download className="w-3.5 h-3.5" />
                              </IconButton>
                              <IconButton label="Setup guide · 安裝指南" tone="ghost" onClick={() => setShowInstructions(account)}>
                                <BookOpen className="w-3.5 h-3.5" />
                              </IconButton>
                            </>
                          )}
                          <IconButton label="Archive: daily records & evidence · 每日紀錄及證明檔案" tone="ghost" onClick={() => setArchiveId(account.id)}>
                            <Archive className="w-3.5 h-3.5" />
                          </IconButton>
                          {canEdit && account.connection_method === 'metaapi' && account.metaapi_account_id && (
                            <IconButton
                              label={isCloudRunning(account)
                                ? '雲端運行中，撳暫停以停止收費 · Deployed: click to suspend & stop billing'
                                : '雲端已暫停，撳重新啟動 · Suspended: click to deploy'}
                              tone={isCloudRunning(account) ? 'green' : 'amber'}
                              disabled={powerBusyId === account.id}
                              onClick={() => toggleCloudPower(account)}
                            >
                              {powerBusyId === account.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : isCloudRunning(account) ? (
                                <Power className="w-3.5 h-3.5" />
                              ) : (
                                <PowerOff className="w-3.5 h-3.5" />
                              )}
                            </IconButton>
                          )}
                          {canEdit && (
                            <>
                              <IconButton label="Edit · 編輯" tone="ghost" onClick={() => openEdit(account)}>
                                <Edit3 className="w-3.5 h-3.5" />
                              </IconButton>
                              <IconButton
                                label={account.frozen ? 'Protected, cannot delete · 受保護帳戶不能刪除' : 'Delete · 刪除'}
                                tone={account.frozen ? 'ghost' : 'red'}
                                onClick={() => handleDelete(account)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </IconButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRows>
          <div className="px-4 py-2.5 border-t border-slate-700 text-xs text-slate-400">
            {query.trim() ? `${filtered.length} of ${accounts.length} accounts` : `${accounts.length} accounts`}
          </div>
        </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <AccountModal
          account={editingAccount}
          prefill={modalPrefill}
          masters={accounts.filter((a) => a.type === 'master').map((a) => a.account_name).sort()}
          knownServers={knownServersOf(accounts)}
          onClose={() => setShowModal(false)}
          onSaved={(acc, renamedFrom) => {
            setShowModal(false);
            if (acc.connection_method !== 'metaapi') setShowInstructions(acc);
            else if (!acc.metaapi_account_id) {
              connectMetaApi(acc.id).then(({ error }) => {
                if (error) void notify(`${acc.account_name}: ${error}\n可以稍後喺「Meta API 監察」頁撳「連線」再試。You can retry from the MetaApi Monitor page.`, { title: 'Cloud not connected · 雲端未連線' });
              });
            }
            setRenamedFrom(renamedFrom ?? null);
            reload();
            setIpsVersion((v) => v + 1);
          }}
        />
      )}

      {showImport && (
        <BulkImportDialog
          existingNames={new Set(accounts.map((a) => a.account_name))}
          existingMasters={new Set(accounts.filter((a) => a.type === 'master').map((a) => a.account_name))}
          onClose={() => setShowImport(false)}
          onDone={reload}
        />
      )}

      {archiveAccount && (
        <AccountArchiveDialog account={archiveAccount} canEdit={canEdit} onClose={() => setArchiveId(null)} onChanged={reload} />
      )}

      {/* Instructions Modal */}
      {showInstructions && (
        <InstructionsModal account={showInstructions} renamedFrom={renamedFrom} onClose={() => setShowInstructions(null)} />
      )}
    </div>
  );
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function serversFor(known: ServerChoice[], platform: 'MT4' | 'MT5', broker: string) {
  const b = squash(broker);
  return known.filter((s) => {
    if (s.platform !== platform) return false;
    if (!b) return true;
    const sb = squash(s.broker);
    return squash(s.server).includes(b) || (!!sb && (sb.includes(b) || b.includes(sb)));
  });
}

function uniqueServers(list: ServerChoice[]) {
  const byServer = new Map<string, ServerChoice>();
  for (const s of list) {
    const server = s.server.trim();
    const key = `${s.platform}|${server.toLowerCase()}`;
    if (server && !byServer.has(key)) byServer.set(key, { ...s, server });
  }
  return [...byServer.values()].sort((x, y) => x.server.localeCompare(y.server));
}

function isCloudRunning(account: Account) {
  return account.metaapi_state === 'DEPLOYED' || account.metaapi_state === 'DEPLOYING';
}

function knownServersOf(accounts: Account[]) {
  return uniqueServers(accounts.map((a) => ({ platform: a.platform, broker: a.broker, server: a.broker_server ?? '' })));
}

function AccountModal({
  account,
  prefill,
  masters,
  knownServers,
  onClose,
  onSaved,
}: {
  account: Account | null;
  prefill: AccountPrefill | null;
  masters: string[];
  knownServers: ServerChoice[];
  onClose: () => void;
  onSaved: (acc: Account, renamedFrom?: string) => void;
}) {
  const isEdit = !!account;
  const ask = useConfirm();
  const notify = useNotice();
  const roleLinks = useRoleLinks(account);
  const [removeLinks, setRemoveLinks] = useState(false);

  const [holderName, setHolderName] = useState(prefill?.holderName ?? '');
  const [accountNumber, setAccountNumber] = useState(prefill?.accountNumber ?? '');
  const [broker, setBroker] = useState(account?.broker || prefill?.broker || '');
  const [brokerServer, setBrokerServer] = useState(account?.broker_server || '');
  const [platform, setPlatform] = useState<'MT4' | 'MT5'>(account?.platform || prefill?.platform || 'MT4');
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>(account?.connection_method || (prefill ? 'metaapi' : 'ea'));
  const [metaapiId, setMetaapiId] = useState(account?.metaapi_account_id || '');
  const [libraryServers, setLibraryServers] = useState<ServerChoice[]>([]);
  const [libraryError, setLibraryError] = useState('');
  useEffect(() => {
    let live = true;
    loadServerChoices()
      .then((list) => { if (live) setLibraryServers(list); })
      .catch((e: Error) => { if (live) setLibraryError(e.message); });
    return () => { live = false; };
  }, []);
  const allServers = useMemo(() => uniqueServers([...knownServers, ...libraryServers]), [knownServers, libraryServers]);
  const serverChoices = useMemo(() => serversFor(allServers, platform, broker), [allServers, platform, broker]);
  const [type, setType] = useState<'master' | 'follower'>(account?.type || (prefill ? 'follower' : 'master'));
  const [password, setPassword] = useState('');
  const [masterAccount, setMasterAccount] = useState('');
  const [pairValues, setPairValues] = useState<PairValues>({ ...DEFAULT_PAIR_VALUES });
  const [ipAddress, setIpAddress] = useState('');
  const [detectedIp, setDetectedIp] = useState<{ ip: string; at: string | null } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(isEdit);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    fetchAccountAccess(account.id).then((res) => {
      if (cancelled) return;
      setPassword(res.password);
      setIpAddress(res.ip_address);
      if (res.detected_ip) setDetectedIp({ ip: res.detected_ip, at: res.detected_ip_at });
      setLoadingPassword(false);
      if (res.error) setError('Could not load the saved password. 未能載入密碼。');
    });
    return () => {
      cancelled = true;
    };
  }, [account]);

  const storePassword = async (accountId: string) => {
    if (await saveAccountPasswords([{ account_id: accountId, password, ip_address: ipAddress }])) return;
    void notify('The account was saved, but the password / IP address could not be saved. Please edit the account and try again. 帳戶已儲存，但密碼 / IP 未能儲存，請再編輯一次。', { tone: 'warning', title: 'Partly saved · 部分未儲存' });
  };

  const holderShort = toInitials(holderName);
  const brokerShort = toBrokerShort(broker);
  const accountName = buildAccountName(type, holderName, accountNumber, broker);
  const isComplete = holderName.trim() && accountNumber.trim() && broker.trim();

  const connectionFields = {
    connection_method: connectionMethod,
    metaapi_account_id: connectionMethod === 'metaapi' ? metaapiId.trim().slice(0, 64) || null : null,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isEdit && type === 'follower' && masterAccount) {
      const pairErr = pairValuesError(pairValues);
      if (pairErr) {
        setError(pairErr);
        return;
      }
    }

    if (isEdit) {
      const roleChanged = type !== account.type;
      if (roleChanged && type === 'follower' && (roleLinks?.asMaster ?? 0) > 0) {
        setError(roleChangeError('has_followers'));
        return;
      }
      if (roleChanged && type === 'master' && (roleLinks?.asFollower ?? 0) > 0 && !removeLinks) {
        setError(roleChangeError('has_masters'));
        return;
      }
      if (roleChanged && !(await ask(`Change ${account.account_name} to ${type} and rename it to ${renamedForRole(account.account_name, type)}?\n確認更改角色？`, { tone: 'warning', title: 'Change role · 更改角色', confirmLabel: 'Change · 更改' }))) return;
      setSaving(true);
      if (roleChanged) {
        const { error: roleErr } = await supabase.rpc('change_account_role', { p_account_id: account.id, p_new_type: type, p_remove_links: removeLinks });
        if (roleErr) {
          setSaving(false);
          setError(roleChangeError(roleErr.message));
          return;
        }
      }
      const { data, error: err } = await supabase
        .from('accounts')
        .update({ broker, broker_server: brokerServer.trim() || null, platform, type, ...connectionFields })
        .eq('id', account.id)
        .select('*')
        .single();
      if (!err) await storePassword(account.id);
      setSaving(false);
      if (err) {
        console.error('account save failed', err);
        setError('Could not save this account. Please check the details and try again. 未能儲存此帳戶，請檢查資料後再試。');
        return;
      }
      onSaved(data as Account, roleChanged ? account.account_name : undefined);
      return;
    }

    if (!holderName.trim()) {
      setError('Account holder name is required');
      return;
    }
    if (!accountNumber.trim()) {
      setError('Account number is required');
      return;
    }
    if (!broker.trim()) {
      setError('Broker is required');
      return;
    }
    if (!holderShort) {
      setError('Account holder name must contain English letters (A-Z)');
      return;
    }
    if (!/^[0-9]{3,12}$/.test(accountNumber)) {
      setError('Account number must be 3-12 digits');
      return;
    }
    if (!brokerShort) {
      setError('Broker must contain English letters or digits');
      return;
    }
    if (accountName.length > MAX_ACCOUNT_NAME_LENGTH) {
      setError(`Account name is ${accountName.length} characters; maximum is ${MAX_ACCOUNT_NAME_LENGTH}. Use a shorter broker name.`);
      return;
    }
    if (!ACCOUNT_NAME_PATTERN.test(accountName)) {
      setError('Generated account name contains invalid characters');
      return;
    }

    setSaving(true);
    const { data, error: err } = await supabase
      .from('accounts')
      .insert({ account_name: accountName, broker, broker_server: brokerServer.trim() || null, platform, type, holder_name: holderName.trim().slice(0, 100) || null, ...connectionFields })
      .select('*')
      .single();
    if (!err && data) await storePassword(data.id);
    if (err) {
      setSaving(false);
      console.error('account create failed', err);
      setError('Could not save this account. Please check the details and try again. 未能儲存此帳戶，請檢查資料後再試。');
      return;
    }
    if (type === 'follower' && masterAccount) {
      const { error: pairErr } = await supabase
        .from('copy_settings')
        .insert({ master_account: masterAccount, follower_account: accountName, ...pairValues });
      if (pairErr) {
        console.error('copy pair create failed', pairErr);
        void notify('The account was created, but it could not be linked to the master account. Please add the pair on the Copy Settings page. 帳戶已建立，但未能連結主帳戶，請到跟單設定頁手動加入。', { tone: 'warning', title: 'Not linked · 未連結' });
      }
    }
    setSaving(false);
    onSaved(data as Account);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">{isEdit ? 'Edit Account' : 'Add New MT4/MT5 Account'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Type (Role) */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-1">Account Type (Role)</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('master')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
                  type === 'master'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <span className="font-mono font-bold">M</span>
                Master
              </button>
              <button
                type="button"
                onClick={() => setType('follower')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
                  type === 'follower'
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <span className="font-mono font-bold">F</span>
                Follower
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-sm font-medium mb-1">Connection Method 連線方式</label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(CONNECTION_METHODS) as ConnectionMethod[]).map((m) => {
                const info = CONNECTION_METHODS[m];
                const active = connectionMethod === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setConnectionMethod(m)}
                    aria-pressed={active}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                      active
                        ? m === 'ea' ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'
                        : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <info.Icon className="w-4 h-4" />
                    {info.label}
                  </button>
                );
              })}
            </div>
            <p className="text-slate-500 text-xs mt-1">{CONNECTION_METHODS[connectionMethod].hint}</p>
            {connectionMethod === 'metaapi' && (
              <div className="mt-2">
                <label htmlFor="metaapi-id" className="block text-slate-400 text-xs font-medium mb-1">
                  MetaApi Account ID <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  id="metaapi-id"
                  type="text"
                  value={metaapiId}
                  onChange={(e) => setMetaapiId(e.target.value.trim())}
                  placeholder="e.g. 1a2b3c4d-...."
                  maxLength={64}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            )}
          </div>

          {isEdit && type !== account.type && (
            <RoleChangePanel account={account} newType={type} links={roleLinks} removeLinks={removeLinks} onRemoveLinksChange={setRemoveLinks} />
          )}

          {!isEdit && type === 'follower' && (
            <FollowMasterSection masters={masters} master={masterAccount} onMasterChange={setMasterAccount} values={pairValues} onValuesChange={setPairValues} />
          )}

          {/* Account Holder Name */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-1">Account Holder Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="e.g. Chan Tai Man"
                disabled={isEdit}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
            <p className="text-slate-500 text-xs mt-1">
              Short form: <span className="font-mono text-slate-300">{holderShort || '—'}</span> (auto from initials)
            </p>
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-1">MT4/MT5 Account Number</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\s/g, ''))}
                placeholder="e.g. 12345678"
                disabled={isEdit}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Broker */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-1">Broker</label>
            <input
              type="text"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder="e.g. IC Markets"
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500"
            />
            <p className="text-slate-500 text-xs mt-1">
              Short form: <span className="font-mono text-slate-300">{brokerShort || '—'}</span> (spaces removed)
            </p>
          </div>

          {/* Broker Server (optional, for records only) */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-1">
              Broker Server <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={brokerServer}
                onChange={(e) => setBrokerServer(e.target.value)}
                placeholder="e.g. ICMarkets-Live01"
                maxLength={64}
                list="known-broker-servers"
                autoComplete="off"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:border-cyan-500"
              />
              <datalist id="known-broker-servers">
                {serverChoices.map((s) => (
                  <option key={s.server} value={s.server}>{s.broker}</option>
                ))}
              </datalist>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              {serverChoices.length > 0
                ? `Click or type to pick from ${serverChoices.length} ${platform} server${serverChoices.length === 1 ? '' : 's'} in the broker library${broker.trim() ? ` matching "${broker.trim()}"` : ''}. Not listed? Leave blank and add it later with Edit.`
                : `No ${platform} server${broker.trim() ? ' for this broker' : ''} in the broker library yet. Type it, or leave blank and add it later with Edit.`}
            </p>
            {libraryError && <p className="text-amber-400 text-xs mt-1">{libraryError}</p>}
            <ServerSearch initialQuery={broker} platform={platform} selected={brokerServer} onPick={setBrokerServer} />
          </div>

          {/* VPS / IP address (staff-only) */}
          <div>
            <label htmlFor="account-ip" className="block text-slate-400 text-sm font-medium mb-1">
              VPS / IP Address <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="account-ip"
                type="text"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder={loadingPassword ? 'Loading…' : detectedIp ? `Auto: ${detectedIp.ip}` : 'e.g. 203.0.113.25'}
                disabled={loadingPassword}
                maxLength={MAX_IP_LENGTH}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
            {detectedIp ? (
              <p className="text-xs mt-1 text-slate-500">
                <span className="text-emerald-400">Auto-detected {detectedIp.ip}</span> (checked {timeAgo(detectedIp.at)}). Leave blank to use it; type an IP only to override.
              </p>
            ) : (
              <p className="text-slate-500 text-xs mt-1">Detected automatically once the EA is running (checked hourly). Type an IP only to override.</p>
            )}
          </div>

          {/* MT4/MT5 Password (staff-only) */}
          <div>
            <label htmlFor="account-password" className="block text-slate-400 text-sm font-medium mb-1">
              Password 密碼 <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="account-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={loadingPassword ? 'Loading…' : 'MT4/MT5 login password'}
                disabled={loadingPassword}
                maxLength={MAX_PASSWORD_LENGTH}
                autoComplete="new-password"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-10 py-2.5 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              <Lock className="inline w-3 h-3 mr-1 -mt-0.5" />
              Visible to admins &amp; traders only. 只限管理員及交易員查看。{isEdit && ' Leave blank to keep unchanged.'}
            </p>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as 'MT4' | 'MT5')}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500"
            >
              <option value="MT4">MT4</option>
              <option value="MT5">MT5</option>
            </select>
          </div>

          {/* Auto-generated Account Name Preview */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
            <p className="text-slate-400 text-xs mb-1">Generated Account Name (auto)</p>
            {isComplete || isEdit ? (
              <p className={`font-mono text-sm font-bold ${type === 'master' ? 'text-cyan-400' : 'text-amber-400'}`}>
                {isEdit ? renamedForRole(account!.account_name, type) : accountName}
              </p>
            ) : (
              <p className="font-mono text-sm text-slate-600">Fill in all fields to generate...</p>
            )}
            {!isEdit && accountName.length > MAX_ACCOUNT_NAME_LENGTH && (
              <p className="text-red-400 text-xs mt-1.5">
                {accountName.length}/{MAX_ACCOUNT_NAME_LENGTH} characters — too long, shorten the broker name.
              </p>
            )}
            <p className="text-amber-400/70 text-xs mt-1.5">
              This must exactly match the EA's AccountLabel, including capital letters and hyphens.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || (isEdit && type !== account.type && (!roleLinks || (type === 'follower' && roleLinks.asMaster > 0)))}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InstructionsModal({ account, renamedFrom, onClose }: { account: Account; renamedFrom: string | null; onClose: () => void }) {
  const eaFile = account.platform === 'MT4' ? 'MT4LiveBridge.mq4' : 'MT5LiveBridge.mq5';
  const [urlCopied, setUrlCopied] = useState(false);
  const notify = useNotice();

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(supabaseUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1500);
    } catch {
      void notify('Your browser blocked copying. Please copy it manually below. 瀏覽器不允許自動複製，請手動複製。', { title: 'Copy manually · 手動複製', copyValue: supabaseUrl });
    }
  };

  const handleDownload = () =>
    downloadCustomizedEA(account.platform, account.account_name, `${account.account_name}-${eaFile}`, notify);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Account Created - Setup Guide</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4">
          <p className="text-cyan-300 text-sm">
            Your account name is: <span className="font-mono font-bold">{account.account_name}</span>
          </p>
          <p className="text-slate-400 text-xs mt-1">The AccountLabel is already filled in when you download the customized EA.</p>
        </div>

        {renamedFrom && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4 text-xs leading-relaxed">
            <p className="text-amber-300 font-medium text-sm">Role changed · 角色已更改</p>
            <p className="text-slate-300 mt-1">
              Old name <span className="font-mono">{renamedFrom}</span> no longer works. In MT4/MT5, open the EA settings and change AccountLabel to the new name above, or download the EA again below. 請把 EA 的 AccountLabel 改成新名稱。
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">1</div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">Download the EA file</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Download <span className="font-mono text-cyan-400">{eaFile}</span> for your {account.platform} platform.
              </p>
              <div className="mt-2">
                <IconButton label={`Download ${eaFile} · 下載`} size="md" onClick={handleDownload}>
                  <Download className="w-4 h-4" />
                </IconButton>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">2</div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">Open {account.platform} and install the EA</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Copy the file to your <span className="font-mono">MQL4/Experts</span> (MT4) or <span className="font-mono">MQL5/Experts</span> (MT5) folder.
                In the Navigator panel, refresh Expert Advisors and drag the EA onto a chart.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">3</div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">Verify the pre-filled EA inputs</p>
              <p className="text-slate-400 text-sm mt-0.5">
                The downloaded EA already has <span className="font-mono text-cyan-400">AccountLabel</span>, <span className="font-mono text-cyan-400">SupabaseUrl</span>, <span className="font-mono text-cyan-400">SupabaseKey</span> and this account's secret <span className="font-mono text-cyan-400">BridgeKey</span> filled in. Do not share the file: the BridgeKey lets a terminal act as this account. 檔案已含此帳戶專用密鑰，請勿外傳。
              </p>
              <div className="mt-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-cyan-300 text-sm">
                {account.account_name}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">4</div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">Allow WebRequest for Supabase URL</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Go to <span className="font-mono">Tools → Options → Expert Advisors</span>, tick "Allow WebRequest for listed URL",
                then add this address to the list:
              </p>
              <div className="mt-2 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-1.5 py-1.5">
                <span className="flex-1 font-mono text-xs text-cyan-400 break-all select-all">{supabaseUrl}</span>
                <IconButton label={urlCopied ? 'Copied · 已複製' : 'Copy URL · 複製'} onClick={copyUrl}>
                  {urlCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </IconButton>
              </div>
              <p className="text-slate-500 text-xs mt-1">
                Paste it exactly as shown, starting with https:// and with no slash at the end.
              </p>
              <p className="text-slate-400 text-sm mt-1">
                No manual connection values are required. Confirm the values are present before attaching the EA to your chart.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">5</div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">Enable AutoTrading and verify</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Click the "AutoTrading" button in the toolbar. Check the Experts tab for log messages like
                <span className="font-mono text-emerald-400"> "LiveBridge: Pushed N positions for {account.account_name} HTTP 201"</span>.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-cyan-500 hover:bg-cyan-600 text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
