import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Briefcase, Check, ClipboardList, Clock, FolderArchive, Handshake, History as HistoryIcon, KeyRound, Landmark, Link2, Loader2, MonitorSmartphone, Radio, RefreshCw, ShieldCheck, Trash2, TrendingUp, UserPlus, UserRoundPlus, Users as UsersIcon, X } from 'lucide-react';
import type { Role } from '@/hooks/useAuth';
import { fetchMembers, updateMember, callAdminUsers, setMemberMultiLogin, type Member } from '@/lib/members';
import { IconButton } from '@/components/IconButton';
import { PinnedTop } from '@/components/PinnedTop';
import { RolePicker, ROLE_DESC, ROLE_OPTIONS } from '@/components/users/RolePicker';
import { AddUserDialog } from '@/components/users/AddUserDialog';
import { ConfirmDialog } from '@/components/users/ConfirmDialog';
import { SetPasswordDialog } from '@/components/users/SetPasswordDialog';
import { formatTime, timeAgo } from '@/lib/format';
import { CopyRequestsPanel } from '@/components/users/CopyRequestsPanel';
import { ClientAccountsDialog } from '@/components/users/ClientAccountsDialog';
import { ActivityLogPanel } from '@/components/users/ActivityLogPanel';
import { AgentsAdminPanel } from '@/components/agents/AgentsAdminPanel';
import { TransferClientDialog } from '@/components/agents/TransferClientDialog';
import { HEAD_OFFICE, SourceBadge } from '@/components/agents/SourceBadge';
import { fetchAgents, type Agent } from '@/lib/agents';
import { useCopyRequests } from '@/hooks/useCopyRequests';
import { isOpen } from '@/lib/copyRequests';

type Confirm = { title: string; message: string; label: string; run: () => Promise<string | null> };

export function Users({ currentUserId, onAccessChanged }: { currentUserId: string; onAccessChanged: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [linking, setLinking] = useState<Member | null>(null);
  const [transferring, setTransferring] = useState<Member | null>(null);
  const [passwordFor, setPasswordFor] = useState<Member | null>(null);
  const [tab, setTab] = useState<'members' | 'requests' | 'agents' | 'activity'>('members');
  const [activityUser, setActivityUser] = useState('');
  const copyRequests = useCopyRequests('admin-copy-requests');
  const openRequests = copyRequests.requests.filter((r) => isOpen(r.status)).length;
  const emailById = useMemo(() => new Map(members.map((m) => [m.user_id, m.email])), [members]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [source, setSource] = useState('');
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const sourceByUser = useMemo(
    () => new Map(members.map((m) => [m.user_id, m.agent_id ? agentById.get(m.agent_id) ?? null : null])),
    [members, agentById],
  );

  const load = useCallback(async () => {
    const [{ members: rows, error }, ag] = await Promise.all([fetchMembers(), fetchAgents()]);
    setMembers(rows);
    setAgents(ag.agents);
    setLoadError(error ?? '');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'active');
  const adminCount = active.filter((m) => m.role === 'admin').length;
  const countOf = (r: Role) => active.filter((m) => m.role === r).length;
  const matchesSource = (m: Member) => !source || (m.role === 'client' && (source === 'head' ? !m.agent_id : m.agent_id === source));
  const shownPending = pending.filter(matchesSource);
  const shownActive = active.filter(matchesSource);
  const clientsOf = (agentId: string | null) => members.filter((m) => m.role === 'client' && (m.agent_id ?? null) === agentId).length;

  const runUpdate = async (m: Member, role: Role, status: 'pending' | 'active') => {
    setBusyId(m.user_id);
    setActionError('');
    const err = await updateMember(m.user_id, role, status);
    setBusyId(null);
    if (err) {
      setActionError(err);
      return err;
    }
    await load();
    if (m.user_id === currentUserId) onAccessChanged();
    return null;
  };

  const toggleMultiLogin = async (m: Member) => {
    const next = !m.allow_multi_login;
    setBusyId(m.user_id);
    setActionError('');
    setMembers((list) => list.map((x) => (x.user_id === m.user_id ? { ...x, allow_multi_login: next } : x)));
    const err = await setMemberMultiLogin(m.user_id, next);
    setBusyId(null);
    if (err) {
      setActionError(err);
      setMembers((list) => list.map((x) => (x.user_id === m.user_id ? { ...x, allow_multi_login: !next } : x)));
    }
  };

  const remove = (m: Member, kind: 'reject' | 'remove') =>
    setConfirm({
      title: kind === 'reject' ? 'Reject this request? 拒絕申請？' : 'Remove this user? 刪除用戶？',
      message: `${m.email} will be deleted and can no longer sign in. 此帳戶會被刪除，不能再登入。`,
      label: kind === 'reject' ? 'Reject 拒絕' : 'Remove 刪除',
      run: async () => {
        const err = await callAdminUsers({ action: 'delete', user_id: m.user_id });
        if (!err) await load();
        return err;
      },
    });

  const changeRole = (m: Member, role: Role) => {
    if (m.user_id === currentUserId && m.role === 'admin') {
      setConfirm({
        title: 'Lower your own permission? 降低自己的權限？',
        message: 'You will lose access to this admin page immediately. 您會即時失去用戶管理權限。',
        label: 'Confirm 確認',
        run: () => runUpdate(m, role, 'active'),
      });
      return;
    }
    runUpdate(m, role, 'active');
  };

  const stats = [
    { label: 'Full admins 全權管理員', value: countOf('admin'), icon: ShieldCheck, tone: 'text-cyan-400 bg-cyan-500/10' },
    { label: 'Traders 交易員', value: countOf('trader'), icon: TrendingUp, tone: 'text-emerald-400 bg-emerald-500/10' },
    { label: 'Clients 客戶', value: countOf('client'), icon: Radio, tone: 'text-amber-300 bg-amber-400/10' },
    { label: 'Finance 出入金', value: countOf('finance'), icon: Landmark, tone: 'text-sky-300 bg-sky-400/10' },
    { label: 'IB Managers IB 管理員', value: countOf('ib_manager'), icon: Briefcase, tone: 'text-orange-300 bg-orange-400/10' },
    { label: 'Account Opening 開戶部', value: countOf('account_opening'), icon: UserRoundPlus, tone: 'text-lime-300 bg-lime-400/10' },
    { label: 'Broker Files 券商檔案部', value: countOf('broker_files'), icon: FolderArchive, tone: 'text-rose-300 bg-rose-400/10' },
    { label: 'Pending 待批准', value: pending.length, icon: Clock, tone: 'text-amber-400 bg-amber-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">User management 用戶管理</h1>
          <p className="mt-1 text-sm text-slate-400">Approve sign-ups, add or remove users and set their permission. 批准申請、增刪用戶及設定權限。</p>
        </div>
        <div className="flex gap-2">
          <IconButton
            label="Refresh · 重新整理"
            size="md"
            onClick={() => {
              load();
              copyRequests.reload();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </IconButton>
          <IconButton label="Add user · 新增用戶" tone="solid" size="md" onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <PinnedTop>
      <div className="flex gap-6 overflow-x-auto border-b border-slate-800">
        {(
          [
            ['members', 'Users 用戶', UsersIcon, members.length],
            ['requests', 'Copy applications 跟單申請', ClipboardList, openRequests],
            ['agents', 'Agents 代理商', Handshake, countOf('agent')],
            ['activity', 'Activity log 操作記錄', HistoryIcon, 0],
          ] as const
        ).map(([key, label, Icon, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
              tab === key ? 'border-cyan-400 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${key === 'requests' ? 'bg-amber-400 text-black' : 'bg-slate-700 text-slate-300'}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      </PinnedTop>

      {tab === 'activity' ? (
        <ActivityLogPanel members={members} actorId={activityUser} onActorChange={setActivityUser} />
      ) : tab === 'agents' ? (
        <AgentsAdminPanel members={members} onMembersChanged={load} />
      ) : tab === 'requests' ? (
        <CopyRequestsPanel requests={copyRequests.requests} loading={copyRequests.loading} error={copyRequests.error} emailById={emailById} sourceByUser={sourceByUser} agents={agents} onReload={copyRequests.reload} />
      ) : (
        <>
          {actionError && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {actionError}
              <IconButton label="Dismiss · 關閉" tone="ghost" onClick={() => setActionError('')}>
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
              <p className="text-sm text-red-300">{loadError}</p>
              <button onClick={load} className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                Retry 重試
              </button>
            </div>
          ) : (
            <>
              {shownPending.length > 0 && (
                <section className="overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.04]">
                  <header className="flex items-center gap-2 border-b border-amber-500/20 px-5 py-3">
                    <Clock className="h-4 w-4 text-amber-400" />
                    <h2 className="text-sm font-semibold text-amber-200">Waiting for approval 待批准申請 ({shownPending.length})</h2>
                  </header>
                  <ul className="divide-y divide-slate-800">
                    {shownPending.map((m) => {
                      const role = pendingRoles[m.user_id] ?? 'client';
                      return (
                        <li key={m.user_id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 font-medium text-white">
                              <span className="truncate">{m.email}</span>
                              <SourceBadge agent={sourceByUser.get(m.user_id)} />
                            </p>
                            <p className="text-xs text-slate-500">
                              Signed up {timeAgo(m.created_at)} · {formatTime(m.created_at)}
                            </p>
                          </div>
                          <RolePicker value={role} onChange={(r) => setPendingRoles((p) => ({ ...p, [m.user_id]: r }))} disabled={busyId === m.user_id} lockedRoles={['agent']} />
                          <div className="flex gap-2">
                            <IconButton label="Approve · 批准" tone="green" onClick={() => runUpdate(m, role, 'active')} disabled={busyId === m.user_id}>
                              {busyId === m.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </IconButton>
                            <IconButton label="Reject · 拒絕" tone="red" onClick={() => remove(m, 'reject')} disabled={busyId === m.user_id}>
                              <X className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-5 py-3">
                  <h2 className="text-sm font-semibold text-white">Active users 已啟用用戶 ({shownActive.length})</h2>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    aria-label="Filter clients by source"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">All users 全部用戶</option>
                    <option value="head">Clients of {HEAD_OFFICE} ({clientsOf(null)})</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        Clients of {a.brand_name} ({clientsOf(a.id)})
                      </option>
                    ))}
                  </select>
                </header>
                <ul className="divide-y divide-slate-700/60">
                  {shownActive.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-500">No clients from this source yet. 此來源暫無客戶。</li>}
                  {shownActive.map((m) => {
                    const isSelf = m.user_id === currentUserId;
                    const lastAdmin = m.role === 'admin' && adminCount <= 1;
                    return (
                      <li key={m.user_id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-700/20 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-sm font-semibold uppercase text-cyan-300">{m.email.charAt(0) || '?'}</div>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-medium text-white">
                              <span className="truncate">{m.email}</span>
                              {isSelf && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">You 您</span>}
                              {m.role === 'client' && <SourceBadge agent={sourceByUser.get(m.user_id)} />}
                            </p>
                            <p className="text-xs text-slate-500">{lastAdmin ? 'Last full admin, cannot be lowered or removed · 最後一位全權管理員' : `Joined ${formatTime(m.created_at)}`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {busyId === m.user_id && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
                          <RolePicker value={m.role} onChange={(r) => changeRole(m, r)} disabled={busyId === m.user_id} lockedRoles={[...(lastAdmin ? (['trader', 'client', 'finance', 'ib_manager', 'account_opening', 'broker_files'] as const) : []), ...(m.role === 'agent' ? [] : (['agent'] as const))]} />
                          <button
                            type="button"
                            role="switch"
                            aria-checked={m.allow_multi_login}
                            onClick={() => void toggleMultiLogin(m)}
                            disabled={busyId === m.user_id}
                            title={m.allow_multi_login ? '允許多部裝置同時登入（即使關閉了多重登入）· Multi-login allowed' : '只可一部裝置登入（跟全局設定）· Follows global setting'}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                              m.allow_multi_login
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                            }`}
                          >
                            <MonitorSmartphone className="h-3.5 w-3.5" />
                            Multi-login {m.allow_multi_login ? 'ON' : 'OFF'}
                          </button>
                          <IconButton
                            label="View activity · 查看操作記錄"
                            onClick={() => {
                              setActivityUser(m.user_id);
                              setTab('activity');
                            }}
                          >
                            <HistoryIcon className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Set new password · 設定新密碼" onClick={() => setPasswordFor(m)}>
                            <KeyRound className="h-3.5 w-3.5" />
                          </IconButton>
                          {m.role === 'client' && (
                            <IconButton label="Transfer to another agent or head office · 轉移" onClick={() => setTransferring(m)}>
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </IconButton>
                          )}
                          {m.role === 'client' && (
                            <IconButton label="Link trading accounts · 連結交易帳戶" onClick={() => setLinking(m)}>
                              <Link2 className="h-3.5 w-3.5" />
                            </IconButton>
                          )}
                          <IconButton
                            label={isSelf ? 'You cannot remove yourself · 不能刪除自己' : lastAdmin ? 'At least one full admin must remain · 須保留一位全權管理員' : 'Remove user · 刪除用戶'}
                            tone="red"
                            onClick={() => remove(m, 'remove')}
                            disabled={isSelf || lastAdmin}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ROLE_OPTIONS.map(({ value, short, icon: Icon }) => (
                  <div key={value} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Icon className="h-4 w-4 text-slate-400" />
                      {short}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{ROLE_DESC[value]}</p>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}

      {linking && <ClientAccountsDialog userId={linking.user_id} email={linking.email} onClose={() => setLinking(null)} />}
      {transferring && <TransferClientDialog member={transferring} agents={agents} onClose={() => setTransferring(null)} onDone={load} />}
      {passwordFor && <SetPasswordDialog member={passwordFor} isSelf={passwordFor.user_id === currentUserId} onClose={() => setPasswordFor(null)} />}
      {adding && <AddUserDialog onClose={() => setAdding(false)} onCreated={load} />}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} onConfirm={confirm.run} onClose={() => setConfirm(null)} />}
    </div>
  );
}
