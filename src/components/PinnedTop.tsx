import type { ReactNode } from 'react';

export function PinnedTop({ children }: { children: ReactNode }) {
  return (
    <div className="z-[11] -mx-4 space-y-3 bg-slate-900/95 px-4 py-3 backdrop-blur lg:sticky lg:top-[61px] lg:-mx-8 lg:px-8 lg:shadow-lg lg:shadow-black/30">
      {children}
    </div>
  );
}
