import { DelayValue } from '@/components/copy/DelayValue';
import type { OriginReason, TimingPart, TradeTiming } from '@/lib/tradeOrigin';

const REASONS: Record<OriginReason, { label: string; hint: string; tone: string }> = {
  master: { label: 'Signal source · 信號源', hint: 'Master trade. Followers copy from this, so there is no delay.', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' },
  manual_open: { label: 'Manual · 人手開倉', hint: 'Opened directly in MT4/MT5, not by a copy signal.', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  oneclick_close: { label: 'One-click · 一鍵平倉', hint: 'Closed from this dashboard with the close button, not by the master.', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  own_close: { label: 'Own close · 自行平倉', hint: 'Closed on the terminal itself: stop loss, take profit, stop out or closed by hand, not by a copy signal.', tone: 'text-slate-300 bg-slate-500/10 border-slate-500/30' },
  no_master_record: { label: 'No master record · 缺主單', hint: 'This trade was copied, but the master trade is not in the history yet.', tone: 'text-slate-400 bg-slate-700/30 border-slate-600/40' },
};

function ReasonTag({ label, reason }: { label?: string; reason: OriginReason }) {
  const meta = REASONS[reason];
  return (
    <div className="flex items-center justify-end gap-2" title={meta.hint}>
      {label && <span className="text-slate-500 text-[10px] uppercase">{label}</span>}
      <span className={`px-1.5 py-0.5 rounded border text-[10px] leading-4 font-medium cursor-help ${meta.tone}`}>{meta.label}</span>
    </div>
  );
}

function Part({ label, part }: { label: string; part: TimingPart }) {
  return part.kind === 'delay' ? <DelayValue label={label} ms={part.ms} /> : <ReasonTag label={label} reason={part.reason} />;
}

export function TimingCell({ timing }: { timing: TradeTiming | undefined }) {
  if (!timing) return <span className="text-slate-600">—</span>;
  if ('source' in timing) return <ReasonTag reason="master" />;
  return (
    <div className="space-y-1">
      <Part label="Open" part={timing.open} />
      <Part label="Close" part={timing.close} />
    </div>
  );
}
