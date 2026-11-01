import { useState } from 'react';
import { ArrowRight, CandlestickChart } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { AuthModal, type AuthMode } from '@/components/auth/AuthModal';
import { ShowcaseList, SOLUTION_SHOWCASES, TOOL_SHOWCASES } from '@/components/landing/FeatureShowcases';
import { CopyEngine } from '@/components/landing/CopyEngine';
import { Pricing } from '@/components/landing/Pricing';
import { WhoWeAre } from '@/components/landing/WhoWeAre';
import { LanguageMenu } from '@/components/LanguageMenu';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { ShareButton } from '@/components/share/ShareMenu';
import { siteShare } from '@/lib/share';
import { useLandingLang, type Localized } from '@/hooks/useLandingLang';

const CHIPS = ['Cloud copy engine', '<1s typical', 'Non-custodial'];

const STAT_VALUES = ['Reconciled', '42ms', '300', '$0'];

interface LandingCopy {
  nav: { id: string; label: string }[];
  strategies: string;
  signIn: string;
  getStarted: string;
  share: string;
  badge: string;
  h1: string;
  h1Accent: string;
  sub: string;
  launch: string;
  seeHow: string;
  stats: string[];
  solutionsEyebrow: string;
  solutionsTitle: string;
  solutionsSub: string;
  toolsEyebrow: string;
  toolsTitle: string;
  howEyebrow: string;
  howTitle: string;
  steps: { t: string; d: string }[];
  ctaTitle: string;
  ctaSub: string;
}

const COPY: Localized<LandingCopy> = {
  en: {
    nav: [
      { id: 'features', label: 'Solutions' },
      { id: 'engine', label: 'Copy Engine' },
      { id: 'pricing', label: 'Pricing' },
      { id: 'about', label: 'Who we are' },
    ],
    strategies: 'Strategies',
    signIn: 'Sign In',
    getStarted: 'Get Started',
    share: 'Share with friends',
    badge: 'MT4 + MT5 Multi-Broker Bridge',
    h1: 'One master.',
    h1Accent: '300 accounts in sync.',
    sub: 'Cross-platform copying, automatic XAUUSD.m suffix handling, and deposit and withdrawal reconciliation.',
    launch: 'Launch Dashboard',
    seeHow: 'See how it works',
    stats: ['Funding reconciliation', 'EA Health latency', 'Live accounts daily', 'Client funds held'],
    solutionsEyebrow: 'Pain → Solution',
    solutionsTitle: 'Built for the mess of many accounts',
    solutionsSub: 'The problems every multi-account desk runs into, and how we solve them.',
    toolsEyebrow: 'More tools',
    toolsTitle: 'Daily operations, covered',
    howEyebrow: 'How it works',
    howTitle: 'Live in three steps',
    steps: [
      { t: 'Install the EA', d: 'Attach the bridge EA to your master and follower terminals.' },
      { t: 'Link accounts', d: 'Choose which followers copy which master, and set lot rules.' },
      { t: 'Trade as usual', d: 'Trade on the master. Followers copy and close automatically.' },
    ],
    ctaTitle: 'Ready to sync your accounts?',
    ctaSub: 'Sign in to manage accounts, copy groups, funding and live positions.',
  },
  zh: {
    nav: [
      { id: 'features', label: '解決方案' },
      { id: 'engine', label: '跟單引擎' },
      { id: 'pricing', label: '定價' },
      { id: 'about', label: '我們是誰' },
    ],
    strategies: '策略',
    signIn: '登入',
    getStarted: '立即開始',
    share: '分享給朋友',
    badge: 'MT4 + MT5 多經紀商橋接',
    h1: '一個主帳戶，',
    h1Accent: '300 個戶口同步。',
    sub: '跨平台、自動處理 XAUUSD.m 後綴、出入金對數。',
    launch: '進入控制台',
    seeHow: '了解運作方式',
    stats: ['出入金對數', 'EA 健康監察延遲', '每日真實戶口', '持有客戶資金'],
    solutionsEyebrow: '痛點 → 解法',
    solutionsTitle: '專為多帳戶管理而設',
    solutionsSub: '多帳戶團隊一定撞到嘅問題，我哋點樣解決。',
    toolsEyebrow: '更多工具',
    toolsTitle: '日常操作，一應俱全',
    howEyebrow: '運作方式',
    howTitle: '三步即可上線',
    steps: [
      { t: '安裝 EA', d: '將橋接 EA 掛喺主帳戶及跟單帳戶嘅終端。' },
      { t: '連結帳戶', d: '揀邊個跟單帳戶跟邊個主帳戶，設定手數規則。' },
      { t: '照常交易', d: '喺主帳戶落單，跟單帳戶自動開倉及平倉。' },
    ],
    ctaTitle: '準備好同步你嘅戶口？',
    ctaSub: '登入管理帳戶、跟單組別、出入金及實時持倉。',
  },
};

export function Landing() {
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const lang = useLandingLang();
  const c = COPY[lang];
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

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
          <div data-wide-nav className="hidden min-w-0 items-center gap-5 text-sm text-slate-400 lg:flex xl:gap-7">
            {c.nav.map((n) => (
              <button key={n.id} onClick={() => scrollTo(n.id)} className="whitespace-nowrap transition-colors hover:text-white">
                {n.label}
              </button>
            ))}
            <a href="#/strategies" className="whitespace-nowrap transition-colors hover:text-white">
              {c.strategies}
            </a>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2">
            <LanguageMenu />
            <ShareButton variant="icon" label={c.share} heading={c.share} content={siteShare('landing_nav')} className="hidden border-white/10 sm:flex" />
            <button onClick={() => setAuth('signin')} className="rounded-lg px-3 py-2 text-sm leading-tight text-slate-300 transition-colors hover:bg-white/5 hover:text-white">
              {c.signIn}
            </button>
            <button
              onClick={() => setAuth('signup')}
              className="hidden max-w-[11rem] rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold leading-tight text-black transition-all hover:bg-cyan-400 hover:shadow-lg hover:shadow-cyan-500/25 sm:block"
            >
              {c.getStarted}
            </button>
          </div>
        </div>
      </nav>

      <header className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        <div key={lang} className="relative mx-auto max-w-7xl px-4 pb-24 pt-20 text-center sm:px-6 md:pt-28">
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium text-cyan-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            {c.badge}
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl animate-fade-up text-5xl font-bold leading-[1.1] tracking-tight md:text-7xl">
            {c.h1}{' '}
            <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-cyan-500 bg-clip-text text-transparent">{c.h1Accent}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg leading-relaxed text-slate-300">{c.sub}</p>
          <div className="mt-6 flex animate-fade-up flex-wrap items-center justify-center gap-2">
            {CHIPS.map((chip) => (
              <span key={chip} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-xs text-slate-300">
                {chip}
              </span>
            ))}
          </div>
          <div className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => setAuth('signin')}
              className="group flex items-center gap-2 rounded-lg bg-cyan-500 px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-cyan-400 hover:shadow-xl hover:shadow-cyan-500/30"
            >
              {c.launch}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => scrollTo('features')}
              className="rounded-lg border border-white/10 px-6 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              {c.seeHow}
            </button>
            <ShareButton
              label={c.share}
              heading={c.share}
              content={siteShare('landing_hero')}
              className="border border-white/10 px-6 py-3 font-medium hover:border-white/20 hover:bg-white/5 [&>span]:inline"
            />
          </div>

          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            {STAT_VALUES.map((v, i) => (
              <div key={v} className="rounded-xl border border-white/5 bg-white/[0.02] p-6 transition-colors hover:border-cyan-500/20">
                <p className={`font-bold tracking-tight text-white ${v.length > 6 ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'}`}>{v}</p>
                <p className="mt-1 text-xs text-slate-500">{c.stats[i]}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section id="features" className="scroll-mt-20 border-t border-white/5 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-20 max-w-2xl text-center">
            <p className="text-sm font-medium text-cyan-400">{c.solutionsEyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl">{c.solutionsTitle}</h2>
            <p className="mt-4 text-slate-400">{c.solutionsSub}</p>
          </div>
          <ShowcaseList items={SOLUTION_SHOWCASES} lang={lang} />
        </div>
      </section>

      <CopyEngine lang={lang} />

      <section className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-20 max-w-2xl text-center">
            <p className="text-sm font-medium text-cyan-400">{c.toolsEyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl">{c.toolsTitle}</h2>
          </div>
          <ShowcaseList items={TOOL_SHOWCASES} lang={lang} />
        </div>
      </section>

      <Pricing lang={lang} onStart={() => setAuth('signup')} />

      <WhoWeAre lang={lang} />

      <section id="how" className="scroll-mt-20 border-t border-white/5 py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-medium text-cyan-400">{c.howEyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl">{c.howTitle}</h2>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {c.steps.map((s, i) => (
              <div key={s.t} className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
                <span className="font-mono text-sm text-cyan-400">0{i + 1}</span>
                <h3 className="mt-3 font-semibold text-white">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-cyan-500/10 to-transparent p-10 text-center md:p-16">
            <CandlestickChart className="mx-auto h-10 w-10 text-cyan-400" />
            <h2 className="mt-6 text-3xl font-bold tracking-tight md:text-4xl">{c.ctaTitle}</h2>
            <p className="mx-auto mt-4 max-w-lg text-slate-400">{c.ctaSub}</p>
            <button
              onClick={() => setAuth('signin')}
              className="group mx-auto mt-8 flex items-center gap-2 rounded-lg bg-cyan-500 px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-cyan-400 hover:shadow-xl hover:shadow-cyan-500/30"
            >
              {c.launch}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </section>

      <LandingFooter lang={lang} />

      {auth && <AuthModal mode={auth} onModeChange={setAuth} onClose={() => setAuth(null)} />}
    </div>
  );
}
