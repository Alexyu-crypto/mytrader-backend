import { AlertOctagon, Check, HeartPulse, Volume2, VolumeX } from 'lucide-react';
import type { MissedCopyAlarm } from '@/hooks/useMissedCopyAlarm';
import { Hint } from '@/components/IconButton';

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
}

export function MissedCopyBanner({ alarm, onOpenHealth }: { alarm: MissedCopyAlarm; onOpenHealth: () => void }) {
  if (!alarm.active) return null;
  const { missed, testing } = alarm;
  const now = Date.now();

  return (
    <>
      <div className="fixed inset-0 z-[60] pointer-events-none animate-alarm-edge" aria-hidden />
      <button
        onClick={alarm.acknowledge}
        title="Stop the alarm and mark everything as healthy"
        className="group fixed bottom-6 left-1/2 -translate-x-1/2 lg:left-[calc(50%+8rem)] z-[61] inline-flex items-center gap-2.5 pl-4 pr-5 py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-2xl shadow-emerald-500/40 ring-4 ring-emerald-400/30 hover:ring-emerald-300/50 hover:scale-105 active:scale-100 transition-all animate-fade-in"
      >
        <span className="relative flex items-center justify-center w-7 h-7 rounded-full bg-slate-950/15">
          <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
          <HeartPulse className="relative w-4 h-4" />
        </span>
        <span className="leading-tight text-left">
          <span className="block text-sm">Resume healthy</span>
          <span className="block text-xs font-medium text-slate-900/80">恢復正常</span>
        </span>
      </button>
      <div role="alert" className="fixed top-0 right-0 left-0 lg:left-64 z-50 p-3 animate-fade-in">
        <div className="animate-alarm-flash rounded-xl border border-red-400/60 text-white px-4 py-3 shadow-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <AlertOctagon className="w-6 h-6 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-[200px]">
              <p className="font-bold leading-tight">
                {testing && missed.length === 0 ? 'Test alarm · 測試警報' : `甩單警報 · ${missed.length} missed cop${missed.length === 1 ? 'y' : 'ies'}`}
              </p>
              {!alarm.muted && !alarm.soundReady && <p className="text-red-100 text-xs mt-0.5">Click anywhere on the page once to enable the warning sound.</p>}
            </div>
            <div className="flex items-center gap-2">
              <Hint label={alarm.muted ? 'Turn sound on · 開啟聲音' : 'Mute sound · 靜音'}>
                <button
                  onClick={() => alarm.setMuted(!alarm.muted)}
                  aria-label={alarm.muted ? 'Turn sound on' : 'Mute sound'}
                  className="p-2 rounded-lg bg-black/25 hover:bg-black/40 transition-colors"
                >
                  {alarm.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </Hint>
              <button onClick={onOpenHealth} className="px-3 py-2 rounded-lg bg-black/25 hover:bg-black/40 text-sm font-medium transition-colors">
                View EA Health
              </button>
              <button
                onClick={alarm.acknowledge}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-red-700 hover:bg-red-50 text-sm font-bold transition-colors"
              >
                <Check className="w-4 h-4" /> Acknowledge
              </button>
            </div>
          </div>
          {missed.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {missed.slice(0, 3).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-2 bg-black/20 rounded-md px-3 py-1.5">
                  <span className="font-semibold">{m.follower}</span>
                  <span className="text-red-100">{m.action === 'close' ? 'did not close' : 'missed'}</span>
                  <span className="font-semibold">{m.symbol} {m.lots} lot</span>
                  <span className="text-red-100">from {m.master}</span>
                  <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded bg-black/30">
                    {m.kind === 'failed'
                      ? m.action === 'close' ? 'Failed to close' : 'Failed to open'
                      : `${m.action === 'close' ? 'Still open after' : 'Not copied after'} ${ago(now - m.createdAt)}`}
                  </span>
                </li>
              ))}
              {missed.length > 3 && (
                <li className="text-xs text-red-100 px-1">
                  and {missed.length - 3} more on the EA Health page
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
