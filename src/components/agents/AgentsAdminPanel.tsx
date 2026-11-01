import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Handshake, Inbox, Loader2, MapPin, Pause, Play, Phone, Users, X } from 'lucide-react';
import { BrandMark } from '@/components/agents/BrandMark';
import { PermissionToggles } from '@/components/agents/PermissionToggles';
import { ApplicationReviewDialog } from '@/components/agents/ApplicationReviewDialog';
import { AssignClientsDialog } from '@/components/agents/AssignClientsDialog';
import { brandLink, fetchAgents, fetchAllApplications, updateAgentSettings, type Agent, type AgentApplication, type AgentPermissions } from '@/lib/agents';
import type { Member } from '@/lib/members';
import { timeAgo } from '@/lib/format';
import { Hint, IconButton } from '@/components/IconButton';
import { useNotice } from '@/hooks/useConfirm';

const permsOf = (a: Agent): AgentPermissions => ({ viewTrades: a.perm_view_trades, viewActivity: a.perm_view_activity, clientSignup: a.perm_client_signup, manageClients: a.perm_manage_clients, installTerminals: a.perm_install_terminals });

export function AgentsAdminPanel({ members, onMembersChanged }: { members: Member[]; onMembersChanged: () => Promise<void> }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [apps, setApps] = useState<AgentApplication[]>([]);
  const notify = useNotice();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [review, setReview] = useState<{ app: AgentApplication; mode: 'approve' | 'reject' } | null>(null);
  const [assigning, setAssigning] = useState<Agent | null>(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetchAgents(), fetchAllApplications()]);
    setAgents(a.agents);
    setApps(b.apps);
    setError(a.error ?? b.error ?? '');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (agent: Agent, status: Agent['status'], perms: AgentPermissions) => {
    setBusyId(agent.id);
    setError('');
    const err = await updateAgentSettings(agent, status, perms);
    if (err) setError(err);
    else await load();
    setBusyId('');
  };

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(brandLink(slug));
      setCopied(slug);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      void notify('Your browser blocked copying. Please copy it manually below. 瀏覽器不允許自動複製，請手動複製。', { title: 'Copy manually · 手動複製', copyValue: brandLink(slug) });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
      </div>
    );
  }

  const pendingApps = apps.filter((a) => a.status === 'pending');
  const handledApps = apps.filter((a) => a.status !== 'pending').slice(0, 10);
  const clientCount = (id: string) => members.filter((m) => m.agent_id === id).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <IconButton label="Dismiss · 關閉" tone="ghost" onClick={() => setError('')}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-amber-500/20 bg-slate-800/50">
        <header className="flex items-center gap-2 border-b border-slate-700 px-5 py-3">
          <Inbox className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-white">Agent applications 代理商申請 ({pendingApps.length})</h2>
        </header>
        {pendingApps.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No applications waiting. 暫無待審申請。</p>
        ) : (
          <ul className="divide-y divide-slate-700/60">
            {pendingApps.map((a) => (
              <li key={a.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {a.brand_name} <span className="ml-1 text-xs font-normal text-slate-500">/a/{a.desired_slug}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {a.email} · {a.contact_name} · {timeAgo(a.created_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {a.contact}</span>
                    {a.region && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.region}</span>}
                    {a.expected_clients !== null && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> ~{a.expected_clients}</span>}
                  </div>
                  {a.message && <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-900/60 px-3 py-2 text-sm leading-relaxed text-slate-300">{a.message}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <IconButton label="Reject · 拒絕" tone="red" onClick={() => setReview({ app: a, mode: 'reject' })}>
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label="Review & approve · 審批" tone="green" onClick={() => setReview({ app: a, mode: 'approve' })}>
                    <Check className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50">
        <header className="flex items-center gap-2 border-b border-slate-700 px-5 py-3">
          <Handshake className="h-4 w-4 text-teal-300" />
          <h2 className="text-sm font-semibold text-white">Agents 代理商 ({agents.length})</h2>
        </header>
        {agents.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No agents yet. Approved applications appear here. 尚未有代理商。</p>
        ) : (
          <ul className="divide-y divide-slate-700/60">
            {agents.map((agent) => {
              const busy = busyId === agent.id;
              const active = agent.status === 'active';
              return (
                <li key={agent.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <BrandMark brand={agent} className="h-10 w-10" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-semibold text-white">
                          <span className="truncate">{agent.brand_name}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{active ? 'Active' : 'Suspended'}</span>
                        </p>
                        <p className="truncate text-xs text-slate-500">/a/{agent.slug} · {members.find((m) => m.user_id === agent.user_id)?.email ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-teal-400" />}
                      <Hint label={`Manage ${clientCount(agent.id)} clients · 管理客戶`}>
                        <button onClick={() => setAssigning(agent)} aria-label="Manage clients" className="flex h-7 items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs font-medium tabular-nums text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300">
                          <Users className="h-3.5 w-3.5" /> {clientCount(agent.id)}
                        </button>
                      </Hint>
                      <IconButton label={copied === agent.slug ? 'Copied · 已複製' : 'Copy login link · 複製登入連結'} onClick={() => copy(agent.slug)}>
                        {copied === agent.slug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </IconButton>
                      <Hint label="Open login page · 開啟登入頁">
                        <a href={brandLink(agent.slug)} target="_blank" rel="noopener noreferrer" aria-label="Open login page" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Hint>
                      <IconButton
                        label={active ? 'Suspend agent · 暫停代理商' : 'Activate agent · 啟用代理商'}
                        tone={active ? 'amber' : 'green'}
                        onClick={() => update(agent, active ? 'suspended' : 'active', permsOf(agent))}
                        disabled={busy}
                      >
                        {active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </IconButton>
                    </div>
                  </div>
                  <PermissionToggles compact value={permsOf(agent)} disabled={busy} onChange={(p) => update(agent, agent.status, p)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {handledApps.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40">
          <h2 className="border-b border-slate-800 px-5 py-3 text-sm font-semibold text-slate-300">Recently handled 最近處理</h2>
          <ul className="divide-y divide-slate-800">
            {handledApps.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 truncate text-slate-300">
                  {a.brand_name} <span className="text-slate-500">· {a.email}</span>
                </span>
                <span className={`shrink-0 text-xs ${a.status === 'approved' ? 'text-emerald-300' : 'text-slate-500'}`}>{a.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review && (
        <ApplicationReviewDialog
          app={review.app}
          mode={review.mode}
          onClose={() => setReview(null)}
          onDone={() => {
            load();
            onMembersChanged();
          }}
        />
      )}
      {assigning && <AssignClientsDialog agent={assigning} agents={agents} members={members} onClose={() => setAssigning(null)} onChanged={onMembersChanged} />}
    </div>
  );
}
