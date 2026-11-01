import { useState } from 'react';
import { ArrowLeft, Globe2, Radio, TriangleAlert } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { AuthModal, type AuthMode } from '@/components/auth/AuthModal';
import { ShowcaseList, type Showcase } from '@/components/landing/FeatureShowcases';
import { EaLibraryPreview } from '@/components/landing/EaLibraryPreview';
import { LanguageMenu } from '@/components/LanguageMenu';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { useLandingLang, type Localized } from '@/hooks/useLandingLang';

const STRATEGY_SHOWCASES: Showcase[] = [
  {
    icon: Radio,
    copy: {
      en: {
        title: 'Trading Signals',
        text: 'Live performance of every master account. Members can browse signals and apply to copy them.',
        points: ['Profit curve, drawdown and win rate per signal', 'Sort by profit, lowest drawdown or longest record', 'Apply to copy in one tap', 'Share signals with friends'],
      },
      zh: {
        title: '交易信號',
        text: '所有主帳戶嘅實時表現，會員可瀏覽並申請跟單。',
        points: ['每個信號嘅盈利曲線、回撤、勝率', '按盈利、最低回撤或最長記錄排序', '一鍵申請跟單', '分享信號俾朋友'],
      },
    },
    image: 'image copy 8.png',
    alt: 'Trading Signals page with performance cards for each master account',
  },
  {
    icon: Globe2,
    copy: {
      en: {
        title: 'Strategy EA Library',
        text: 'We search the world for outstanding trading strategies and turn them into EAs you can use straight away.',
        points: ['Strategies from traders worldwide', 'Ready-made EAs for MT4 and MT5', 'Clear rules for entry, take profit and stop loss', 'Download in one click and copy to all followers'],
      },
      zh: {
        title: '精選大師策略 EA',
        text: '搜羅全球傑出交易策略，化身為 EA，下載即可使用。',
        points: ['全球交易員嘅策略', 'MT4 / MT5 現成 EA', '入場、止賺、止蝕規則清晰', '一鍵下載，自動跟單到所有帳戶'],
      },
    },
    preview: (lang) => <EaLibraryPreview lang={lang} />,
    alt: 'Strategy EA library with ready-to-use EAs',
  },
];

const COPY: Localized<{ back: string; signIn: string; eyebrow: string; title: string; sub: string; warning: string }> = {
  en: {
    back: 'Back to tools',
    signIn: 'Sign In',
    eyebrow: 'STRATEGIES',
    title: 'Signals & Strategy EAs',
    sub: 'Optional extras for members who want ready-made strategies on top of the multi-account tools.',
    warning: 'Past performance does not guarantee future results. Figures shown are examples, and some strategies carry high risk.',
  },
  zh: {
    back: '返回工具',
    signIn: '登入',
    eyebrow: '策略與信號',
    title: '交易信號及策略 EA',
    sub: '為想用現成策略嘅會員而設，與多帳戶管理工具分開提供。',
    warning: '過往表現不代表將來回報。所示數字僅作示範，部分策略風險較高，請量力而為。',
  },
};

export function Strategies() {
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const lang = useLandingLang();
  const c = COPY[lang];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white antialiased">
      <nav className="sticky top-0 z-40 border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl flex-nowrap items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#/" className="flex shrink-0 items-center gap-2.5">
            <Logo className="h-9 w-9" />
            <span translate="no" className="hidden text-lg font-bold tracking-tight sm:inline">
              MyTrader <span className="text-cyan-400">Tools</span>
            </span>
          </a>
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            <a href="#/" className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{c.back}</span>
            </a>
            <LanguageMenu />
            <button onClick={() => setAuth('signin')} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold leading-tight text-black transition-colors hover:bg-cyan-400">
              {c.signIn}
            </button>
          </div>
        </div>
      </nav>

      <header className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        <div key={lang} className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <p className="animate-fade-up text-sm font-medium tracking-wider text-cyan-400">{c.eyebrow}</p>
          <h1 className="mt-3 animate-fade-up text-4xl font-bold leading-tight tracking-tight md:text-6xl">{c.title}</h1>
          <p className="mx-auto mt-5 max-w-xl animate-fade-up leading-relaxed text-slate-400">{c.sub}</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="mx-auto mb-20 flex max-w-3xl items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 text-sm leading-relaxed text-amber-100/80">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <p>{c.warning}</p>
        </div>
        <ShowcaseList items={STRATEGY_SHOWCASES} lang={lang} />
      </main>

      <LandingFooter lang={lang} />

      {auth && <AuthModal mode={auth} onModeChange={setAuth} onClose={() => setAuth(null)} />}
    </div>
  );
}
