export function DelayValue({ label, ms }: { label?: string; ms: number | null }) {
  if (ms === null) return null;
  const tone = ms < 0 ? 'text-slate-400' : ms <= 1000 ? 'text-emerald-400' : ms <= 3000 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center justify-end gap-2" title={ms < 0 ? 'Follower acted before the master (e.g. its own SL/TP hit)' : undefined}>
      {label && <span className="text-slate-500 text-[10px] uppercase">{label}</span>}
      <span className={`font-mono tabular-nums ${tone}`}>{ms > 0 ? '+' : ''}{(ms / 1000).toFixed(3)} s</span>
    </div>
  );
}
