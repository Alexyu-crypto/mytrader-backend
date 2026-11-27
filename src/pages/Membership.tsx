import { useEffect, useState } from 'react';
import { ArrowRight, Check, Crown, Gem, Loader2, Rocket, ShieldCheck, Sparkles, Star, Zap } from 'lucide-react';
import { DEFAULT_PAGE, fetchAgentMembershipPage, type MembershipPage } from '@/lib/membership';

const ICONS = [Crown, Rocket, Gem, Star, Zap, ShieldCheck];

const STYLE = {
  normal: {
    ring: 'border-slate-700 hover:border-cyan-500/40',
    chip: 'bg-cyan-500/15 text-cyan-300',
    button: 'border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10',
    glow: 'from-cyan-500/10',
  },
  highlight: {
    ring: 'border-emerald-400/50 shadow-xl shadow-emerald-500/10',
    chip: 'bg-emerald-500/15 text-emerald-300',
    button: 'bg-emerald-400 text-slate-950 hover:bg-emerald-300',
    glow: 'from-emerald-500/15',
  },
};

function gridCols(n: number) {
  if (n <= 1) return 'md:grid-cols-1 max-w-md mx-auto';
  if (n === 2 || n === 4) return 'md:grid-cols-2';
  return 'md:grid-cols-2 lg:grid-cols-3';
}

export function MembershipView({ page, onJoin }: { page: MembershipPage; onJoin?: () => void }) {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="text-center animate-fade-up">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
          <Sparkles className="h-3.5 w-3.5" /> Membership 會員收費
        </span>
        {page.title && <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">{page.title}</h1>}
        {page.subtitle && <p className="mx-auto mt-3 max-w-xl whitespace-pre-line text-sm leading-relaxed text-slate-400">{page.subtitle}</p>}
      </header>

      {page.plans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 py-12 text-center text-sm text-slate-500">No plans yet 尚未有計劃</p>
      ) : (
        <div className={`grid gap-6 ${gridCols(page.plans.length)}`}>
          {page.plans.map((plan, i) => {
            const s = plan.highlight ? STYLE.highlight : STYLE.normal;
            const Icon = ICONS[i % ICONS.length];
            return (
              <article
                key={`${plan.name}-${i}`}
                style={{ animationDelay: `${i * 80}ms` }}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-slate-800/40 p-6 transition-all duration-300 hover:-translate-y-1 sm:p-8 animate-fade-up ${s.ring}`}
              >
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b ${s.glow} to-transparent`} />
                {plan.highlight && (
                  <span className="absolute right-5 top-5 rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">Most popular 最受歡迎</span>
                )}
                <div className="relative">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.chip}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="mt-5 text-xl font-bold text-white">
                    {plan.zh ? (
                      <>
                        {plan.zh} <span className="font-medium text-slate-400">· {plan.name}</span>
                      </>
                    ) : (
                      plan.name
                    )}
                  </h2>
                  {plan.audience && <p className="mt-1 text-sm leading-relaxed text-slate-400">{plan.audience}</p>}
                  <p className="mt-6 flex flex-wrap items-end gap-x-1.5">
                    <span className="text-5xl font-bold tracking-tight text-white">${plan.price}</span>
                    {plan.period && <span className="pb-1.5 text-sm text-slate-400">{plan.period}</span>}
                  </p>
                </div>

                <ul className="relative mt-6 flex-1 space-y-3 border-t border-slate-700/70 pt-6">
                  {plan.features.map((f, j) => (
                    <li key={`${f}-${j}`} className="flex items-start gap-3 text-sm text-slate-200">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.chip}`}>
                        <Check className="h-3 w-3" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={onJoin}
                  disabled={!onJoin}
                  className={`relative mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-default ${s.button}`}
                >
                  Join now 請現在加入 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      {page.join_note && (
        <section className="flex flex-col items-start gap-4 rounded-2xl border border-slate-700 bg-slate-800/30 p-6 sm:flex-row sm:items-center">
          <ShieldCheck className="h-8 w-8 shrink-0 text-cyan-300" />
          <div className="text-sm leading-relaxed text-slate-400">
            <p className="font-medium text-white">How to join 如何加入</p>
            <p className="whitespace-pre-line">{page.join_note}</p>
          </div>
        </section>
      )}
    </div>
  );
}

export function Membership({ useAgentPage, onJoin }: { useAgentPage: boolean; onJoin: () => void }) {
  const [page, setPage] = useState<MembershipPage | null>(useAgentPage ? null : DEFAULT_PAGE);

  useEffect(() => {
    if (!useAgentPage) {
      setPage(DEFAULT_PAGE);
      return;
    }
    let live = true;
    fetchAgentMembershipPage().then((res) => {
      if (!live) return;
      setPage(res.page && res.page.enabled && res.page.plans.length > 0 ? res.page : DEFAULT_PAGE);
    });
    return () => {
      live = false;
    };
  }, [useAgentPage]);

  if (!page) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }
  return <MembershipView page={page} onJoin={onJoin} />;
}
