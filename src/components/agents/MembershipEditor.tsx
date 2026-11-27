import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Loader2, PencilLine, Plus, RotateCcw, Save, Star, Trash2 } from 'lucide-react';
import { MembershipView } from '@/pages/Membership';
import { useConfirm, useNotice } from '@/hooks/useConfirm';
import { DEFAULT_PAGE, MAX_FEATURES, MAX_PLANS, fetchAgentMembershipPage, saveAgentMembershipPage, type MembershipPage, type Plan } from '@/lib/membership';

interface DraftPlan extends Omit<Plan, 'price' | 'features'> {
  key: string;
  price: string;
  features: string;
}

interface Draft extends Omit<MembershipPage, 'plans'> {
  plans: DraftPlan[];
}

const inputCls = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 transition-colors focus:border-cyan-500 focus:outline-none';

function toDraft(page: MembershipPage): Draft {
  return { ...page, plans: page.plans.map((p) => ({ ...p, key: crypto.randomUUID(), price: String(p.price), features: p.features.join('\n') })) };
}

function toPage(d: Draft): MembershipPage {
  return {
    ...d,
    plans: d.plans.map(({ key: _key, ...p }) => ({
      ...p,
      price: Number(p.price) || 0,
      features: p.features.split('\n').map((f) => f.trim()).filter(Boolean),
    })),
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function MembershipEditor() {
  const ask = useConfirm();
  const notify = useNotice();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    let live = true;
    fetchAgentMembershipPage().then((res) => {
      if (!live) return;
      if (res.error) setLoadError(res.error);
      setIsNew(!res.page);
      setDraft(toDraft(res.page ?? { ...DEFAULT_PAGE, enabled: false }));
    });
    return () => {
      live = false;
    };
  }, []);

  if (!draft) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  const update = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const updatePlan = (key: string, patch: Partial<DraftPlan>) => update({ plans: draft.plans.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const movePlan = (index: number, dir: -1 | 1) => {
    const plans = [...draft.plans];
    [plans[index], plans[index + dir]] = [plans[index + dir], plans[index]];
    update({ plans });
  };
  const addPlan = () =>
    update({ plans: [...draft.plans, { key: crypto.randomUUID(), name: '', zh: '', audience: '', price: '', period: 'USD (USDT) / signal / month', features: '', highlight: false }] });
  const removePlan = async (p: DraftPlan) => {
    if (!(await ask(`Remove the plan "${p.name || p.zh || 'Untitled'}"?\n確認刪除此計劃？`, { tone: 'danger', title: 'Remove plan · 刪除計劃', confirmLabel: 'Remove · 刪除' }))) return;
    update({ plans: draft.plans.filter((x) => x.key !== p.key) });
  };
  const resetToDefault = async () => {
    if (!(await ask('Replace your text and plans with the default pricing? Unsaved edits will be lost.\n以預設收費取代目前內容？未儲存的修改會被取代。', { tone: 'warning', title: 'Use default · 使用預設', confirmLabel: 'Replace · 取代' }))) return;
    setDraft(toDraft({ ...DEFAULT_PAGE, enabled: draft.enabled }));
    setDirty(true);
  };

  const validate = (): string => {
    if (draft.enabled && draft.plans.length === 0) return 'Add at least one plan before showing the page. 請先新增至少一個計劃。';
    for (const p of draft.plans) {
      if (!p.name.trim()) return 'Every plan needs an English name. 每個計劃都需要英文名稱。';
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(p.price.trim()) || Number(p.price) > 100000) return `Check the price of "${p.name}". 請檢查「${p.name}」的價錢。`;
      if (p.features.split('\n').filter((f) => f.trim()).length > MAX_FEATURES) return `"${p.name}" has more than ${MAX_FEATURES} features. 「${p.name}」功能超過 ${MAX_FEATURES} 項。`;
    }
    return '';
  };

  const save = async () => {
    const v = validate();
    setError(v);
    if (v) return;
    setSaving(true);
    const err = await saveAgentMembershipPage(toPage({ ...draft, plans: draft.plans.map((p) => ({ ...p, price: p.price.trim() })) }));
    setSaving(false);
    if (err) return setError(err);
    setDirty(false);
    setIsNew(false);
    void notify(draft.enabled ? 'Your clients now see this pricing page. 您的客戶現在會看到此收費頁。' : 'Saved. Your clients still see the default pricing. 已儲存，客戶仍會看到預設收費。', { tone: 'success', title: 'Saved · 已儲存' });
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-800/40 p-5 lg:flex-row lg:items-center">
        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          onClick={() => update({ enabled: !draft.enabled })}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${draft.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${draft.enabled ? 'left-5' : 'left-1'}`} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">Show my own pricing page 使用我的會員收費頁</span>
            <span className="block text-xs text-slate-400">
              {draft.enabled ? 'On: your clients see the page below. 開：您的客戶會看到以下收費頁。' : 'Off: your clients see the default pricing. 關：客戶會看到預設收費。'}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
            {([['edit', 'Edit 編輯', PencilLine], ['preview', 'Preview 預覽', Eye]] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === k ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <button onClick={resetToDefault} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white">
            <RotateCcw className="h-3.5 w-3.5" /> Use default 使用預設
          </button>
          <button
            onClick={save}
            disabled={saving || (!dirty && !isNew)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-colors hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save 儲存
          </button>
        </div>
      </section>

      {loadError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{loadError}</p>}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {dirty && !error && <p className="text-xs text-amber-300">Unsaved changes 有未儲存的修改</p>}

      {view === 'preview' ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-6 sm:p-10">
          <MembershipView page={toPage(draft)} />
        </div>
      ) : (
        <>
          <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/40 p-5">
            <h3 className="text-sm font-semibold text-white">Page text 頁面文字</h3>
            <Field label="Title 標題">
              <input value={draft.title} onChange={(e) => update({ title: e.target.value })} maxLength={80} className={inputCls} />
            </Field>
            <Field label="Intro 簡介">
              <textarea value={draft.subtitle} onChange={(e) => update({ subtitle: e.target.value })} maxLength={300} rows={2} className={inputCls} />
            </Field>
            <Field label="How to join 如何加入" hint="Payment method, contact details, etc. 付款方式、聯絡方法等。">
              <textarea value={draft.join_note} onChange={(e) => update({ join_note: e.target.value })} maxLength={600} rows={3} className={inputCls} />
            </Field>
          </section>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Plans 收費計劃 <span className="font-normal text-slate-500">({draft.plans.length}/{MAX_PLANS})</span>
            </h3>
            <button
              onClick={addPlan}
              disabled={draft.plans.length >= MAX_PLANS}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/10 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Add plan 新增計劃
            </button>
          </div>

          {draft.plans.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-700 py-10 text-center text-sm text-slate-500">No plans yet. Press &ldquo;Add plan 新增計劃&rdquo;. 尚未有計劃。</p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {draft.plans.map((p, i) => (
              <article key={p.key} className={`space-y-3 rounded-2xl border bg-slate-800/40 p-5 transition-colors ${p.highlight ? 'border-emerald-400/50' : 'border-slate-700'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan 計劃 {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updatePlan(p.key, { highlight: !p.highlight })}
                      aria-pressed={p.highlight}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${p.highlight ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
                    >
                      <Star className="h-3.5 w-3.5" /> Most popular 最受歡迎
                    </button>
                    <button onClick={() => movePlan(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => movePlan(i, 1)} disabled={i === draft.plans.length - 1} aria-label="Move down" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removePlan(p)} aria-label="Remove plan" className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name (English) *">
                    <input value={p.name} onChange={(e) => updatePlan(p.key, { name: e.target.value })} maxLength={40} placeholder="Starter" className={inputCls} />
                  </Field>
                  <Field label="中文名稱">
                    <input value={p.zh} onChange={(e) => updatePlan(p.key, { zh: e.target.value })} maxLength={40} placeholder="初級計劃" className={inputCls} />
                  </Field>
                </div>
                <Field label="Who it's for 適用對象">
                  <input value={p.audience} onChange={(e) => updatePlan(p.key, { audience: e.target.value })} maxLength={200} className={inputCls} />
                </Field>
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
                  <Field label="Price 價錢 (USD) *">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                      <input value={p.price} onChange={(e) => updatePlan(p.key, { price: e.target.value.replace(/[^0-9.]/g, '').slice(0, 9) })} inputMode="decimal" placeholder="50" className={`${inputCls} pl-7`} />
                    </div>
                  </Field>
                  <Field label="Billing text 收費單位">
                    <input value={p.period} onChange={(e) => updatePlan(p.key, { period: e.target.value })} maxLength={40} placeholder="/ signal / month" className={inputCls} />
                  </Field>
                </div>
                <Field label="Features 功能" hint={`One per line, up to ${MAX_FEATURES}. 每行一項，最多 ${MAX_FEATURES} 項。`}>
                  <textarea value={p.features} onChange={(e) => updatePlan(p.key, { features: e.target.value })} rows={4} className={inputCls} />
                </Field>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
