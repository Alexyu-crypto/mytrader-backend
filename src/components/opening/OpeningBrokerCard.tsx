import { useState } from 'react';
import { Check, Copy, ExternalLink, Hash, Link2, UserRoundPlus, Users } from 'lucide-react';
import type { OpeningBroker } from '@/lib/ibReferrals';
import { Hint, IconButton } from '@/components/IconButton';

export function OpeningBrokerCard({ broker, clients, onRegister }: { broker: OpeningBroker; clients: number; onRegister: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <article className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white">{broker.broker_name}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">{[broker.regulation, broker.region].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <Hint label={`${clients} clients registered · 已登記客戶`} className="shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs tabular-nums text-slate-300">
            <Users className="h-3 w-3" />
            {clients}
          </span>
        </Hint>
      </div>

      {broker.ib_code && (
        <button
          onClick={() => copy('code', broker.ib_code)}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-left text-sm transition-colors hover:border-cyan-500/40"
          title="Copy IB code 複製代理編號"
        >
          <Hash className="h-4 w-4 text-slate-500" />
          <span className="text-xs text-slate-500">IB code 代理編號</span>
          <span className="ml-auto font-mono text-white">{broker.ib_code}</span>
          {copied === 'code' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
        </button>
      )}

      <div className="mt-3 flex-1 space-y-2">
        {broker.links.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 px-3 py-3 text-center text-xs text-slate-500">No active links yet 尚未有可用連結</p>}
        {broker.links.map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg bg-slate-950/70 px-3 py-2">
            <Link2 className="h-4 w-4 shrink-0 text-cyan-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{l.label || 'Referral link 代理連結'}</p>
              <p className="truncate text-[11px] text-slate-500">{[l.account_type, l.region].filter(Boolean).join(' · ') || l.url}</p>
            </div>
            <IconButton label={copied === l.id ? 'Copied · 已複製' : 'Copy link · 複製連結'} tone="ghost" onClick={() => copy(l.id, l.url)}>
              {copied === l.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </IconButton>
            <Hint label="Open link · 開啟">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-cyan-300" aria-label="Open link">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Hint>
          </div>
        ))}
      </div>

      <button onClick={onRegister} className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-slate-700 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-200">
        <UserRoundPlus className="h-4 w-4" /> Register client 登記客戶
      </button>
    </article>
  );
}
