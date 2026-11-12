import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Copy, Globe2, KeyRound, Link2, Loader2, MapPin, Plug, RefreshCw, Search, Users } from 'lucide-react';
import { LinkMetaApiDialog } from '@/components/metaapi/LinkMetaApiDialog';
import { MoveRegionDialog } from '@/components/metaapi/MoveRegionDialog';
import { useAccounts } from '@/hooks/useRealtime';
import { useNotice } from '@/hooks/useConfirm';
import { formatCurrency, isOnline, timeAgo } from '@/lib/format';
import { connectMetaApiUntilReady, regionLabel, syncMetaApi } from '@/lib/metaapi';
import type { Account } from '@/lib/types';

type Issue = 'no_id' | 'stopped' | 'broker' | 'connecting' | 'offline' | null;

function issueOf(a: Account): Issue {
  if (!a.metaapi_account_id) return 'no_id';
  if (a.metaapi_state && a.metaapi_state !== 'DEPLOYED') return 'stopped';
  if (a.metaapi_connection === 'DISCONNECTED_FROM_BROKER') return 'broker';
  if (a.metaapi_connection === 'DISCONNECTED') return 'connecting';
  return isOnline(a) ? null : 'offline';
}

const ISSUE_LABEL: Record<Exclude<Issue, null>, { text: string; tone: string }> = {
  no_id: { text: '未連線 · Not connected', tone: 'text-amber-300 bg-amber-500/10 ring-amber-500/30' },
  stopped: { text: '已停止 · Stopped', tone: 'text-amber-300 bg-amber-500/10 ring-amber-500/30' },
  broker: { text: '券商拒絕 · Broker refused', tone: 'text-red-300 bg-red-500/10 ring-red-500/30' },
  connecting: { text: '連線中 · Connecting', tone: 'text-sky-300 bg-sky-500/10 ring-sky-500/30' },
  offline: { text: '離線 · Offline', tone: 'text-red-300 bg-red-500/10 ring-red-500/30' },
};

const CONNECT_LABEL: Partial<Record<Exclude<Issue, null>, string>> = {
  no_id: '連線 · Connect',
  stopped: '啟動 · Start',
  broker: '重連 · Retry',
  connecting: '重啟 · Restart',
  offline: '重連 · Retry',
};

export function MetaApiMonitorPage() {
  const { accounts, loading } = useAccounts();
  const notify = useNotice();
  const [query, setQuery] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [moving, setMoving] = useState<Account | null>(null);

  const runSync = useCallback(async () => {
    setSyncing(true);
    const error = await syncMetaApi();
    setSyncing(false);
    setSyncError(error);
    if (!error) setLastSync(new Date().toISOString());
  }, []);

  useEffect(() => {
    runSync();
  }, [runSync]);

  const connect = async (a: Account) => {
    setBusyId(a.id);
    setNotice(null);
    const { error, pending } = await connectMetaApiUntilReady(a.id);
    setBusyId(null);
    if (error) setNotice({ tone: 'error', text: `${a.account_name}: ${error}` });
    else setNotice({ tone: 'ok', text: pending
      ? `${a.account_name}: MetaApi 仍在建立中，稍後再撳一次。 Still being created, press again shortly.`
      : `${a.account_name}: 已送出連線，約 1-2 分鐘內會上線。 Connection started; it should come online in 1-2 minutes.` });
  };

  const metaAccounts = useMemo(() => accounts.filter((a) => a.connection_method === 'metaapi' && !a.frozen), [accounts]);

  const stats = useMemo(() => {
    const online = metaAccounts.filter((a) => !issueOf(a)).length;
    return { total: metaAccounts.length, online, offline: metaAccounts.length - online, noId: metaAccounts.filter((a) => !a.metaapi_account_id).length };
  }, [metaAccounts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return metaAccounts
      .filter((a) => !onlyProblems || issueOf(a))
      .filter((a) => !q || [a.account_name, a.broker, a.broker_server, a.metaapi_account_id, a.platform, a.type].some((v) => (v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => Number(!!issueOf(b)) - Number(!!issueOf(a)) || a.account_name.localeCompare(b.account_name));
  }, [metaAccounts, query, onlyProblems]);

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      void notify('Your browser blocked copying. Please copy it manually below. 瀏覽器不允許自動複製，請手動複製。', { title: 'Copy manually · 手動複製', copyValue: id });
    }
  };

  const cards = [
    { label: 'MetaApi 帳戶', value: stats.total, icon: Users, tone: 'text-sky-300 bg-sky-500/10' },
    { label: '在線 · Online', value: `${stats.online} / ${stats.total}`, icon: Cloud, tone: 'text-emerald-300 bg-emerald-500/10' },
    { label: '離線 · Offline', value: stats.offline, icon: CloudOff, tone: stats.offline ? 'text-red-300 bg-red-500/10' : 'text-slate-400 bg-slate-800' },
    { label: '未連線 · Not connected', value: stats.noId, icon: KeyRound, tone: stats.noId ? 'text-amber-300 bg-amber-500/10' : 'text-slate-400 bg-slate-800' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">MetaApi Monitor · Meta API 監察</h1>
          <p className="text-sm text-slate-400 mt-1">所有經 MetaApi 雲端連線嘅帳戶，即時狀態、餘額同問題提示。每分鐘自動更新。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lastSync && <span className="text-xs text-slate-500">更新於 · Synced {timeAgo(lastSync)}</span>}
          <button type="button" onClick={() => setShowLink(true)} className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-500 transition-colors">
            <Link2 className="w-4 h-4" /> 連結現有帳戶 · Link existing
          </button>
          <button type="button" onClick={runSync} disabled={syncing} className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 disabled:opacity-60 transition-colors">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> 即時更新 · Refresh
          </button>
        </div>
      </div>

      {showLink && (
        <LinkMetaApiDialog
          onClose={() => setShowLink(false)}
          onLinked={() => {
            setShowLink(false);
            setNotice({ tone: 'ok', text: '已連結，正在更新狀態。 Linked; refreshing status now.' });
            runSync();
          }}
        />
      )}

      {moving && (
        <MoveRegionDialog
          account={moving}
          onClose={() => setMoving(null)}
          onMoved={(text) => {
            setMoving(null);
            setNotice({ tone: 'ok', text });
            runSync();
          }}
        />
      )}

      {(syncError || notice) && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${notice?.tone === 'ok' && !syncError ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-red-500/30 bg-red-500/10 text-red-100'}`}>
          {notice?.tone === 'ok' && !syncError ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-300" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-300" />}
          <span>{syncError ?? notice?.text}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center gap-3">
            <span className={`w-10 h-10 rounded-lg grid place-items-center ${c.tone}`}>
              <c.icon className="w-5 h-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className="text-xl font-semibold text-slate-100 tabular-nums">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋帳戶、券商、伺服器或 MetaApi ID…" className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/60" />
        </label>
        <button type="button" onClick={() => setOnlyProblems((v) => !v)} className={`text-sm px-3 py-2 rounded-lg border transition-colors ${onlyProblems ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
          只看有問題 · Problems only
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 載入中 · Loading…
          </div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            <Cloud className="w-8 h-8 mx-auto mb-3 text-slate-600" />
            {metaAccounts.length === 0
              ? <>未有 MetaApi 帳戶。去「Accounts」新增帳戶時揀「MetaApi」。<br />No MetaApi accounts yet. Add one on the Accounts page and pick MetaApi.</>
              : '冇符合嘅帳戶 · No matching accounts'}
          </div>
        ) : (
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                <th className="text-left px-3 py-2.5 font-medium">Account</th>
                <th className="text-left px-3 py-2.5 font-medium">Broker / Server</th>
                <th className="text-left px-3 py-2.5 font-medium">MetaApi ID</th>
                <th className="text-left px-3 py-2.5 font-medium">IP / Location</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-3 py-2.5 font-medium">Balance</th>
                <th className="text-right px-3 py-2.5 font-medium">Equity</th>
                <th className="text-left px-3 py-2.5 font-medium">Last seen</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const issue = issueOf(a);
                const action = issue ? CONNECT_LABEL[issue] : undefined;
                return (
                  <tr key={a.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2">
                      <div className={`font-mono text-xs font-medium ${a.type === 'master' ? 'text-cyan-400' : 'text-amber-400'}`}>{a.account_name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{a.platform} · {a.type === 'master' ? 'Master' : 'Follower'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-300">{a.broker || '—'}</div>
                      <div className="font-mono text-[11px] text-slate-500">{a.broker_server || '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      {a.metaapi_account_id ? (
                        <button type="button" onClick={() => copyId(a.metaapi_account_id!)} title="Click to copy" className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300 hover:text-sky-300 transition-colors">
                          {a.metaapi_account_id.length > 18 ? `${a.metaapi_account_id.slice(0, 8)}…${a.metaapi_account_id.slice(-6)}` : a.metaapi_account_id}
                          {copied === a.metaapi_account_id ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {a.metaapi_ip ? (
                        <button type="button" onClick={() => copyId(a.metaapi_ip!)} title="Click to copy" className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-200 hover:text-sky-300 transition-colors">
                          {a.metaapi_ip}
                          {copied === a.metaapi_ip ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500" title="MetaApi uses a shared IP unless a dedicated IP is purchased">{a.metaapi_account_id ? '共用 IP · Shared' : '—'}</span>
                      )}
                      {a.metaapi_region && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-400">
                          <MapPin className="w-3 h-3 text-sky-400" />
                          {regionLabel(a.metaapi_region)}{a.metaapi_zone ? ` · Zone ${a.metaapi_zone.toUpperCase()}` : ''}
                        </div>
                      )}
                      {a.metaapi_moving_to && <div className="text-[11px] text-sky-300">轉換中 → {regionLabel(a.metaapi_moving_to)}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {issue ? (
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ${ISSUE_LABEL[issue].tone}`}>{ISSUE_LABEL[issue].text}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 在線 · Online
                        </span>
                      )}
                      {a.metaapi_error && <div className="mt-1 max-w-[260px] truncate text-[11px] text-red-300/80" title={a.metaapi_error}>{a.metaapi_error}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-200">{a.last_seen ? formatCurrency(a.balance) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-200">{a.last_seen ? formatCurrency(a.equity) : '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{a.last_seen ? timeAgo(a.last_seen) : '從未連線 · Never'}</td>
                    <td className="px-3 py-2 text-right space-x-2">
                      {a.metaapi_account_id && (
                        <button type="button" onClick={() => setMoving(a)} disabled={busyId !== null} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:border-sky-500/40 hover:text-sky-200 hover:bg-sky-500/10 disabled:opacity-50 transition-colors">
                          <Globe2 className="w-3.5 h-3.5" /> 轉換其他地區
                        </button>
                      )}
                      {action && (
                        <button type="button" onClick={() => connect(a)} disabled={busyId !== null} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-sky-500/40 text-sky-200 hover:bg-sky-500/15 disabled:opacity-50 transition-colors">
                          {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />} {action}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
