import { useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Save, Shuffle, Trash2 } from 'lucide-react';
import { BrandMark } from '@/components/agents/BrandMark';
import { LOGO_TYPES, removeLogo, saveBranding, suggestBrandColor, uploadLogo, type Agent } from '@/lib/agents';
import { IconButton } from '@/components/IconButton';
import { useConfirm } from '@/hooks/useConfirm';

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20';
const HEX = /^#[0-9a-f]{6}$/i;

export function BrandingEditor({ agent, onSaved }: { agent: Agent; onSaved: () => void }) {
  const ask = useConfirm();
  const [form, setForm] = useState({
    brand_name: agent.brand_name,
    tagline: agent.tagline ?? '',
    contact: agent.contact ?? '',
    brand_color: agent.brand_color,
  });
  const [busy, setBusy] = useState<'' | 'save' | 'logo' | 'color'>('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    form.brand_name !== agent.brand_name || form.tagline !== (agent.tagline ?? '') || form.contact !== (agent.contact ?? '') || form.brand_color !== agent.brand_color;
  const validColor = HEX.test(form.brand_color);
  const preview = { ...agent, ...form, brand_color: validColor ? form.brand_color : agent.brand_color };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.brand_name.trim() || !validColor) return;
    setBusy('save');
    setError('');
    const err = await saveBranding(agent.id, { ...form, brand_name: form.brand_name.trim(), tagline: form.tagline.trim(), contact: form.contact.trim(), brand_color: form.brand_color.toLowerCase() });
    setBusy('');
    if (err) return setError(err);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  };

  const randomColor = async () => {
    setBusy('color');
    setError('');
    const { color, error: err } = await suggestBrandColor();
    setBusy('');
    if (err) return setError(err);
    if (color) setForm((f) => ({ ...f, brand_color: color }));
  };

  const pickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('logo');
    setError('');
    const { error: err } = await uploadLogo(agent, file);
    setBusy('');
    if (err) setError(err);
    else onSaved();
  };

  const clearLogo = async () => {
    if (!(await ask('Remove your logo? 確定移除 LOGO？', { tone: 'danger', confirmLabel: 'Remove · 移除' }))) return;
    setBusy('logo');
    const err = await removeLogo(agent);
    setBusy('');
    if (err) setError(err);
    else onSaved();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form onSubmit={save} className="space-y-6 rounded-2xl border border-slate-700 bg-slate-800/40 p-6">
        <div>
          <h3 className="text-sm font-semibold text-white">Logo</h3>
          <p className="mt-1 text-xs text-slate-500">PNG, JPG or WEBP, up to 1 MB. A square image works best. 建議使用正方形圖片，1 MB 以內。</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950 p-3">
              <BrandMark brand={preview} className="h-20 w-20 text-3xl" />
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept={Object.keys(LOGO_TYPES).join(',')} onChange={pickLogo} className="hidden" />
              <IconButton label={agent.logo_path ? 'Replace logo · 更換' : 'Upload logo · 上傳'} tone="solid" size="md" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                {busy === 'logo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </IconButton>
              {agent.logo_path && (
                <IconButton label="Remove logo · 移除" tone="red" size="md" onClick={clearLogo} disabled={!!busy}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Brand name 品牌名稱</span>
            <input required maxLength={60} value={form.brand_name} onChange={(e) => setForm({ ...form, brand_name: e.target.value })} className={INPUT} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Contact shown to clients 客戶聯絡方式</span>
            <input maxLength={120} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className={INPUT} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Tagline 標語</span>
            <input maxLength={140} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Professional MT4/MT5 copy trading" className={INPUT} />
          </label>
        </div>

        <div>
          <span className="mb-2 block text-xs font-medium text-slate-400">Brand colour 品牌顏色</span>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Every agent page has its own unique colour, different from other agents and from the main site's cyan. 每位代理商的網頁主色均獨一無二，不會與其他代理商或主網青色相同。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-8 w-8 rounded-full ring-2 ring-white/20" style={{ backgroundColor: preview.brand_color }} />
            <button
              type="button"
              onClick={randomColor}
              disabled={!!busy}
              className="flex h-8 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-40"
            >
              {busy === 'color' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
              Random 隨機配色
            </button>
            <input type="color" value={validColor ? form.brand_color : agent.brand_color} onChange={(e) => setForm({ ...form, brand_color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-transparent" aria-label="Custom colour" />
            <input value={form.brand_color} onChange={(e) => setForm({ ...form, brand_color: e.target.value.trim() })} maxLength={7} className={`w-28 ${INPUT} ${validColor ? '' : 'border-red-500/60'}`} />
          </div>
        </div>

        {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!dirty || busy !== '' || !validColor || !form.brand_name.trim()}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 disabled:opacity-40"
          >
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saved 已儲存' : 'Save changes 儲存'}
          </button>
        </div>
      </form>

      <aside className="h-fit rounded-2xl border border-slate-700 bg-[#070707] p-6 lg:sticky lg:top-24">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Client page preview 預覽</p>
        <div className="mt-6 flex flex-col items-center text-center">
          <BrandMark brand={preview} className="h-16 w-16 text-2xl" />
          <p className="mt-4 text-lg font-bold text-white">{form.brand_name || '—'}</p>
          <p className="mt-1 text-sm text-slate-400">{form.tagline || 'Professional copy trading for MT4 and MT5.'}</p>
          <span className="mt-5 rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ backgroundColor: preview.brand_color }}>
            Client Sign In 客戶登入
          </span>
        </div>
      </aside>
    </div>
  );
}
