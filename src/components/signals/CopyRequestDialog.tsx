import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Loader2, MessageCircle, ShieldCheck, X } from 'lucide-react';
import type { Signal } from '@/components/signals/SignalCard';
import { initials, pct } from '@/components/signals/SignalCard';
import { submitCopyRequest } from '@/lib/copyRequests';

const input =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 transition-colors focus:border-cyan-500 focus:outline-none';

const NEXT_STEPS = [
  ['Our team reviews your application', '團隊審核您的申請'],
  ['We contact you to confirm the setup', '我們會聯絡您確認設定'],
  ['Your account is linked and starts copying', '連結帳戶並開始跟單'],
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-slate-400">
        {label}
        {hint && <span className="font-normal text-slate-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function CopyRequestDialog({ signal, email, onClose, onSent }: { signal: Signal; email: string; onClose: () => void; onSent: () => void }) {
  const { account, perf } = signal;
  const [form, setForm] = useState({
    contact_name: '',
    contact: '',
    platform: account.platform,
    broker: '',
    account_number: '',
    capital: '',
    message: '',
  });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const capital = form.capital.trim() === '' ? null : Number(form.capital);
    if (capital !== null && (!Number.isFinite(capital) || capital < 0)) {
      setError('Please enter a valid capital amount. 請輸入有效資金金額。');
      return;
    }
    setBusy(true);
    setError('');
    const err = await submitCopyRequest({
      master_account: account.account_name,
      contact_name: form.contact_name.trim(),
      contact: form.contact.trim(),
      platform: form.platform,
      broker: form.broker.trim(),
      account_number: form.account_number.trim(),
      capital,
      message: form.message.trim(),
    });
    setBusy(false);
    if (err) return setError(err);
    setSent(true);
    onSent();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-pop-in">
        <div className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-slate-900 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300">
            <Copy className="h-3.5 w-3.5" /> Copy this signal 申請跟單
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/20 text-sm font-bold text-cyan-200 ring-1 ring-cyan-500/30">
              {initials(account.account_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{account.account_name}</p>
              <p className="text-xs text-slate-400">{account.broker} · {account.platform}</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold tabular-nums ${perf.growthPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pct(perf.growthPct)}</p>
              <p className="text-[11px] text-slate-500">DD {perf.maxDrawdownPct.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        {sent ? (
          <div className="px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 animate-pop-in">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">Application sent 申請已送出</h3>
            <p className="mt-1 text-sm text-slate-400">You can follow its progress under "My applications". 可在「我的申請」查看進度。</p>
            <ol className="mx-auto mt-6 max-w-sm space-y-3 text-left">
              {NEXT_STEPS.map(([en, zh], i) => (
                <li key={en} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-cyan-300">{i + 1}</span>
                  <span className="text-sm leading-snug text-slate-300">{en}<span className="block text-xs text-slate-500">{zh}</span></span>
                </li>
              ))}
            </ol>
            <button onClick={onClose} className="mt-7 rounded-lg bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-cyan-400">
              Done 完成
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name 姓名">
                <input required maxLength={100} value={form.contact_name} onChange={set('contact_name')} placeholder="Chan Tai Man" className={input} autoFocus />
              </Field>
              <Field label="Phone / WhatsApp / Telegram">
                <input required minLength={3} maxLength={150} value={form.contact} onChange={set('contact')} placeholder="+852 9123 4567" className={input} />
              </Field>
            </div>

            <Field label="Platform 平台">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-950 p-1">
                {(['MT4', 'MT5'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, platform: p }))}
                    className={`rounded-md py-1.5 text-sm font-medium transition-colors ${form.platform === p ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Broker 經紀商" hint="Optional 選填">
                <input maxLength={100} value={form.broker} onChange={set('broker')} placeholder="e.g. IC Markets" className={input} />
              </Field>
              <Field label="Account no. 帳戶號碼" hint="Optional 選填">
                <input maxLength={50} value={form.account_number} onChange={set('account_number')} placeholder="12345678" className={input} />
              </Field>
            </div>

            <Field label="Planned capital 預計資金 (USD)" hint="Optional 選填">
              <input type="number" min={0} step="any" inputMode="decimal" value={form.capital} onChange={set('capital')} placeholder="5000" className={input} />
            </Field>

            <Field label="Password 密碼" hint={`${form.message.length}/1000`}>
              <textarea maxLength={1000} rows={3} value={form.message} onChange={set('message')} placeholder="Trading password of the account to be linked 交易帳戶密碼" className={`${input} resize-none`} />
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-500" />
              <span className="text-xs leading-relaxed text-slate-400">
                I understand past performance does not guarantee future results and copy trading carries risk of loss.
                <span className="block text-slate-500">本人明白過往表現不代表將來回報，跟單交易有虧損風險。</span>
              </span>
            </label>

            {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Sent as {email}
              </p>
              <button
                type="submit"
                disabled={busy || !agreed}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-black transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                Send application 送出申請
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
