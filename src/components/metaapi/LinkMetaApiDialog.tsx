import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { listMetaApiAccounts, type MetaApiCloudAccount } from '@/lib/metaapi';
import { ACCOUNT_NAME_PATTERN, MAX_ACCOUNT_NAME_LENGTH, buildAccountName } from '@/lib/accountImport';

const inputCls = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/60';

export function LinkMetaApiDialog({ onClose, onLinked }: { onClose: () => void; onLinked: () => void }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cloud, setCloud] = useState<MetaApiCloudAccount[]>([]);
  const [picked, setPicked] = useState<MetaApiCloudAccount | null>(null);
  const [type, setType] = useState<'master' | 'follower'>('master');
  const [holderName, setHolderName] = useState('');
  const [broker, setBroker] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMetaApiAccounts().then(({ accounts, error: err }) => {
      setCloud(accounts);
      setLoadError(err);
      setLoading(false);
    });
  }, []);

  const pick = (a: MetaApiCloudAccount) => {
    setPicked(a);
    setBroker(a.server.split('-')[0] || '');
    setError(null);
  };

  const accountName = picked ? buildAccountName(type, holderName, picked.login, broker) : '';

  const link = async () => {
    if (!picked) return;
    if (!/^[0-9]{3,12}$/.test(picked.login)) return setError('MetaApi 帳戶冇有效登入號碼 · This MetaApi account has no valid login number.');
    if (!holderName.trim() || !broker.trim()) return setError('請填寫戶口持有人同券商 · Holder name and broker are required.');
    if (accountName.length > MAX_ACCOUNT_NAME_LENGTH || !ACCOUNT_NAME_PATTERN.test(accountName)) {
      return setError('名稱要有英文字母，券商名稱要短啲 · Use English letters and a shorter broker name.');
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('accounts').insert({
      account_name: accountName,
      broker: broker.trim(),
      broker_server: picked.server || null,
      platform: picked.platform === 'MT5' ? 'MT5' : 'MT4',
      type,
      holder_name: holderName.trim().slice(0, 100),
      connection_method: 'metaapi',
      metaapi_account_id: picked.id,
    });
    setSaving(false);
    if (err) {
      console.error('link metaapi account failed', err);
      return setError(err.code === '23505' ? '呢個帳戶名稱已存在 · This account already exists.' : '未能連結，請再試 · Could not link this account. Please try again.');
    }
    onLinked();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-100">連結 MetaApi 帳戶 · Link from MetaApi</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> 讀取 MetaApi 帳戶…</div>
          ) : loadError ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadError}</p>
          ) : cloud.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">MetaApi 入面未有帳戶 · No accounts found in MetaApi.</p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {cloud.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={!!a.linked_to}
                  onClick={() => pick(a)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${picked?.id === a.id ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-800 hover:bg-slate-800/60'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{a.name || a.login}</span>
                    {a.linked_to
                      ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><CheckCircle2 className="w-3 h-3" /> 已連結 {a.linked_to}</span>
                      : <span className="text-[11px] text-slate-500">{a.state} · {a.connection}</span>}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400">{a.platform} · {a.login} · {a.server}</div>
                </button>
              ))}
            </div>
          )}

          {picked && (
            <div className="space-y-3 border-t border-slate-800 pt-4">
              <div className="grid grid-cols-2 gap-2">
                {(['master', 'follower'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)} className={`rounded-lg border px-3 py-2 text-sm transition-colors ${type === t ? 'border-sky-500/60 bg-sky-500/10 text-sky-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                    {t === 'master' ? '主帳戶 · Master' : '跟單帳戶 · Follower'}
                  </button>
                ))}
              </div>
              <input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="戶口持有人（英文）· Holder name" className={inputCls} />
              <input value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="券商 · Broker" className={inputCls} />
              {holderName && broker && <p className="text-xs text-slate-400">系統名稱 · Name: <span className="font-mono text-slate-200">{accountName}</span></p>}
              {error && <p className="text-sm text-red-300">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors">取消 · Cancel</button>
          <button type="button" onClick={link} disabled={!picked || saving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} 連結 · Link
          </button>
        </div>
      </div>
    </div>
  );
}
