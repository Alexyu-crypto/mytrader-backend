import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardList, Copy, ExternalLink, History as HistoryIcon, Loader2, Palette, UserCheck, Users } from 'lucide-react';
import { BrandMark } from '@/components/agents/BrandMark';
import { BrandingEditor } from '@/components/agents/BrandingEditor';
import { AgentClientsList } from '@/components/agents/AgentClientsList';
import { AgentCopyRequests } from '@/components/agents/AgentCopyRequests';
import { ActivityLogPanel } from '@/components/users/ActivityLogPanel';
import { brandLink, fetchAgentClients, fetchOwnAgent, setClientApproval, type Agent, type AgentClient } from '@/lib/agents';
import type { Member } from '@/lib/members';
import { Hint } from '@/components/IconButton';
import { useNotice } from '@/hooks/useConfirm';

type Tab = 'clients' | 'requests' | 'branding' | 'activity';

export function AgentPortal({ userId, onBrandChanged }: { userId: string; onBrandChanged: () => void }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [clients, setClients] = useState<AgentClient[]>([]);
  const notify = useNotice();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('clients');
  const [copied, setCopied] = useState(false);
  const [activityUser, setActivityUser] = useState('');
  const [openRequests, setOpenRequests] = useState(0);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const clientIds = useMemo(() => new Set(clients.map((c) => c.user_id)), [clients]);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([fetchOwnAgent(userId), fetchAgentClients()]);
    setAgent(a.agent);
    setClients(c.clients);
    setError(a.error ?? c.error ?? '');
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }
  if (!agent) {
    return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error || 'Your agent profile could not be found. 找不到您的代理商資料。'}</div>;
  }

  const link = brandLink(agent.slug);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      void notify('Your browser blocked copying. Please copy it manually below. 瀏覽器不允許自動複製，請手動複製。', { title: 'Copy manually · 手動複製', copyValue: link });
    }
  };

  const canManage = agent.perm_manage_clients && agent.status === 'active';
  const toggleApproval = async () => {
    setApprovalBusy(true);
    const err = await setClientApproval(agent.id, !agent.client_approval);
    setApprovalBusy(false);
    if (err) return setError(err);
    load();
  };

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'clients', label: `Clients 客戶 (${clients.length})`, icon: Users },
    ...(canManage ? [{ key: 'requests' as Tab, label: `Copy applications 跟單申請${openRequests ? ` (${openRequests})` : ''}`, icon: ClipboardList }] : []),
    { key: 'branding', label: 'Branding & logo 品牌及 LOGO', icon: Palette },
    ...(agent.perm_view_activity ? [{ key: 'activity' as Tab, label: 'Client activity 客戶操作記錄', icon: HistoryIcon }] : []),
  ];

  const clientMembers: Member[] = clients.map((c) => ({ user_id: c.user_id, email: c.email, role: 'client', status: c.status === 'active' ? 'active' : 'pending', created_at: c.joined_at, agent_id: agent.id, allow_multi_login: false }));

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <BrandMark brand={agent} className="h-14 w-14 text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 translate="no" className="truncate text-2xl font-bold text-white">{agent.brand_name}</h1>
          <p className="text-sm text-slate-400">Agent back office 代理商後台</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${agent.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
          {agent.status === 'active' ? 'Active 啟用中' : 'Suspended 已暫停'}
        </span>
      </header>

      {agent.status !== 'active' && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Your agent account is suspended. Your client login link is offline until it is reactivated. 您的代理商帳戶已暫停，客戶登入連結暫時失效。
        </div>
      )}

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

      <section className="rounded-2xl border p-5" style={{ borderColor: `${agent.brand_color}40`, background: `linear-gradient(135deg, ${agent.brand_color}14, transparent 60%)` }}>
        <p className="text-sm font-semibold text-white">Your client login link 您的客戶專屬登入連結</p>
        <p className="mt-1 text-xs text-slate-400">Share this link. Clients who sign up here are registered under you automatically. 客戶經此連結註冊，會自動登記於您旗下。</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200">{link}</code>
          <div className="flex gap-2">
            <Hint label={copied ? 'Copied · 已複製' : 'Copy link · 複製連結'}>
              <button onClick={copy} aria-label="Copy link" className="flex h-10 w-10 items-center justify-center rounded-lg text-black transition-opacity hover:opacity-90" style={{ backgroundColor: agent.brand_color }}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </Hint>
            <Hint label="Open link · 開啟連結">
              <a href={link} target="_blank" rel="noopener noreferrer" aria-label="Open link" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Hint>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Perm on={agent.perm_client_signup} label="Client sign-up 客戶註冊" />
          <Perm on={agent.perm_view_trades} label="View client trades 查看客戶交易" />
          <Perm on={agent.perm_view_activity} label="View client activity 查看客戶記錄" />
          <Perm on={agent.perm_manage_clients} label="Authorise own clients 自行授權客戶" />
        </div>
        {canManage && (
          <button
            onClick={toggleApproval}
            disabled={approvalBusy}
            className="mt-4 flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left transition-colors hover:border-slate-600 disabled:opacity-60"
          >
            <UserCheck className="h-5 w-5 shrink-0 text-cyan-300" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-white">Approve new clients before they can use the app 新客戶須經我批核</span>
              <span className="block text-xs text-slate-400">{agent.client_approval ? 'On: new sign-ups wait for your approval. 開：新註冊客戶需等待您批核。' : 'Off: new sign-ups are active right away. 關：新客戶註冊後即可使用。'}</span>
            </span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${agent.client_approval ? 'bg-teal-400' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${agent.client_approval ? 'left-4' : 'left-0.5'}`} />
            </span>
          </button>
        )}
      </section>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-slate-800/40 p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === 'clients' && (
        <AgentClientsList
          clients={clients}
          canViewActivity={agent.perm_view_activity}
          canManage={canManage}
          onChanged={load}
          onViewActivity={(id) => {
            setActivityUser(id);
            setTab('activity');
          }}
        />
      )}
      {tab === 'requests' && canManage && <AgentCopyRequests clientIds={clientIds} onCountChange={setOpenRequests} />}
      {tab === 'branding' && (
        <BrandingEditor
          key={`${agent.brand_name}|${agent.tagline}|${agent.contact}|${agent.brand_color}|${agent.logo_path}`}
          agent={agent}
          onSaved={() => {
            load();
            onBrandChanged();
          }}
        />
      )}
      {tab === 'activity' && agent.perm_view_activity && <ActivityLogPanel members={clientMembers} actorId={activityUser} onActorChange={setActivityUser} />}
    </div>
  );
}

function Perm({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${on ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-500 line-through'}`}>
      {label}
    </span>
  );
}
