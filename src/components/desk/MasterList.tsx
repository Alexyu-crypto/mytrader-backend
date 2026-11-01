import { Cloud, Cpu, Search } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, formatSigned, isOnline } from '@/lib/format';
import { TERMINAL_FRESH_MS } from '@/lib/desk';
import type { Account, LivePosition } from '@/lib/types';
import { ReadOnlyBadge } from '@/components/ReadOnlyBadge';

export function MasterList({
  masters,
  positionsByAccount,
  groups,
  terminals,
  selected,
  onSelect,
}: {
  masters: Account[];
  positionsByAccount: Map<string, LivePosition[]>;
  groups: Map<string, string>;
  terminals: Map<string, string>;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const list = masters.filter(
    (a) => !term || a.account_name.toLowerCase().includes(term) || (groups.get(a.account_name) ?? '').toLowerCase().includes(term) || (a.holder_name ?? '').toLowerCase().includes(term),
  );

  return (
    <aside className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60">
      <div className="border-b border-slate-800 p-4">
        <h2 className="text-sm font-semibold text-white">Master accounts 主帳戶</h2>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 搜尋"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>
      <ul className="max-h-[70vh] flex-1 space-y-1 overflow-y-auto p-2">
        {list.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">No master accounts 沒有主帳戶</li>}
        {list.map((a) => {
          const online = isOnline(a);
          const cloud = a.connection_method === 'metaapi';
          const pos = positionsByAccount.get(a.account_name) ?? [];
          const pl = pos.reduce((s, p) => s + (p.profit || 0) + (p.swap || 0), 0);
          const polled = terminals.get(a.account_name);
          const deskReady = !!polled && Date.now() - new Date(polled).getTime() < TERMINAL_FRESH_MS;
          const active = a.account_name === selected;
          return (
            <li key={a.account_name}>
              <button
                onClick={() => onSelect(a.account_name)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                  active ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(6,182,212,0.15)]' : 'border-transparent hover:border-slate-700 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-slate-600'}`} />
                  <span className="truncate text-sm font-semibold text-white">{a.account_name}</span>
                  <ReadOnlyBadge account={a} compact />
                  {cloud ? (
                    <span title="MetaApi cloud" className="ml-auto flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                      <Cloud className="h-3 w-3" />
                      Cloud
                    </span>
                  ) : deskReady && (
                    <span title="Desk-ready EA v3.0" className="ml-auto flex items-center gap-1 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                      <Cpu className="h-3 w-3" />
                      v3
                    </span>
                  )}
                </div>
                {groups.get(a.account_name) && <p className="mt-0.5 truncate pl-4 text-xs text-slate-500">{groups.get(a.account_name)}</p>}
                <div className="mt-2 grid grid-cols-3 gap-1 pl-4 text-[11px]">
                  <span className="text-slate-500">
                    Eq <span className="text-slate-300">{formatCurrency(a.equity ?? 0)}</span>
                  </span>
                  <span className={`text-center ${pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSigned(pl)}</span>
                  <span className="text-right text-slate-400">{pos.length} pos</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
