import { Check, Sparkles } from 'lucide-react';
import type { Lang, Localized } from '@/hooks/useLandingLang';

interface PlanCopy {
  accounts: string;
  audience: string;
  features: string[];
}

interface Plan {
  name: string;
  price: number;
  featured?: boolean;
  copy: Localized<PlanCopy>;
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 49,
    copy: {
      en: {
        accounts: 'Up to 20 accounts',
        audience: 'For small teams just growing past ten accounts. A low-cost way in.',
        features: ['MT4 → MT4 copying', 'Copy Groups', 'Live Positions', 'Trade History with copy delay'],
      },
      zh: {
        accounts: '最多 20 個戶口',
        audience: '啱啱由十幾個戶口起步嘅小團隊，低門檻入場。',
        features: ['MT4 → MT4 跟單', '跟單組別', '實時持倉', '交易記錄及跟單延遲'],
      },
    },
  },
  {
    name: 'Pro',
    price: 129,
    featured: true,
    copy: {
      en: {
        accounts: 'Up to 100 accounts',
        audience: 'The toolkit that keeps hundreds of accounts in order.',
        features: ['Everything in Starter', 'MT4 ⇄ MT5 cross-platform', 'Funding Reconciliation', 'EA Health monitoring', 'Telegram + sound alerts', 'Symbol mapping (XAUUSD.m)'],
      },
      zh: {
        accounts: '最多 100 個戶口',
        audience: '管理大量戶口都唔會亂，靠嘅就係呢套功能。',
        features: ['包括 Starter 所有功能', 'MT4 ⇄ MT5 跨平台', '出入金對數', 'EA 健康監察', 'Telegram + 聲音警報', '品種映射 (XAUUSD.m)'],
      },
    },
  },
  {
    name: 'Fund',
    price: 349,
    copy: {
      en: {
        accounts: 'Up to 300 accounts',
        audience: 'For institutions that care about stability above all.',
        features: ['Everything in Pro', 'Excel bulk import of groups', 'API access', 'Multi-VPS setup', 'Priority support'],
      },
      zh: {
        accounts: '最多 300 個戶口',
        audience: '機構級用量，最重視穩定性。',
        features: ['包括 Pro 所有功能', 'Excel 批量匯入組別', 'API 接入', '多 VPS 部署', '優先客服'],
      },
    },
  },
];

const LABELS: Localized<{ eyebrow: string; title: string; proof: string; month: string; popular: string; cta: string; note: string }> = {
  en: {
    eyebrow: 'Pricing',
    title: 'Pick the size of your desk',
    proof: 'We run 300 live accounts on this engine daily.',
    month: '/ month',
    popular: 'Most popular',
    cta: 'Get started',
    note: 'Non-custodial: we never hold or move client funds.',
  },
  zh: {
    eyebrow: '定價',
    title: '按你嘅團隊規模揀',
    proof: '我們每日用呢個引擎管理 300 個真實戶口。',
    month: '/ 月',
    popular: '主推',
    cta: '立即開始',
    note: '不經手資金：我們從不持有或轉移客戶資金。',
  },
};

export function Pricing({ lang, onStart }: { lang: Lang; onStart: () => void }) {
  const l = LABELS[lang];
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-white/5 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-cyan-400">{l.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl">{l.title}</h2>
          <p className="mt-4 text-slate-400">{l.proof}</p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => {
            const c = p.copy[lang];
            return (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
                  p.featured
                    ? 'border-cyan-500/40 bg-gradient-to-b from-cyan-500/10 to-[#0D0D0D] shadow-2xl shadow-cyan-500/10'
                    : 'border-white/5 bg-[#0D0D0D] hover:border-white/15'
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-8 inline-flex items-center gap-1 rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-black">
                    <Sparkles className="h-3 w-3" />
                    {l.popular}
                  </span>
                )}
                <p className="text-lg font-semibold text-white">{p.name}</p>
                <p className="mt-1 text-sm text-cyan-300">{c.accounts}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-bold tracking-tight">${p.price}</span>
                  <span className="text-sm text-slate-500">{l.month}</span>
                </p>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">{c.audience}</p>
                <ul className="mt-6 flex-1 space-y-3 border-t border-white/5 pt-6">
                  {c.features.map((f) => (
                    <li key={f} className="flex gap-3 text-sm text-slate-300">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.featured ? 'text-cyan-400' : 'text-slate-500'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onStart}
                  className={`mt-8 rounded-lg px-5 py-3 text-sm font-semibold transition-all ${
                    p.featured
                      ? 'bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-lg hover:shadow-cyan-500/25'
                      : 'border border-white/10 text-white hover:border-white/25 hover:bg-white/5'
                  }`}
                >
                  {l.cta}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">{l.note}</p>
      </div>
    </section>
  );
}
