import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { BrandMark } from '@/components/agents/BrandMark';
import { AuthModal, type AuthMode } from '@/components/auth/AuthModal';
import { fetchPublicBrand, type PublicBrand } from '@/lib/agents';
import { fetchPublicMembershipPage, type MembershipPage } from '@/lib/membership';
import { PlanCard } from '@/pages/Membership';

export function PlanSharePage({ slug, planNumber, signedIn }: { slug: string | null; planNumber: number; signedIn: boolean }) {
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  const [page, setPage] = useState<MembershipPage | null>(null);
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([slug ? fetchPublicBrand(slug) : Promise.resolve({ brand: null }), fetchPublicMembershipPage(slug)]).then(([b, m]) => {
      if (!live) return;
      setBrand(b.brand);
      setPage(m.page);
      setError(m.error ?? '');
    });
    return () => {
      live = false;
    };
  }, [slug]);

  const plan = page?.plans[planNumber - 1];
  const name = brand?.brand_name ?? 'MyTrader Tools';
  const homeHref = brand ? `#/a/${brand.slug}` : '#/';

  useEffect(() => {
    if (plan) document.title = `${[plan.zh, plan.name].filter(Boolean).join(' · ')} · ${name}`;
  }, [plan, name]);

  const join = () => {
    if (signedIn) window.location.hash = '/signals';
    else setAuthMode(brand && !brand.signup_open ? 'signin' : 'signup');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-96 opacity-20"
        style={{ background: `radial-gradient(ellipse at top, ${brand?.brand_color ?? '#22d3ee'}, transparent 70%)` }}
      />
      <nav className="relative border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href={homeHref} className="flex min-w-0 items-center gap-2.5">
            {brand ? <BrandMark brand={brand} className="h-8 w-8 text-sm" /> : <Logo className="h-8 w-8" />}
            <span className="truncate font-semibold text-white">{name}</span>
          </a>
          {!signedIn && (
            <button onClick={() => setAuthMode('signin')} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
              Sign in 登入
            </button>
          )}
        </div>
      </nav>

      <main className="relative mx-auto max-w-md px-4 py-12 sm:px-6">
        {!page ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: brand?.brand_color ?? '#22d3ee' }} />
          </div>
        ) : !plan ? (
          <div className="py-12 text-center">
            <p className="text-lg font-semibold text-white">This plan is no longer available</p>
            <p className="mt-1 text-sm text-slate-400">此計劃已不存在，請查看其他計劃。</p>
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            <a href={homeHref} className="mt-6 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to {name} 返回
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500">Membership plan 會員計劃 · {name}</p>
            <PlanCard plan={plan} index={planNumber - 1} onJoin={join} joinLabel={signedIn ? 'Choose a signal 選擇信號' : 'Join now 請現在加入'} />
            {page.join_note && (
              <section className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-800/30 p-5 text-sm leading-relaxed text-slate-400">
                <ShieldCheck className="h-6 w-6 shrink-0" style={{ color: brand?.brand_color ?? '#67e8f9' }} />
                <div>
                  <p className="font-medium text-white">How to join 如何加入</p>
                  <p className="whitespace-pre-line" translate="no">{page.join_note}</p>
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {authMode && <AuthModal mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} brand={brand ?? undefined} />}
    </div>
  );
}
