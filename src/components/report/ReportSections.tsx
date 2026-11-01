import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Bucket } from '@/lib/performance';

export function Section({ title, subtitle, icon: Icon, action, children }: { title: string; subtitle?: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden break-inside-avoid">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-700/80">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-white font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function KpiCard({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' | 'neutral' }) {
  const color = tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-red-400' : 'text-white';
  return (
    <div className="group bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 transition-all duration-200 hover:border-cyan-500/40 hover:-translate-y-0.5">
      <p className="text-slate-500 text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-slate-500 text-xs mt-1 truncate">{hint}</p>}
    </div>
  );
}

export function StatList({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y divide-slate-700/60">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <dt className="text-slate-400">{label}</dt>
          <dd className="text-white font-medium tabular-nums text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cellTone(v: number) {
  if (v >= 5) return 'bg-emerald-500/30 text-emerald-200';
  if (v > 0) return 'bg-emerald-500/15 text-emerald-300';
  if (v <= -5) return 'bg-red-500/30 text-red-200';
  if (v < 0) return 'bg-red-500/15 text-red-300';
  return 'text-slate-400';
}

export function MonthlyGrid({ monthly }: { monthly: Bucket[] }) {
  const byYear = new Map<string, Map<number, number>>();
  for (const m of monthly) {
    const [year, month] = m.label.split('-');
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year)!.set(Number(month) - 1, m.value);
  }
  const years = [...byYear.keys()].sort().reverse();
  if (years.length === 0) return <p className="text-center text-slate-500 text-sm py-10">Monthly returns will appear after the first closed trade</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 uppercase">
            <th className="text-left px-3 py-2 font-medium">Year</th>
            {MONTHS.map((m) => (
              <th key={m} className="px-1 py-2 font-medium text-center">{m}</th>
            ))}
            <th className="px-3 py-2 font-medium text-right">Year</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const months = byYear.get(year)!;
            const total = ([...months.values()].reduce((f, v) => f * (1 + v / 100), 1) - 1) * 100;
            return (
              <tr key={year}>
                <td className="px-3 py-1.5 text-slate-300 font-medium">{year}</td>
                {MONTHS.map((_, i) => {
                  const v = months.get(i);
                  return (
                    <td key={i} className="p-0.5">
                      <div className={`rounded-md py-1.5 text-center tabular-nums ${v === undefined ? 'text-slate-700' : cellTone(v)}`}>
                        {v === undefined ? '·' : `${v.toFixed(1)}%`}
                      </div>
                    </td>
                  );
                })}
                <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {total >= 0 ? '+' : ''}{total.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
