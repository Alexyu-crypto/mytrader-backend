import { useCallback, useEffect, useState } from 'react';
import { Ban, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/hooks/useConfirm';

type List = 'allow' | 'deny';
type Rule = { id: string; cidr: string; list: List; note: string; created_at: string };

const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?|[0-9a-f:]+(\/\d{1,3})?)$/i;
const inputCls = 'w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 transition-colors';

function RuleList({ list, rules, myIp, onAdd, onRemove, busy }: {
  list: List;
  rules: Rule[];
  myIp: string;
  onAdd: (list: List, ip: string, note: string) => Promise<boolean>;
  onRemove: (id: string) => void;
  busy: boolean;
}) {
  const [ip, setIp] = useState('');
  const [note, setNote] = useState('');
  const allow = list === 'allow';

  const add = async () => {
    if (await onAdd(list, ip.trim(), note.trim())) {
      setIp('');
      setNote('');
    }
  };

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${allow ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
      <div className="flex items-center gap-2">
        {allow ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <Ban className="w-4 h-4 text-red-400" />}
        <h3 className={`text-sm font-semibold ${allow ? 'text-emerald-300' : 'text-red-300'}`}>
          {allow ? 'Allow list · 白名單' : 'Block list · 黑名單'}
        </h3>
        <span className="text-xs text-slate-500">({rules.length})</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP address or range · IP 地址或範圍" className={inputCls} />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note 備註" className={`${inputCls} sm:max-w-[10rem]`} />
        <button type="button" onClick={add} disabled={busy || !ip.trim()} className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 text-sm transition-colors disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add · 加入
        </button>
      </div>
      {allow && myIp && !rules.some((r) => r.cidr.replace(/\/(32|128)$/, '') === myIp) && (
        <button type="button" onClick={() => onAdd('allow', myIp, 'My IP')} disabled={busy} className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
          + <span>Add my current IP · 加入我目前的 IP</span> <span className="font-mono">{myIp}</span>
        </button>
      )}
      <ul className="divide-y divide-slate-700/60">
        {rules.length === 0 && <li className="text-slate-500 text-sm py-1">Empty · 未有記錄</li>}
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="font-mono text-white">{r.cidr.replace(/\/(32|128)$/, '')}</span>
            <span className="flex-1 text-slate-400 truncate">{r.note}</span>
            <button type="button" aria-label={`Remove ${r.cidr}`} onClick={() => onRemove(r.id)} disabled={busy} className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IpAccessCard({ settingsId, whitelistOn, onWhitelistChanged }: {
  settingsId: string | undefined;
  whitelistOn: boolean;
  onWhitelistChanged: (on: boolean) => void;
}) {
  const ask = useConfirm();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [myIp, setMyIp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('ip_access_rules').select('id, cidr, list, note, created_at').order('created_at');
    if (err) {
      console.error('ip rules load failed', err);
      setError('Could not load IP lists. · 未能載入 IP 名單。');
      setRules([]);
    } else setRules((data ?? []) as Rule[]);
  }, []);

  useEffect(() => {
    load();
    supabase.rpc('my_ip').then(({ data, error: err }) => {
      if (err) console.error('my ip lookup failed', err);
      else if (typeof data === 'string') setMyIp(data);
    });
  }, [load]);

  const add = async (list: List, ip: string, note: string) => {
    if (!IP_RE.test(ip)) {
      setError('Please enter a valid IP address or range. · 請輸入有效的 IP 地址或範圍。');
      return false;
    }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('ip_access_rules').insert({ cidr: ip, list, note });
    setBusy(false);
    if (err) {
      console.error('ip rule insert failed', err);
      setError(err.code === '23505' ? 'This IP is already on the list. · 此 IP 已在名單內。' : 'Could not add this IP. Please check it and try again. · 未能加入此 IP，請檢查後再試。');
      return false;
    }
    await load();
    return true;
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('ip_access_rules').delete().eq('id', id);
    setBusy(false);
    if (err) {
      console.error('ip rule delete failed', err);
      setError('Could not remove this IP. · 未能移除此 IP。');
    } else await load();
  };

  const toggleWhitelist = async () => {
    if (!settingsId) return;
    const next = !whitelistOn;
    const allowCount = (rules ?? []).filter((r) => r.list === 'allow').length;
    if (next && !(await ask(`Only IPs on the allow list (${allowCount}) will be able to sign in. Full admins are always allowed. Other users already signed in elsewhere will be signed out. Continue?\n開啟後只有白名單 (${allowCount}) 內的 IP 可登入（全權管理員除外），其他 IP 的用戶會被登出。確定？`, { tone: 'warning', title: 'Turn on allow list · 開啟白名單', confirmLabel: 'Continue · 繼續' }))) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('app_settings').update({ ip_whitelist_enabled: next }).eq('id', settingsId);
    setBusy(false);
    if (err) {
      console.error('whitelist switch failed', err);
      setError('Could not change this setting. · 未能更改設定。');
    } else onWhitelistChanged(next);
  };

  const byList = (l: List) => (rules ?? []).filter((r) => r.list === l);

  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-lg border bg-red-500/10 text-red-400 border-red-500/20">
          <ShieldCheck className="w-4 h-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-white font-semibold">IP Allow / Block List · IP 黑白名單</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Block list IPs can never sign in. Turn on "allow list only" to let only listed IPs sign in. Full admins are never blocked, so you cannot lock yourself out. · 黑名單 IP 一律不能登入；開啟「只限白名單」後只有白名單 IP 可登入。全權管理員不受限制，不會把自己鎖在門外。
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/60 border border-slate-700 px-4 py-3">
        <div>
          <p className="text-sm text-white">Allow list only · 只限白名單登入</p>
          <p className="text-xs text-slate-500">
            <span>{myIp ? 'Your current IP · 你目前的 IP' : 'Detecting your IP... · 偵測 IP 中...'}</span>
            {myIp && <span className="ml-1 font-mono text-slate-300">{myIp}</span>}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={whitelistOn}
          aria-label="Allow list only"
          disabled={busy || !settingsId || rules === null}
          onClick={toggleWhitelist}
          className={`relative w-12 h-6 shrink-0 rounded-full transition-colors disabled:opacity-60 ${whitelistOn ? 'bg-emerald-500' : 'bg-slate-600'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${whitelistOn ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {rules === null ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading... · 載入中...</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <RuleList list="allow" rules={byList('allow')} myIp={myIp} onAdd={add} onRemove={remove} busy={busy} />
          <RuleList list="deny" rules={byList('deny')} myIp="" onAdd={add} onRemove={remove} busy={busy} />
        </div>
      )}
      {error && <div className="text-red-400 text-sm">{error}</div>}
    </section>
  );
}
