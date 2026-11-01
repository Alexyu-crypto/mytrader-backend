import type { ReactNode } from 'react';

const TONES = {
  red: 'text-red-300 bg-red-500/10 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40',
  green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40',
  cyan: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/40',
  amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/40',
  slate: 'text-slate-300 bg-slate-900 border-slate-700 hover:text-cyan-300 hover:border-cyan-500/40',
  ghost: 'text-slate-400 bg-transparent border-transparent hover:text-cyan-300 hover:bg-slate-700/60',
  solid: 'bg-cyan-500 text-white border-cyan-500 hover:bg-cyan-400',
  primary: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500',
};

export type IconTone = keyof typeof TONES;

export function Hint({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex group/hint ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 z-50 whitespace-nowrap rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs font-medium text-white shadow-lg opacity-0 translate-x-1 transition-all duration-150 group-hover/hint:opacity-100 group-hover/hint:translate-x-0"
      >
        {label}
      </span>
    </span>
  );
}

export function IconButton({
  label,
  tone = 'slate',
  size = 'sm',
  onClick,
  disabled,
  type = 'button',
  children,
}: {
  label: string;
  tone?: IconTone;
  size?: 'sm' | 'md';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  children: ReactNode;
}) {
  return (
    <Hint label={label}>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`inline-flex items-center justify-center ${size === 'md' ? 'w-10 h-10 rounded-lg' : 'w-7 h-7 rounded-md'} border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${TONES[tone]}`}
      >
        {children}
      </button>
    </Hint>
  );
}
