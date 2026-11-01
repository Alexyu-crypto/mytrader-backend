import { useEffect, useState } from 'react';
import { ArrowRight, CandlestickChart, Link2Off, Loader2, LogIn, ShieldCheck, Zap } from 'lucide-react';
import { AuthModal, type AuthMode } from '@/components/auth/AuthModal';
import { BrandMark } from '@/components/agents/BrandMark';
import { Logo } from '@/components/Logo';
import { LanguageMenu } from '@/components/LanguageMenu';
import { fetchPublicBrand, type PublicBrand } from '@/lib/agents';

const POINTS = [
  { icon: Zap, title: 'Fast copy trading', zh: '極速跟單', text: 'Follow professional signals on MT4 and MT5 with trades copied in moments.' },
  { icon: CandlestickChart, title: 'Live tracking', zh: '實時追蹤', text: 'See your live positions and full trade history any time, on any device.' },
  { icon: ShieldCheck, title: 'Secure account', zh: '安全帳戶', text: 'Your own private login. Only your linked accounts are visible to you.' },
];

export function AgentLanding({ slug }: { slug: string }) {
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [auth, setAuth] = useState<AuthMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchPublicBrand(slug).then(({ brand: b, error }) => {
      if (cancelled) return;
      setBrand(b);
      setState(error ? 'error' : b ? 'ready' : 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (brand) document.title = `${brand.brand_name} · Client Login`;
  }, [brand]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070707]">
        <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070707] px-6 text-center">
        <div className="max-w-md animate-fade-in">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
            <Link2Off className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-white">{state === 'error' ? 'Could not load this page 未能載入頁面' : 'This link is not active 此連結未啟用'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {state === 'error' ? 'Please check your connection and try again. 請檢查網絡後再試。' : 'The partner link may be mistyped or no longer in use. 連結可能有誤或已停用。'}
          </p>
          <a href="#/" className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5">
            Go to main site 前往主網站 <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  const color = brand.brand_color;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070707] text-white">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-25 blur-3xl" style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />

      <header className="relative mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-4 px-6 py-6">
        <div className="flex min-w-0 flex-nowrap items-center gap-3">
          <BrandMark brand={brand} className="h-10 w-10" />
          <span translate="no" className="truncate text-lg font-bold">{brand.brand_name}</span>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <LanguageMenu />
          <button onClick={() => setAuth('signin')} className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5">
            <LogIn className="h-4 w-4" /> Sign In 登入
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-12 lg:pt-20">
        <section className="mx-auto max-w-2xl text-center animate-fade-in">
          <BrandMark brand={brand} className="mx-auto h-24 w-24 text-4xl" />
          <h1 translate="no" className="mt-8 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{brand.brand_name}</h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">{brand.tagline || 'Professional copy trading for MT4 and MT5. 專業 MT4/MT5 跟單服務。'}</p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => setAuth('signin')}
              className="group flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-black shadow-lg transition-transform hover:-translate-y-0.5 sm:w-auto"
              style={{ backgroundColor: color, boxShadow: `0 12px 32px -12px ${color}` }}
            >
              Client Sign In 客戶登入
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            {brand.signup_open && (
              <button onClick={() => setAuth('signup')} className="w-full rounded-lg border border-white/15 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 sm:w-auto">
                Open an account 開立帳戶
              </button>
            )}
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, zh, text }, i) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-white/20 animate-fade-in"
              style={{ animationDelay: `${120 + i * 80}ms` }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22`, color }}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">
                {title} <span className="text-slate-500">{zh}</span>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="relative border-t border-white/5 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6 text-xs text-slate-500">
          <Logo className="h-4 w-4" /> Powered by MyTrader Tools
        </div>
      </footer>

      {auth && <AuthModal mode={auth} onModeChange={setAuth} onClose={() => setAuth(null)} brand={brand} />}
    </div>
  );
}
