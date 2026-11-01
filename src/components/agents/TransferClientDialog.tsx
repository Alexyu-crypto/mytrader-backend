import { useState } from 'react';
import { ArrowRightLeft, Building2, Check, Loader2, Search, X } from 'lucide-react';
import { BrandMark } from '@/components/agents/BrandMark';
import { HEAD_OFFICE } from '@/components/agents/SourceBadge';
import { setMemberAgent, type Agent } from '@/lib/agents';
import type { Member } from '@/lib/members';

export function TransferClientDialog({ member, agents, onClose, onDone }: { member: Member; agents: Agent[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [target, setTarget] = useState<string | null>(member.agent_id ?? null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = member.agent_id ?? null;
  const unchanged = target === current;
  const options = agents.filter((a) => a.user_id !== member.user_id && `${a.brand_name} ${a.slug}`.toLowerCase().includes(q.trim().toLowerCase()));
  const targetName = target ? agents.find((a) => a.id === target)?.brand_name ?? '' : HEAD_OFFICE;

  const submit = async () => {
    setBusy(true);
    setError('');
    const err = await setMemberAgent(member.user_id, target);
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    await onDone();
    onClose();
  };

  const row = (id: string | null, label: string, sub: string, mark: JSX.Element, suspended = false) => {
    const on = target === id;
    return (
      <li key={id ?? 'head-office'}>
        <button
          type="button"
          onClick={() => setTarget(id)}
          disabled={busy}
          className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${on ? 'bg-cyan-500/10' : 'hover:bg-slate-800/60'}`}
        >
          {mark}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 truncate text-sm font-medium text-white">
              <span className="truncate">{label}</span>
              {id === current && <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">Current 現時</span>}
              {suspended && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">Suspended 已暫停</span>}
            </span>
            <span className="block truncate text-xs text-slate-500">{sub}</span>
          </span>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${on ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-600'}`}>
            {on && <Check className="h-3 w-3" />}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-pop-in">
        <header className="border-b border-slate-800 p-5">
          <button onClick={onClose} disabled={busy} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <ArrowRightLeft className="h-5 w-5 text-cyan-300" /> Transfer client 轉移客戶
          </h2>
          <p className="mt-1 truncate text-sm text-slate-400">{member.email}</p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agent 搜尋代理商" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-500/60" />
          </div>
        </header>

        <ul className="flex-1 divide-y divide-slate-800 overflow-y-auto">
          {row(
            null,
            HEAD_OFFICE,
            'Managed directly by head office 由總公司直接管理',
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700/60 text-slate-300"><Building2 className="h-4 w-4" /></span>,
          )}
          {options.map((a) => row(a.id, a.brand_name, `/a/${a.slug}`, <BrandMark brand={a} className="h-8 w-8 shrink-0 text-xs" />, a.status === 'suspended'))}
          {options.length === 0 && q && <li className="px-5 py-8 text-center text-sm text-slate-500">No agent found 沒有代理商</li>}
        </ul>

        <footer className="space-y-3 border-t border-slate-800 p-5">
          {!unchanged && (
            <p className="text-xs leading-relaxed text-slate-400">
              The client and their linked accounts will move to <span className="font-medium text-white">{targetName}</span>. The previous agent will no longer see them.
              客戶及其帳戶將轉至 {targetName}，原代理商將不能再查看。
            </p>
          )}
          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel 取消</button>
            <button
              onClick={submit}
              disabled={unchanged || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Transfer 轉移
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
