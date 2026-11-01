import { useEffect, useState } from 'react';
import { Check, Loader2, Send, X } from 'lucide-react';
import { checkSlugAvailable, normalizeSlug, SLUG_PATTERN, submitApplication } from '@/lib/agents';

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-teal-400/60 focus:ring-2 focus:ring-teal-400/20';

type SlugState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'unknown';

export function AgentApplicationForm({ onCancel, onSubmitted }: { onCancel: () => void; onSubmitted: () => void }) {
  const [form, setForm] = useState({ brand_name: '', desired_slug: '', contact_name: '', contact: '', region: '', expected_clients: '', message: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === 'brand_name' && !slugTouched ? { desired_slug: normalizeSlug(value) } : {}),
    }));
  };

  const slug = form.desired_slug;
  useEffect(() => {
    if (!slug) return setSlugState('idle');
    if (!SLUG_PATTERN.test(slug)) return setSlugState('invalid');
    setSlugState('checking');
    let cancelled = false;
    const t = setTimeout(() => {
      checkSlugAvailable(slug).then((ok) => {
        if (!cancelled) setSlugState(ok === null ? 'unknown' : ok ? 'available' : 'taken');
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slugState === 'invalid' || slugState === 'taken') return;
    const clients = form.expected_clients ? Number(form.expected_clients) : null;
    setBusy(true);
    setError('');
    const err = await submitApplication({
      brand_name: form.brand_name.trim(),
      desired_slug: slug,
      contact_name: form.contact_name.trim(),
      contact: form.contact.trim(),
      region: form.region.trim(),
      expected_clients: clients !== null && Number.isFinite(clients) ? Math.max(0, Math.round(clients)) : null,
      message: form.message.trim(),
    });
    setBusy(false);
    if (err) setError(err);
    else onSubmitted();
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-700 bg-slate-800/40 p-6 animate-fade-in">
      <h2 className="text-lg font-semibold text-white">Agent application 代理商申請表</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Brand / company name 品牌或公司名稱" required>
          <input required maxLength={60} value={form.brand_name} onChange={set('brand_name')} placeholder="Golden Bridge Capital" className={INPUT} />
        </Field>
        <Field label="Login link name 登入連結名稱" required hint={<SlugHint state={slugState} slug={slug} />}>
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950 focus-within:border-teal-400/60 focus-within:ring-2 focus-within:ring-teal-400/20">
            <span className="pl-3 text-sm text-slate-500">/a/</span>
            <input
              required
              maxLength={30}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                const typed = e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 30);
                setForm((f) => ({ ...f, desired_slug: typed }));
              }}
              placeholder="golden-bridge"
              className="w-full bg-transparent px-1 py-2.5 text-sm text-white placeholder-slate-600 outline-none"
            />
          </div>
        </Field>
        <Field label="Contact person 聯絡人" required>
          <input required maxLength={60} value={form.contact_name} onChange={set('contact_name')} className={INPUT} />
        </Field>
        <Field label="Phone / WhatsApp / Telegram 聯絡方式" required>
          <input required maxLength={120} value={form.contact} onChange={set('contact')} className={INPUT} />
        </Field>
        <Field label="Region 地區">
          <input maxLength={60} value={form.region} onChange={set('region')} placeholder="Hong Kong" className={INPUT} />
        </Field>
        <Field label="Expected clients 預計客戶數目">
          <input type="number" min={0} max={100000} value={form.expected_clients} onChange={set('expected_clients')} className={INPUT} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Tell us about your business 業務簡介">
            <textarea rows={4} maxLength={1000} value={form.message} onChange={set('message')} className={`${INPUT} resize-y`} />
          </Field>
        </div>
      </div>

      {error && <p className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700/40">
          Cancel 取消
        </button>
        <button
          type="submit"
          disabled={busy || slugState === 'invalid' || slugState === 'taken' || slugState === 'checking'}
          className="flex items-center justify-center gap-2 rounded-lg bg-teal-400 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-teal-300 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit application 提交申請
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">
        {label} {required && <span className="text-teal-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs">{hint}</span>}
    </label>
  );
}

function SlugHint({ state, slug }: { state: SlugState; slug: string }) {
  if (state === 'idle') return <span className="text-slate-500">3-30 lowercase letters, numbers or dashes. 小寫字母、數字或「-」。</span>;
  if (state === 'invalid') return <span className="text-amber-300">Use 3-30 letters, numbers or dashes; cannot start or end with a dash. 需 3-30 字元，不可以「-」開頭或結尾。</span>;
  if (state === 'checking') return <span className="flex items-center gap-1 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Checking 檢查中…</span>;
  if (state === 'taken') return <span className="flex items-center gap-1 text-red-300"><X className="h-3 w-3" /> "{slug}" is taken 已被使用</span>;
  if (state === 'unknown') return <span className="text-slate-500">We will confirm this name during review. 審核時確認。</span>;
  return <span className="flex items-center gap-1 text-emerald-300"><Check className="h-3 w-3" /> Available 可以使用</span>;
}
