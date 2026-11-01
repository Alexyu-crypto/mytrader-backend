import { useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { setMemberAgent, type Agent } from '@/lib/agents';
import type { Member } from '@/lib/members';

export function AssignClientsDialog({ agent, agents, members, onClose, onChanged }: { agent: Agent; agents: Agent[]; members: Member[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const agentName = useMemo(() => new Map(agents.map((a) => [a.id, a.brand_name])), [agents]);

  const clients = members
    .filter((m) => m.role === 'client' && m.email.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.agent_id === agent.id) - Number(a.agent_id === agent.id));

  const toggle = async (m: Member) => {
    setBusyId(m.user_id);
    setError('');
    const err = await setMemberAgent(m.user_id, m.agent_id === agent.id ? null : agent.id);
    if (err) setError(err);
    else await onChanged();
    setBusyId('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-pop-in">
        <header className="border-b border-slate-800 p-5">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-lg font-bold text-white">Clients of {agent.brand_name}</h2>
          <p className="mt-1 text-sm text-slate-400">Tick a client to place them under this agent. 勾選客戶以歸入此代理商。</p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email 搜尋電郵" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-teal-400/60" />
          </div>
          {error && <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </header>
        <ul className="flex-1 divide-y divide-slate-800 overflow-y-auto">
          {clients.map((m) => {
            const mine = m.agent_id === agent.id;
            const other = m.agent_id && !mine ? agentName.get(m.agent_id) : null;
            return (
              <li key={m.user_id}>
                <label className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-800/50">
                  <input type="checkbox" checked={mine} disabled={!!busyId} onChange={() => toggle(m)} className="h-4 w-4 accent-teal-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{m.email}</span>
                    {other && <span className="text-xs text-amber-300">Currently under {other} · 現屬此代理商</span>}
                  </span>
                  {busyId === m.user_id && <Loader2 className="h-4 w-4 animate-spin text-teal-400" />}
                </label>
              </li>
            );
          })}
          {clients.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-500">No clients found 沒有客戶</li>}
        </ul>
      </div>
    </div>
  );
}
