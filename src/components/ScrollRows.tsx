import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function ScrollRows({ rows, children, className = '' }: { rows: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const body = el.querySelector('tbody');
      const trs = body ? Array.from(body.children) as HTMLElement[] : [];
      if (trs.length <= rows) {
        setMaxHeight(undefined);
        return;
      }
      const top = el.getBoundingClientRect().top - el.scrollTop;
      setMaxHeight(Math.ceil(trs[rows].getBoundingClientRect().top - top));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [rows]);

  return (
    <div
      ref={ref}
      style={{ maxHeight }}
      className={`overflow-auto scrollbar-thin [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-slate-800 [&_thead_th]:shadow-[inset_0_-1px_0_#334155] ${className}`}
    >
      {children}
    </div>
  );
}
