import { useId } from 'react';

export function Logo({ className = 'w-9 h-9' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0 drop-shadow-[0_4px_12px_rgba(34,211,238,0.25)]`} role="img" aria-label="MyTrader Tools">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0369a1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <path d="M13 48 L24 37 L32 43 L47 28" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 34 L24 23 L32 29 L48 13 M38 13 H48 V23" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
