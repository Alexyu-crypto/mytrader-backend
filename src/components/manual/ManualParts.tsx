import { createContext, useContext } from 'react';
import { AlertTriangle, BookOpen, ChevronDown, Lightbulb } from 'lucide-react';

const InsideFold = createContext(false);

export function SectionHeader({
  id,
  icon: Icon,
  title,
  intro,
  audience,
}: {
  id: string;
  icon: typeof BookOpen;
  title: string;
  intro: string;
  audience?: string;
}) {
  if (useContext(InsideFold)) return <p className="text-slate-400 text-sm leading-relaxed mb-5">{intro}</p>;
  return (
    <div id={id} className="scroll-mt-24 flex items-start gap-3 mb-6">
      <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-cyan-400" />
      </div>
      <div>
        {audience && (
          <span className="inline-block mb-1.5 text-[11px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5">
            適用：{audience}
          </span>
        )}
        <h2 className="text-xl font-bold text-white leading-tight">{title}</h2>
        <p className="text-slate-400 text-sm mt-1 leading-relaxed">{intro}</p>
      </div>
    </div>
  );
}

export function Item({ n, title, children }: { n: number | string; title: string; children: React.ReactNode }) {
  return (
    <div className="group flex gap-4 bg-slate-800/50 border border-slate-700 rounded-xl p-5 transition-colors hover:border-slate-600">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm transition-transform group-hover:scale-110">
        {n}
      </div>
      <div className="flex-1 min-w-0 space-y-2 text-sm text-slate-300 leading-relaxed">
        <h3 className="text-white font-semibold text-base leading-tight">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Callout({ tone, children }: { tone: 'tip' | 'warn'; children: React.ReactNode }) {
  const styles =
    tone === 'tip'
      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
      : 'bg-amber-500/10 border-amber-500/20 text-amber-200';
  const Icon = tone === 'tip' ? Lightbulb : AlertTriangle;
  return (
    <div className={`flex gap-2 border rounded-lg px-3 py-2 ${styles}`}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Path({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-cyan-300 bg-slate-900 px-1.5 py-0.5 rounded">{children}</span>;
}

export function Term({ children }: { children: React.ReactNode }) {
  return <span className="text-white font-medium">{children}</span>;
}

export function ManualFold({
  id,
  index,
  icon: Icon,
  label,
  desc,
  who,
  open,
  onToggle,
  children,
}: {
  id: string;
  index?: number;
  icon: typeof BookOpen;
  label: string;
  desc: string;
  who?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-24 rounded-xl border transition-colors ${open ? 'border-cyan-500/30 bg-slate-800/30' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}>
      <button onClick={onToggle} aria-expanded={open} className="group w-full flex items-center gap-3 text-left p-4">
        <span className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110">
          <Icon className="w-4 h-4 text-cyan-400" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {index != null && <span className="text-slate-500 text-xs font-mono">{String(index).padStart(2, '0')}</span>}
            <span className="text-white font-semibold text-sm">{label}</span>
            {who && <span className="text-[10px] text-slate-400 border border-slate-700 rounded-full px-2 py-0.5">{who}</span>}
          </span>
          <span className="block text-slate-400 text-xs mt-1 leading-relaxed truncate">{desc}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180 text-cyan-400' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-5 sm:px-5 animate-fade-in">
          <InsideFold.Provider value={true}>{children}</InsideFold.Provider>
        </div>
      )}
    </section>
  );
}
