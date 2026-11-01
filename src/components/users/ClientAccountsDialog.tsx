import { useEffect, useMemo, useState } from 'react';
import { Check, Link2, Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchClientAccounts, saveClientAccounts } from '@/lib/clientAccounts';
import type { Account } from '@/lib/types';

type AccountRow = Pick<Account, 'account_name' | 'type' | 'platform' | 'broker'>;

export function ClientAccountsDialog({ userId, email, onClose }: { userId: string; email: string; onClose: () => void }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [acc, linked] = await Promise.all([
        supabase.from('accounts').select('account_name, type, platform, broker').order('account_name'),
        fetchClientAccounts(userId),
      ]);
      if (!alive) return;
      if (acc.error || !acc.data || linked.error) setError('Could not load accounts. 未能載入帳戶。');
      else {
        setAccounts(acc.data as AccountRow[]);
        setInitial(linked.names);
        setSelected(new Set(linked.names));
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? accounts.filter((a) => `${a.account_name} ${a.broker}`.toLowerCase().includes(q)) : accounts;
    return [...list].sort((a, b) => (a.type === b.type ? 0 : a.type === 'follower' ? -1 : 1));
  }, [accounts, query]);

  const toggle = (name: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError('');
    const err = await saveClientAccounts(userId, initial, [...selected]);
    setSaving(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !saving && onClose()} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-pop-in">
        <header className="flex items-start gap-3 border-b border-slate-800 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
            <Link2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-white">Linked accounts 連結帳戶</h2>
            <p className="truncate text-xs text-slate-400">{email}</p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 p-5 pb-3">
          <p className="text-xs leading-relaxed text-slate-400">
            Pick the trading accounts that belong to this user. They will see these accounts, plus every signal those accounts copy and any approved application, on their Live positions and History pages.
            <span className="mt-1 block text-slate-500">選擇屬於此用戶的交易帳戶。用戶只會看到這些帳戶、其跟隨的信號及已批准申請的信號。</span>
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts 搜尋帳戶"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
            </div>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No accounts found 找不到帳戶</p>
          ) : (
            <ul className="space-y-1.5 pb-3">
              {shown.map((a) => {
                const on = selected.has(a.account_name);
                return (
                  <li key={a.account_name}>
                    <button
                      onClick={() => toggle(a.account_name)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        on ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-cyan-400 bg-cyan-500 text-black' : 'border-slate-600'}`}>
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{a.account_name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {a.platform} · {a.broker}
                        </span>
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${a.type === 'master' ? 'bg-amber-500/10 text-amber-300' : 'bg-sky-500/10 text-sky-300'}`}>
                        {a.type === 'master' ? 'Master' : 'Follower'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-slate-800 p-5">
          {error && <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <div className="flex items-center gap-3">
            <span className="flex-1 text-xs text-slate-400">{selected.size} selected 已選</span>
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
              Cancel 取消
            </button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save 儲存
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
