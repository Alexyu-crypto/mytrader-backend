import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Loader2, Plus, Shuffle, Trash2, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import { mapSymbol, type SymbolRules } from '@/lib/symbolMap';
import { IconButton } from '@/components/IconButton';

type SymbolSource = { traded: string[]; all: string[]; uploadedAt: string | null };

const uniqueSorted = (list: (string | null | undefined)[]) =>
  [...new Set(list.filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b));

async function loadSymbols(account: string): Promise<SymbolSource> {
  const [live, hist, uploaded] = await Promise.all([
    supabase.from('live_positions').select('symbol').eq('account_name', account).limit(500),
    supabase.from('trade_history').select('symbol').eq('account_name', account).order('close_time', { ascending: false }).limit(500),
    supabase.from('account_symbols').select('symbols, updated_at').eq('account_name', account).maybeSingle(),
  ]);
  const rows = [...(live.data ?? []), ...(hist.data ?? [])] as { symbol: string | null }[];
  const traded = uniqueSorted(rows.map((r) => r.symbol));
  const list = Array.isArray(uploaded.data?.symbols) ? (uploaded.data.symbols as string[]) : [];
  return { traded, all: uniqueSorted([...list, ...traded]), uploadedAt: list.length > 0 ? uploaded.data?.updated_at ?? null : null };
}

const emptySource: SymbolSource = { traded: [], all: [], uploadedAt: null };
const strip = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

const inputCls =
  'w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm font-mono placeholder:font-sans placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors';

export function SymbolMappingEditor({
  master,
  follower,
  rules,
  onChange,
  autoMatchOnLoad = false,
}: {
  master: string;
  follower: string;
  rules: SymbolRules;
  onChange: (rules: SymbolRules) => void;
  autoMatchOnLoad?: boolean;
}) {
  const [masterSrc, setMasterSrc] = useState<SymbolSource>(emptySource);
  const [followerSrc, setFollowerSrc] = useState<SymbolSource>(emptySource);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [matchResult, setMatchResult] = useState<{ tone: 'ok' | 'info' | 'warn'; text: string } | null>(null);
  const autoMatched = useRef(false);

  useEffect(() => {
    let active = true;
    setMatchResult(null);
    setLoading(true);
    Promise.all([loadSymbols(master), loadSymbols(follower)]).then(([m, f]) => {
      if (!active) return;
      setMasterSrc(m);
      setFollowerSrc(f);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [master, follower]);

  const masterSymbols = masterSrc.traded;
  const followerSymbols = followerSrc.all;

  const pairs = Object.entries(rules.symbol_map).sort(([a], [b]) => a.localeCompare(b));
  const followerSet = useMemo(() => new Set(followerSymbols.map((s) => s.toUpperCase())), [followerSymbols]);

  const addPair = () => {
    const key = from.trim().toUpperCase();
    const value = to.trim();
    if (!key || !value) return;
    onChange({ ...rules, symbol_map: { ...rules.symbol_map, [key]: value } });
    setFrom('');
    setTo('');
  };

  const removePair = (key: string) => {
    const next = { ...rules.symbol_map };
    delete next[key];
    onChange({ ...rules, symbol_map: next });
  };

  const autoMatch = () => {
    if (followerSymbols.length === 0) {
      setMatchResult({
        tone: 'warn',
        text: `No symbol names from ${follower} yet. Install the latest bridge on that terminal so it uploads its symbol list, or add pairs manually.`,
      });
      return;
    }
    const next = { ...rules.symbol_map };
    const added: string[] = [];
    let unmatched = 0;
    for (const m of masterSymbols) {
      if (followerSet.has(mapSymbol(m, rules).toUpperCase())) continue;
      const core = strip(m).slice(0, 6);
      const match =
        core.length < 3
          ? undefined
          : followerSymbols.find((f) => strip(f) === strip(m)) ??
            followerSymbols
              .filter((f) => strip(f).startsWith(core) || core.startsWith(strip(f)))
              .sort((a, b) => a.length - b.length)[0];
      if (match) {
        next[m.toUpperCase()] = match;
        added.push(`${m} -> ${match}`);
      } else unmatched++;
    }
    if (added.length > 0) onChange({ ...rules, symbol_map: next });
    setMatchResult(
      added.length > 0
        ? { tone: 'ok', text: `Added ${added.length}: ${added.join(', ')}. Press Save Settings to keep them.` }
        : unmatched > 0
          ? { tone: 'warn', text: `No similar follower names found for ${unmatched} symbol${unmatched === 1 ? '' : 's'}. Add them manually.` }
          : { tone: 'info', text: 'All master symbols already match a follower symbol. Nothing to change.' },
    );
  };

  useEffect(() => {
    if (!autoMatchOnLoad || loading || autoMatched.current) return;
    autoMatched.current = true;
    if (masterSymbols.length > 0) autoMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMatchOnLoad, loading]);

  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shuffle className="w-4 h-4 text-cyan-400" />
            <span className="text-white font-medium text-sm">Symbol Mapping</span>
          </div>
          <p className="text-slate-500 text-xs mt-1 leading-relaxed">
            Translate master symbol names to the follower broker's names. Exact pairs win over the rules below.
          </p>
        </div>
        {masterSymbols.length > 0 && (
          <IconButton label="Auto-match symbols · 自動配對" tone="cyan" onClick={autoMatch}>
            <Wand2 className="w-3.5 h-3.5" />
          </IconButton>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SourceStatus label="Master" source={masterSrc} loading={loading} />
        <SourceStatus label="Follower" source={followerSrc} loading={loading} />
      </div>

      {matchResult && (
        <p
          role="status"
          className={`text-xs leading-relaxed rounded-lg px-3 py-2 border ${
            matchResult.tone === 'ok'
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
              : matchResult.tone === 'warn'
                ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                : 'text-slate-300 bg-slate-800 border-slate-700'
          }`}
        >
          {matchResult.text}
        </p>
      )}

      <div>
        <p className="text-slate-400 text-xs font-medium mb-2">Exact pairs</p>
        <div className="flex items-center gap-2">
          <input
            list="master-symbols"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPair())}
            placeholder="Master, e.g. XAUUSD"
            className={inputCls}
          />
          <ArrowRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <input
            list="follower-symbols"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPair())}
            placeholder="Follower, e.g. GOLD"
            className={inputCls}
          />
          <IconButton label="Add mapping · 新增配對" size="md" onClick={addPair} disabled={!from.trim() || !to.trim()}>
            <Plus className="w-4 h-4" />
          </IconButton>
        </div>
        <datalist id="master-symbols">
          {masterSrc.all.map((s) => <option key={s} value={s} />)}
        </datalist>
        <datalist id="follower-symbols">
          {followerSymbols.map((s) => <option key={s} value={s} />)}
        </datalist>

        {pairs.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-800 border border-slate-800 rounded-lg max-h-48 overflow-y-auto">
            {pairs.map(([k, v]) => (
              <li key={k} className="flex items-center gap-2 px-3 py-1.5 text-sm group">
                <span className="font-mono text-cyan-400 flex-1 truncate">{k}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                <span className="font-mono text-amber-400 flex-1 truncate">{v}</span>
                <IconButton label="Remove mapping · 刪除配對" tone="ghost" onClick={() => removePair(k)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-slate-400 text-xs font-medium mb-2">Rules for all other symbols</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['strip_suffix', 'Remove suffix', '.pro'],
              ['add_prefix', 'Add prefix', 'e.g. #'],
              ['add_suffix', 'Add suffix', '.m'],
            ] as const
          ).map(([key, label, ph]) => (
            <div key={key}>
              <label className="block text-slate-500 text-[11px] mb-1">{label}</label>
              <input
                value={rules[key]}
                onChange={(e) => onChange({ ...rules, [key]: e.target.value.trim() })}
                placeholder={ph}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </div>

      {masterSymbols.length > 0 && (
        <div>
          <p className="text-slate-400 text-xs font-medium mb-2">Preview (symbols seen on master)</p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {masterSymbols.map((m) => {
              const out = mapSymbol(m, rules);
              const known = followerSymbols.length === 0 || followerSet.has(out.toUpperCase());
              return (
                <span
                  key={m}
                  title={known ? undefined : 'Not seen on the follower yet. Check the name is correct.'}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
                    known ? 'border-slate-700 text-slate-300' : 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                  }`}
                >
                  {m}
                  {out !== m && (
                    <>
                      <ArrowRight className="w-3 h-3 opacity-60" />
                      {out}
                    </>
                  )}
                </span>
              );
            })}
          </div>
          {followerSymbols.length > 0 && (
            <p className="text-slate-500 text-[11px] mt-1.5">Amber = name not seen on the follower account yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SourceStatus({ label, source, loading }: { label: string; source: SymbolSource; loading: boolean }) {
  if (loading)
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-800/60 border border-slate-800 rounded-lg px-3 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading {label.toLowerCase()} symbols...
      </div>
    );
  const ready = !!source.uploadedAt;
  return (
    <div
      className={`flex items-start gap-2 text-[11px] leading-relaxed rounded-lg px-3 py-2 border ${
        ready ? 'text-emerald-300 bg-emerald-500/5 border-emerald-500/20' : 'text-amber-300 bg-amber-500/5 border-amber-500/20'
      }`}
    >
      {ready ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <CircleAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
      <span>
        <span className="font-medium">{label}:</span>{' '}
        {ready
          ? `${source.all.length} symbols preloaded from terminal (${timeAgo(source.uploadedAt)})`
          : `${source.all.length} traded symbols only. Install the latest bridge to preload the full list.`}
      </span>
    </div>
  );
}
