export function Marker({ n }: { n: number }) {
  return (
    <span className="inline-flex w-5 h-5 rounded-full bg-cyan-500 text-slate-950 text-[11px] font-bold items-center justify-center flex-shrink-0 shadow-[0_0_0_3px_rgba(34,211,238,0.25)]">
      {n}
    </span>
  );
}

export function PreviewFrame({
  caption,
  legend,
  children,
}: {
  caption: string;
  legend: string[];
  children: React.ReactNode;
}) {
  return (
    <figure className="pt-1" role="img" aria-label={caption}>
      <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 sm:p-5 overflow-x-auto">
        <div className="min-w-[320px] select-none pointer-events-none" aria-hidden="true">
          {children}
        </div>
      </div>
      <figcaption className="text-slate-500 text-xs mt-2 space-y-1.5">
        <p>{caption}</p>
        {legend.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {legend.map((text, i) => (
              <span key={text} className="inline-flex items-center gap-1.5 text-slate-400">
                <Marker n={i + 1} /> {text}
              </span>
            ))}
          </div>
        )}
      </figcaption>
    </figure>
  );
}
