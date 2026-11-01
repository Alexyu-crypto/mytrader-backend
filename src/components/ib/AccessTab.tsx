import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, Link2, Loader2, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { addLink, deleteLink, fetchLinks, revealPortalPassword, savePortalPassword, setLinkActive, type IbBroker, type IbLink } from '@/lib/ibPartners';
import { Field, SaveBar, inputCls } from '@/components/ib/IbFields';
import { useBrokerDraft } from '@/components/ib/useBrokerDraft';
import { Hint, IconButton } from '@/components/IconButton';

const KEYS = ['ib_code', 'portal_url', 'portal_login'] as const;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? 'Copied · 已複製' : 'Copy · 複製'}
      tone="ghost"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </IconButton>
  );
}

function PortalPassword({ brokerId, onLogged }: { brokerId: string; onLogged: () => void }) {
  const [shown, setShown] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const reveal = async () => {
    if (shown !== null) return setShown(null);
    setBusy(true);
    const { password, error } = await revealPortalPassword(brokerId);
    setBusy(false);
    if (error) setMsg(error);
    else if (password === null) setMsg('No password saved yet. 尚未儲存密碼。');
    else {
      setShown(password);
      setMsg('');
      onLogged();
    }
  };

  const save = async () => {
    setBusy(true);
    const err = await savePortalPassword(brokerId, value);
    setBusy(false);
    if (err) return setMsg(err);
    setEditing(false);
    setValue('');
    setShown(null);
    setMsg('Password saved. 密碼已儲存。');
    onLogged();
  };

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-slate-400">Backend password 後台密碼</span>
      {editing ? (
        <div className="flex gap-2">
          <input type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} placeholder="New password 新密碼" />
          <button onClick={save} disabled={busy || !value} className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Save
          </button>
          <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5">
          <KeyRound className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="flex-1 truncate font-mono text-sm text-white">{shown ?? '••••••••••'}</span>
          {shown !== null && <CopyButton text={shown} />}
          <IconButton label={shown !== null ? 'Hide · 隱藏' : 'Show · 顯示'} tone="ghost" onClick={reveal} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : shown !== null ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton label="Change password · 更改密碼" tone="cyan" onClick={() => { setEditing(true); setMsg(''); }}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}
      {msg && <p className="mt-1.5 text-xs text-slate-400">{msg}</p>}
      <p className="mt-1.5 text-[11px] text-slate-500">Stored encrypted. Only full admins and IB managers can view it, and every view is recorded in the timeline. 密碼已加密儲存，只有全權管理員及 IB 管理員可查看，每次查看都會記錄在時間線。</p>
    </div>
  );
}

export function AccessTab({ broker, onSaved }: { broker: IbBroker; onSaved: () => void }) {
  const { draft, set, ...bar } = useBrokerDraft(broker, [...KEYS], onSaved);
  const [links, setLinks] = useState<IbLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ label: '', url: '', account_type: '', region: '' });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchLinks(broker.id);
    setLinks(res.links);
    setError(res.error ?? '');
    setLoading(false);
  }, [broker.id]);

  useEffect(() => { load(); }, [load]);

  const run = async (p: Promise<string | null>) => {
    const err = await p;
    if (err) setError(err);
    else {
      setError('');
      await load();
      onSaved();
    }
    return err;
  };

  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const err = await run(addLink({ broker_id: broker.id, ...form }));
    setAdding(false);
    if (!err) setForm({ label: '', url: '', account_type: '', region: '' });
  };

  return (
    <div className="space-y-7">
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Link2 className="h-4 w-4 text-cyan-400" /> Referral links 代理連結</h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
        ) : links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-500">No links yet. Add the first one the broker gave you. 尚未有連結。</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-opacity ${l.active ? 'border-slate-700 bg-slate-950' : 'border-slate-800 opacity-50'}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">
                    {l.label || 'Link 連結'}
                    {[l.account_type, l.region].filter(Boolean).map((t) => (
                      <span key={t} className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">{t}</span>
                    ))}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-400">{l.url}</p>
                </div>
                <CopyButton text={l.url} />
                <Hint label="Open link · 開啟">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-cyan-300" aria-label="Open link"><ExternalLink className="h-3.5 w-3.5" /></a>
                </Hint>
                <IconButton label={l.active ? 'Disable · 停用' : 'Enable · 啟用'} tone={l.active ? 'amber' : 'green'} onClick={() => run(setLinkActive(l.id, !l.active))}>
                  {l.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                </IconButton>
                <IconButton label="Delete · 刪除" tone="red" onClick={() => run(deleteLink(l.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submitLink} className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 sm:grid-cols-[1fr_2fr]">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Name 名稱 e.g. Main" className={inputCls} />
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://broker.com/?ib=12345" className={inputCls} required />
          <input value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} placeholder="Account type 帳戶類型 (STD / ECN)" className={inputCls} />
          <div className="flex gap-2">
            <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Region 地區" className={inputCls} />
            <IconButton label="Add link · 新增連結" tone="solid" size="md" type="submit" disabled={adding || !form.url}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </IconButton>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4 text-cyan-400" /> Backend portal 代理後台</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Portal address 後台網址" value={draft.portal_url} onChange={(v) => set('portal_url', v)} placeholder="https://partners.broker.com" span />
          <Field label="IB ID 代理編號" value={draft.ib_code} onChange={(v) => set('ib_code', v)} />
          <Field label="Login 登入帳號" value={draft.portal_login} onChange={(v) => set('portal_login', v)} />
        </div>
        <SaveBar {...bar} onSave={bar.save} />
        <div className="mt-4">
          <PortalPassword brokerId={broker.id} onLogged={onSaved} />
        </div>
      </section>
    </div>
  );
}
