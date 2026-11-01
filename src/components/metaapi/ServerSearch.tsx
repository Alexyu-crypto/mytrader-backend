import { useState, type SyntheticEvent } from 'react';
import { Check, Loader2, Search, ServerCog, X } from 'lucide-react';
import { searchMetaApiServers, type MetaApiBrokerServers } from '@/lib/metaapi';

export function ServerSearch({
  initialQuery,
  platform,
  selected,
  onPick,
}: {
  initialQuery: string;
  platform: 'MT4' | 'MT5';
  selected: string;
  onPick: (server: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<MetaApiBrokerServers[] | null>(null);

  const run = async (q: string) => {
    const text = q.trim();
    if (text.length < 2) {
      setError('Type at least 2 letters. 請輸入最少 2 個字。');
      setResults(null);
      return;
    }
    setLoading(true);
    setError('');
    const res = await searchMetaApiServers(text, platform);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      setResults(null);
      return;
    }
    setResults(res.brokers);
  };

  const openPanel = () => {
    const q = initialQuery.trim();
    setQuery(q);
    setOpen(true);
    if (q.length >= 2) run(q);
  };

  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    run(query);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        <ServerCog className="w-3.5 h-3.5" />
        搜尋 MetaApi 伺服器 · Search MetaApi servers
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-cyan-500/30 bg-slate-900/80 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-cyan-300">
          <ServerCog className="w-3.5 h-3.5" />
          MetaApi {platform} 伺服器 · servers
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close search"
          className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(e); }}
            placeholder="券商名 · Broker name, e.g. FxPro"
            maxLength={60}
            autoFocus
            className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-md pl-8 pr-2 py-1.5 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '搜尋 · Search'}
        </button>
      </div>

      {error && <p className="text-amber-400 text-xs mt-2">{error}</p>}

      {loading && !results && (
        <p className="flex items-center gap-1.5 text-slate-400 text-xs mt-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> 搜尋中 · Searching…
        </p>
      )}

      {results && results.length === 0 && !loading && (
        <p className="text-slate-400 text-xs mt-3 leading-relaxed">
          MetaApi 搵唔到相關伺服器。試吓用券商英文名，或者直接輸入伺服器名。
          <br />
          No servers found. Try the broker&apos;s English name, or type the server name yourself.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="mt-3 max-h-56 overflow-y-auto space-y-3 pr-1">
          {results.map((b) => (
            <div key={b.broker}>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{b.broker}</p>
              <div className="flex flex-wrap gap-1.5">
                {b.servers.map((s) => {
                  const active = s === selected;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onPick(s)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border font-mono text-xs transition-all ${
                        active
                          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-cyan-500/60 hover:text-white'
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">撳一下就填入 · Click a server to fill it in.</p>
        </div>
      )}
    </div>
  );
}
