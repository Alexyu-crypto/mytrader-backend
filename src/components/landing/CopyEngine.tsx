import { Gauge, Layers, Server, ShieldCheck } from 'lucide-react';
import { TerminalMock } from '@/components/landing/TerminalMock';
import type { Lang, Localized } from '@/hooks/useLandingLang';

const ICONS = [Layers, Server, Gauge, ShieldCheck];

const COPY: Localized<{ eyebrow: string; title: string; titleMuted: string; text: string; proof: string; points: { title: string; text: string }[] }> = {
  en: {
    eyebrow: 'Copy Engine',
    title: 'Real logs.',
    titleMuted: 'Real suffixes handled.',
    text: 'Master buys at 09:41:02.118. The MT4 follower is filled at 09:41:02.352, with the symbol mapped to XAUUSD.m automatically. Typically under a second.',
    proof: 'We run 300 live accounts on this engine daily.',
    points: [
      { title: 'Symbol mapping', text: 'XAUUSD on the master becomes XAUUSD.m on the follower. MT4 and MT5, across brokers.' },
      { title: 'Cloud copy engine', text: 'Copy logic runs in the cloud. Terminals only send and receive, nothing to babysit.' },
      { title: 'Risk rules per follower', text: 'Lot multipliers, balance ratio, max trades, symbol filters, Friday close, weekend pause.' },
      { title: 'Non-custodial', text: "We only copy orders. Client money always stays at the broker, in the client's own account." },
    ],
  },
  zh: {
    eyebrow: '跟單引擎',
    title: '真實日誌，',
    titleMuted: '真正處理到後綴問題。',
    text: '主帳戶 09:41:02.118 落單，MT4 跟單帳戶 09:41:02.352 成交，品種自動轉成 XAUUSD.m。一般少於一秒。',
    proof: '我們每日用呢個引擎管理 300 個真實戶口。',
    points: [
      { title: '品種映射', text: '主帳戶嘅 XAUUSD 自動對應跟單帳戶嘅 XAUUSD.m，MT4 與 MT5 跨券商照跟。' },
      { title: '雲端引擎', text: '跟單邏輯喺雲端運行，終端只負責收發，唔使你照顧。' },
      { title: '每個帳戶獨立風控', text: '手數倍數、餘額比例、最大單數、品種篩選、週五平倉、週末暫停。' },
      { title: '不經手資金', text: '我們只複製指令，客戶資金永遠留喺經紀商、客戶自己嘅戶口。' },
    ],
  },
};

export function CopyEngine({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section id="engine" className="scroll-mt-20 border-t border-white/5 py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-cyan-400">{c.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-bold leading-tight tracking-tight md:text-5xl">
            {c.title}
            <br />
            <span className="text-slate-400">{c.titleMuted}</span>
          </h2>
          <p className="mt-5 leading-relaxed text-slate-300">{c.text}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {c.points.map(({ title, text }, i) => {
              const Icon = ICONS[i];
              return (
                <div key={title} className="group rounded-xl border border-white/5 bg-[#0D0D0D] p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-500/20">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 transition-colors group-hover:bg-cyan-500/20">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <TerminalMock />
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {c.proof}
          </p>
        </div>
      </div>
    </section>
  );
}
