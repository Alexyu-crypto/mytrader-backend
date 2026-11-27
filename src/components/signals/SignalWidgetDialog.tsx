import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { useShareSlug } from '@/hooks/useShareSlug';
import {
  DEFAULT_CUSTOM_COLOR,
  LANG_LABELS,
  THEME_LABELS,
  WIDGET_SIZE,
  widgetEmbedCode,
  widgetUrl,
  type WidgetLang,
  type WidgetThemeKey,
} from '@/widget/widgetConfig';

const segment = (active: boolean) =>
  `px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 ${
    active ? 'bg-cyan-500 text-black' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
  }`;

export function SignalWidgetDialog({ accountName, onClose }: { accountName: string; onClose: () => void }) {
  const slug = useShareSlug();
  const [lang, setLang] = useState<WidgetLang>('zh');
  const [theme, setTheme] = useState<WidgetThemeKey>('standard');
  const [color, setColor] = useState(DEFAULT_CUSTOM_COLOR);
  const [frame, setFrame] = useState(true);
  const [copied, setCopied] = useState(false);

  const options = useMemo(() => ({ account: accountName, lang, theme, color, frame, slug: slug ?? null }), [accountName, lang, theme, color, frame, slug]);
  const origin = window.location.origin;
  const src = widgetUrl(origin, options);
  const code = widgetEmbedCode(origin, options);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => setCopied(false), [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch (err) {
      console.error('copy widget code failed', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-pop-in">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white">Add widget to your website 在網站添加小工具</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              The widget shows this signal's current figures and updates automatically. Paste the code into your website or social page.
              <br />
              信號小工具展示信號的當前資料，內容會自動更新。將代碼放到您的網站或社交網絡頁面，並可設定配色方案。
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[1fr_auto]">
          <div className="min-w-0 space-y-5">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-400">Signal 信號</p>
              <p translate="no" className="notranslate truncate rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{accountName}</p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-400">Language 語言</p>
              <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-slate-700">
                {LANG_LABELS.map(([key, label]) => (
                  <button key={key} onClick={() => setLang(key)} className={segment(lang === key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-400">Colour scheme 配色方案</p>
              <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-slate-700">
                {THEME_LABELS.map(([key, label]) => (
                  <button key={key} onClick={() => setTheme(key)} className={segment(theme === key)}>
                    {label}
                  </button>
                ))}
              </div>
              {theme === 'custom' && (
                <label className="mt-3 flex items-center gap-3 text-xs text-slate-300">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-slate-700 bg-transparent" />
                  Main colour 主色 <span className="font-mono tabular-nums text-slate-400">{color}</span>
                </label>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} className="h-4 w-4 rounded border-slate-600 accent-cyan-500" />
              Show frame 顯示框架
            </label>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-400">HTML code 小工具代碼</p>
                <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                  Open 開啟 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <textarea
                readOnly
                value={code}
                rows={4}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
              <button
                onClick={copy}
                className={`mt-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97] ${
                  copied ? 'bg-emerald-500 text-black' : 'bg-cyan-500 text-black hover:bg-cyan-400'
                }`}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied 已複製' : 'Copy code 複製代碼'}
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Preview 預覽</p>
            <div
              className="rounded-xl border border-slate-700 p-4"
              style={{ backgroundColor: '#e2e8f0', backgroundImage: 'linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%),linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,8px 8px' }}
            >
              <iframe key={src} src={src} title="Widget preview" width={WIDGET_SIZE.width} height={WIDGET_SIZE.height} style={{ border: 0, display: 'block', maxWidth: '100%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
