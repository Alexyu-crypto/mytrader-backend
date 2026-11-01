import { ArrowRight, Check, Crown, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { PLANS, type Plan } from '@/lib/membership';

const STYLE: Record<Plan['id'], { icon: typeof Crown; ring: string; chip: string; button: string; glow: string }> = {
  advanced: {
    icon: Crown,
    ring: 'border-slate-700 hover:border-cyan-500/40',
    chip: 'bg-cyan-500/15 text-cyan-300',
    button: 'border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10',
    glow: 'from-cyan-500/10',
  },
  starter: {
    icon: Rocket,
    ring: 'border-emerald-400/50 shadow-xl shadow-emerald-500/10',
    chip: 'bg-emerald-500/15 text-emerald-300',
    button: 'bg-emerald-400 text-slate-950 hover:bg-emerald-300',
    glow: 'from-emerald-500/15',
  },
};

export function Membership({ onJoin }: { onJoin: () => void }) {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="text-center animate-fade-up">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
          <Sparkles className="h-3.5 w-3.5" /> Membership 會員收費
        </span>
        <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">請現在加入 · Join now</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          Priced per signal, per month, in USD (USDT). Pick the plan that fits how you trade. 按每個信號每月收費，以美元 (USDT) 計算。
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan, i) => {
          const s = STYLE[plan.id];
          const Icon = s.icon;
          return (
            <article
              key={plan.id}
              style={{ animationDelay: `${i * 80}ms` }}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-slate-800/40 p-6 transition-all duration-300 hover:-translate-y-1 sm:p-8 animate-fade-up ${s.ring}`}
            >
              <div className={`pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b ${s.glow} to-transparent`} />
              {plan.id === 'starter' && (
                <span className="absolute right-5 top-5 rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">Most popular 最受歡迎</span>
              )}
              <div className="relative">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.chip}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-5 text-xl font-bold text-white">
                  {plan.zh} <span className="font-medium text-slate-400">· {plan.name}</span>
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{plan.audience}</p>
                <p className="mt-6 flex items-end gap-1.5">
                  <span className="text-5xl font-bold tracking-tight text-white">${plan.price}</span>
                  <span className="pb-1.5 text-sm text-slate-400">USD (USDT) / signal / month</span>
                </p>
                <p className="text-xs text-slate-500">每一個 signal 每月收費</p>
              </div>

              <ul className="relative mt-6 flex-1 space-y-3 border-t border-slate-700/70 pt-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-slate-200">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.chip}`}>
                      <Check className="h-3 w-3" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <button onClick={onJoin} className={`relative mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${s.button}`}>
                Join now 請現在加入 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </article>
          );
        })}
      </div>

      <section className="flex flex-col items-start gap-4 rounded-2xl border border-slate-700 bg-slate-800/30 p-6 sm:flex-row sm:items-center">
        <ShieldCheck className="h-8 w-8 shrink-0 text-cyan-300" />
        <div className="text-sm leading-relaxed text-slate-400">
          <p className="font-medium text-white">How to join 如何加入</p>
          Choose a signal on the Signals page and send a copy application. Our team will contact you to confirm your plan and payment.
          在「交易信號」頁選擇信號並提交跟單申請，我們會聯絡您確認計劃及付款。
        </div>
      </section>
    </div>
  );
}
