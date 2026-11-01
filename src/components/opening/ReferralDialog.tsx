import { useEffect, useState } from 'react';
import { Loader2, UserRoundPlus, X } from 'lucide-react';
import { Field, inputCls } from '@/components/ib/IbFields';
import { IconButton } from '@/components/IconButton';
import { REFERRAL_STATUSES, createReferral, updateReferral, type OpeningBroker, type Referral, type ReferralInput } from '@/lib/ibReferrals';

export function ReferralDialog({
  brokers,
  referral,
  defaultBrokerId,
  onClose,
  onSaved,
}: {
  brokers: OpeningBroker[];
  referral: Referral | null;
  defaultBrokerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ReferralInput>(() => ({
    broker_id: referral?.broker_id ?? defaultBrokerId,
    link_id: referral?.link_id ?? null,
    client_name: referral?.client_name ?? '',
    client_contact: referral?.client_contact ?? '',
    account_number: referral?.account_number ?? '',
    account_type: referral?.account_type ?? '',
    status: referral?.status ?? 'applied',
    opened_on: referral?.opened_on ?? null,
    notes: referral?.notes ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof ReferralInput>(k: K) => (v: ReferralInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const broker = brokers.find((b) => b.id === form.broker_id);
  const links = broker?.links ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const pickLink = (id: string) => {
    const link = links.find((l) => l.id === id);
    setForm((f) => ({ ...f, link_id: id || null, account_type: link?.account_type && !f.account_type ? link.account_type : f.account_type }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = referral ? await updateReferral(referral.id, form) : await createReferral(form);
    setBusy(false);
    if (err) setError(err);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <form onSubmit={submit} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <div className="absolute right-4 top-4 flex">
          <IconButton label="Close · 關閉" tone="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-400/10 text-lime-300">
          <UserRoundPlus className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">{referral ? 'Edit client 修改客戶' : 'Register client 登記客戶'}</h2>
        <p className="mt-1 text-sm text-slate-400">Record a client who opened an account through our IB link. 記錄經我們代理連結開戶的客戶。</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Broker 經紀商 *</span>
            <select value={form.broker_id} onChange={(e) => setForm((f) => ({ ...f, broker_id: e.target.value, link_id: null }))} className={inputCls} disabled={!!referral}>
              <option value="">— Select 請選擇 —</option>
              {brokers.map((b) => <option key={b.id} value={b.id}>{b.broker_name}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Referral link used 使用的連結</span>
            <select value={form.link_id ?? ''} onChange={(e) => pickLink(e.target.value)} className={inputCls} disabled={links.length === 0}>
              <option value="">{links.length ? '— Not sure 不確定 —' : '— No active links 沒有可用連結 —'}</option>
              {links.map((l) => <option key={l.id} value={l.id}>{l.label || l.url}</option>)}
            </select>
          </label>
          <Field label="Client name 客戶名稱 *" value={form.client_name} onChange={set('client_name')} span />
          <Field label="Contact 聯絡方式" value={form.client_contact} onChange={set('client_contact')} placeholder="Phone / email / WhatsApp" />
          <Field label="Trading account no. 交易帳號" value={form.account_number} onChange={set('account_number')} />
          <Field label="Account type 帳戶類型" value={form.account_type} onChange={set('account_type')} placeholder="Standard, ECN…" />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Opened on 開戶日期</span>
            <input type="date" value={form.opened_on ?? ''} onChange={(e) => set('opened_on')(e.target.value || null)} className={inputCls} />
          </label>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Status 狀態</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REFERRAL_STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => set('status')(s.key)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${form.status === s.key ? s.tone : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Notes 備註</span>
            <textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} rows={3} maxLength={2000} className={inputCls} />
          </label>
        </div>

        {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button type="submit" disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {referral ? 'Save 儲存' : 'Register 登記'}
          </button>
        </div>
      </form>
    </div>
  );
}
