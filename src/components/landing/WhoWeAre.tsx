import { ArrowRight, BellRing, Eye, Gauge, Handshake, HeartHandshake, Layers, LayoutGrid, ShieldCheck, Target, Wallet, Zap, type LucideIcon } from 'lucide-react';
import type { Lang, Localized } from '@/hooks/useLandingLang';

const PAIN_ICONS: LucideIcon[] = [Wallet, BellRing, Layers, Zap, Gauge, LayoutGrid];
const VALUE_ICONS: LucideIcon[] = [Eye, Target, HeartHandshake];

interface WhoCopy {
  eyebrow: string;
  title: string;
  titleMuted: string;
  caption: string;
  values: { title: string; text: string }[];
  story: { lead: string; strong?: string; tail?: string }[];
  partner: string;
  partnerSub: string;
  painEyebrow: string;
  painTitle: string;
  painNote: string;
  painLabel: string;
  fixLabel: string;
  pains: { pain: string; fix: string; feature: string }[];
}

const COPY: Localized<WhoCopy> = {
  en: {
    eyebrow: 'WHO WE ARE',
    title: 'Built by traders,',
    titleMuted: 'for traders.',
    caption: 'Traders and engineers, one desk',
    values: [
      { title: 'Transparency', text: 'Every trade and every millisecond of delay, in plain sight.' },
      { title: 'Discipline', text: 'Rules over emotions. Let the system execute for you.' },
      { title: 'On your side', text: 'We stand with traders, and only with traders.' },
    ],
    story: [
      { lead: 'We are a team of ', strong: 'seasoned investors and trading technologists', tail: '. After years in the markets, we know the pain investors and traders go through.' },
      { lead: 'Broker slippage and delayed fills, spreads that suddenly widen, market makers hunting stops, sudden swings in the market. ', strong: 'It can feel like the whole world is trading against you.' },
      { lead: 'That is why this system was born. Every loss we took and every sleepless night went into it, line by line, with one goal: ', strong: 'let traders focus on trading, not on fighting their tools or their broker.' },
      { lead: "We don't sell dreams, and we never touch client money. We build tools that work, and every feature comes from a pain we have lived through ourselves." },
    ],
    partner: 'Like-minded partners are always welcome to grow and build with us.',
    partnerSub: 'Brokers, IBs and trading teams: let us talk.',
    painEyebrow: 'From pain to solution',
    painTitle: 'How our features fight back',
    painNote: 'Every feature targets a real pain',
    painLabel: 'Pain',
    fixLabel: 'Solution',
    pains: [
      { pain: 'Deposits and withdrawals drag on', fix: 'Every request tracked until confirmed, overdue ones flagged red.', feature: 'Funding Reconciliation' },
      { pain: 'An EA stops and nobody notices', fix: 'Every EA watched live, problems pushed straight to your phone.', feature: 'EA Health + Telegram' },
      { pain: 'Every broker names symbols differently', fix: 'XAUUSD becomes XAUUSD.m automatically. MT4 and MT5 copy each other.', feature: 'Symbol Mapping' },
      { pain: 'Copies arrive late or silently fail', fix: 'Cloud engine copies in under a second, and missed copies trigger an alarm.', feature: 'Cloud Copy Engine' },
      { pain: 'Broker slippage and delays with no proof', fix: 'Every trade logs its delay, latency ranked by broker. Evidence in hand.', feature: 'Trade History + Latency' },
      { pain: 'Too many accounts when the market moves', fix: 'Pre-set order windows and fire them all with one click.', feature: 'Trader Manager' },
    ],
  },
  zh: {
    eyebrow: '我們是誰',
    title: '由交易員打造，',
    titleMuted: '為交易員而生。',
    caption: '交易員與技術人員並肩作戰',
    values: [
      { title: '透明', text: '每一張單、每一毫秒延遲都看得見。' },
      { title: '紀律', text: '用規則代替情緒，讓系統替你執行。' },
      { title: '同一陣線', text: '我們只站在交易員這一邊。' },
    ],
    story: [
      { lead: '我們是一群', strong: '資深投資人及投資技術人員', tail: '，在市場打滾多年，深深明白投資者及交易員的痛苦。' },
      { lead: 'Broker 的滑點與延遲成交、突然擴闊的點差、莊家精準的掃損、市場瞬間的急變 —— ', strong: '彷彿全世界都在與我們對著幹。' },
      { lead: '這套系統亦是因此而生。我們把多年實戰中吃過的虧、熬過的夜，一行一行寫進系統，目標只有一個：', strong: '讓交易員把精力放回交易本身，而不是與工具、與 Broker 搏鬥。' },
      { lead: '我們不賣夢想，亦從不經手客戶資金，只做真正有用的工具。每一個功能，都源於一個我們親身經歷過的痛點。' },
    ],
    partner: '我們歡迎志同道合的朋友一起發展及合作。',
    partnerSub: '經紀商、IB 及交易團隊，歡迎聯絡我們。',
    painEyebrow: '由痛點到方案',
    painTitle: '每個功能如何反擊',
    painNote: '每個功能都針對一個真實痛點',
    painLabel: '痛點',
    fixLabel: '方案',
    pains: [
      { pain: '出入金拖拖拉拉，數目對唔上', fix: '每筆申請追蹤到到帳為止，逾期自動標紅提示。', feature: '出入金核對' },
      { pain: 'EA 停咗都唔知，醒來已經錯過行情', fix: '實時監察每個 EA，一出事即時推送到手機。', feature: 'EA 健康監察 + Telegram' },
      { pain: '各家 Broker 品種名唔同，跟單跟唔到', fix: 'XAUUSD 自動對應 XAUUSD.m，MT4 與 MT5 互相跟單。', feature: '品種映射' },
      { pain: '跟單慢半拍、甩單無人知', fix: '雲端引擎一秒內複製到所有帳戶，甩單即時響鬧。', feature: '雲端跟單引擎' },
      { pain: 'Broker 滑點、延遲成交，口講無憑', fix: '每張單記錄開平倉延遲，連線延遲按券商排名，證據在手。', feature: '交易記錄 + 延遲' },
      { pain: '十幾個帳戶，行情一來手忙腳亂', fix: '預先設定多個下單視窗，時機一到一鍵全部發出。', feature: '交易經理' },
    ],
  },
};

export function WhoWeAre({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section id="about" className="relative scroll-mt-20 overflow-hidden border-t border-white/5 py-24">
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[5fr_6fr] lg:gap-16">
          <div>
            <p className="text-sm font-medium tracking-wider text-cyan-400">{c.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              {c.title}
              <br />
              <span className="text-slate-400">{c.titleMuted}</span>
            </h2>
            <figure className="group relative mt-8 overflow-hidden rounded-2xl border border-white/10">
              <img
                src="https://images.pexels.com/photos/8204311/pexels-photo-8204311.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                alt="Our team discussing trading strategies in front of market screens"
                loading="lazy"
                className="aspect-[16/10] w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <figcaption className="absolute bottom-4 left-4 right-4 flex items-center gap-2 text-sm font-medium text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                {c.caption}
              </figcaption>
            </figure>
            <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {c.values.map(({ title, text }, i) => {
                const Icon = VALUE_ICONS[i];
                return (
                  <div key={title} className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
                    <div>
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">{text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6 text-base leading-relaxed text-slate-300 md:text-lg">
            {c.story.map((p, i) => (
              <p key={i}>
                {p.lead}
                {p.strong && <span className={i === 2 ? 'font-semibold text-cyan-300' : 'font-semibold text-white'}>{p.strong}</span>}
                {p.tail}
              </p>
            ))}
            <div className="flex items-start gap-4 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-transparent p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
                <Handshake className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-white">{c.partner}</p>
                <p className="mt-1 text-sm text-slate-400">{c.partnerSub}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-cyan-400">{c.painEyebrow}</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{c.painTitle}</h3>
            </div>
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4 text-cyan-500" />
              {c.painNote}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {c.pains.map(({ pain, fix, feature }, i) => {
              const Icon = PAIN_ICONS[i];
              return (
                <div
                  key={feature}
                  className="group flex flex-col rounded-xl border border-white/5 bg-[#0D0D0D] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/25"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400/80">{c.painLabel}</span>
                  <p className="mt-2 font-semibold text-white">{pain}</p>
                  <div className="my-5 flex items-center gap-2 text-slate-600">
                    <span className="h-px flex-1 bg-white/5" />
                    <ArrowRight className="h-4 w-4 text-cyan-500 transition-transform group-hover:translate-x-0.5" />
                    <span className="h-px flex-1 bg-white/5" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">{c.fixLabel}</span>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{fix}</p>
                  <div className="mt-auto flex items-center gap-2 pt-5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400 transition-colors group-hover:bg-cyan-500/20">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium text-cyan-300">{feature}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
