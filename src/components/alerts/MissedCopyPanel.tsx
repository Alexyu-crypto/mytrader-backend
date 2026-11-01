import { BellRing, Check, CircleAlert, MonitorSmartphone, ShieldCheck, Siren, Volume2, VolumeX } from 'lucide-react';
import { STUCK_AFTER_MS, type MissedCopyAlarm } from '@/hooks/useMissedCopyAlarm';
import { IconButton } from '@/components/IconButton';
import { inFrame, type AlertResult } from '@/lib/desktopAlert';

const ALERT_PROBLEMS: Record<Exclude<AlertResult, 'shown'>, string> = {
  not_enabled: 'Desktop alerts are not turned on yet. Click the screen icon to allow them. 桌面通知未開啟。',
  blocked: 'Your browser is blocking notifications for this site. Click the lock icon next to the web address, allow Notifications, then reload. 瀏覽器已封鎖通知。',
  framed: 'Desktop alerts cannot work inside a preview window. Open the app in its own browser tab, then turn them on there. 請在獨立分頁開啟。',
  unsupported: 'This browser does not support desktop alerts. Use Chrome, Edge or Firefox on a computer. 此瀏覽器不支援桌面通知。',
  failed: 'The browser refused to show the pop-up. Check that notifications for your browser are allowed in your computer settings (Windows: Notifications & actions, Mac: System Settings > Notifications) and that Do Not Disturb or Focus is off. 請檢查電腦通知設定。',
};

export function MissedCopyPanel({ alarm }: { alarm: MissedCopyAlarm }) {
  const { missed } = alarm;
  const alerting = missed.length > 0;
  const problem: Exclude<AlertResult, 'shown'> | null =
    alarm.testResult && alarm.testResult !== 'shown'
      ? alarm.testResult
      : alarm.permission === 'unsupported'
        ? 'unsupported'
        : inFrame() && alarm.permission !== 'granted'
          ? 'framed'
          : null;

  return (
    <section className={`rounded-xl border p-5 transition-colors ${alerting ? 'bg-red-500/10 border-red-500/40' : 'bg-slate-800/50 border-slate-700'}`}>
      <div className="flex flex-wrap items-start gap-4">
        <span className={`p-2.5 rounded-lg border ${alerting ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
          {alerting ? <BellRing className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-[220px]">
          <h2 className="text-white font-semibold">Missed Copy Alarm · 甩單警報</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Flashes red and beeps for 10 seconds when a follower fails to open or close a copied trade, or has not done it within {STUCK_AFTER_MS / 1000} seconds. Works on every page while you are signed in. With desktop alerts on, you also get a pop-up and a flashing tab when you are in another tab or program.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label={alarm.muted ? 'Sound off, click to turn on · 聲音已關' : 'Sound on, click to mute · 聲音已開'} tone={alarm.muted ? 'slate' : 'green'} size="md" onClick={() => alarm.setMuted(!alarm.muted)}>
            {alarm.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </IconButton>
          {alarm.permission === 'granted' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <MonitorSmartphone className="w-4 h-4" /> Desktop alerts on
            </span>
          ) : alarm.permission === 'denied' ? (
            <span
              title="Your browser is blocking notifications for this site. Click the lock icon next to the web address and allow Notifications."
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30"
            >
              <MonitorSmartphone className="w-4 h-4" /> Desktop alerts blocked
            </span>
          ) : alarm.permission === 'default' && !inFrame() ? (
            <IconButton label="Turn on desktop alerts · 開啟桌面通知" tone="cyan" size="md" onClick={alarm.enableNotifications}>
              <MonitorSmartphone className="w-4 h-4" />
            </IconButton>
          ) : null}
          <IconButton label="Test alarm · 測試警報" size="md" onClick={alarm.test}>
            <Siren className="w-4 h-4" />
          </IconButton>
          {alerting && (
            <IconButton label="Acknowledge all · 全部確認" tone="red" size="md" onClick={alarm.acknowledge}>
              <Check className="w-4 h-4" />
            </IconButton>
          )}
        </div>
      </div>

      {alarm.testResult === 'shown' ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-400">
          <MonitorSmartphone className="w-4 h-4" /> Test pop-up sent. If you did not see it, check your computer's notification settings and Do Not Disturb. 測試通知已發出。
        </p>
      ) : (
        problem && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <CircleAlert className="mt-0.5 w-4 h-4 shrink-0" />
            {ALERT_PROBLEMS[problem]}
          </p>
        )
      )}

      {alerting ? (
        <ul className="mt-4 divide-y divide-red-500/20 border border-red-500/30 rounded-lg overflow-hidden">
          {missed.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm bg-slate-900/40">
              <span className="text-amber-400 font-medium">{m.follower}</span>
              <span className="text-slate-400">
                {m.action === 'close' ? 'did not close' : 'missed'} <span className="text-white font-medium">{m.symbol}</span> {m.lots} lot from <span className="text-cyan-400">{m.master}</span>
              </span>
              <span className="ml-auto text-xs text-slate-500 tabular-nums">{new Date(m.createdAt).toLocaleTimeString('en-GB')}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${m.kind === 'failed' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {m.kind === 'failed' ? (m.action === 'close' ? 'Failed to close' : 'Failed to open') : m.action === 'close' ? 'Close stuck' : 'Still not copied'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-emerald-400">No missed copies. The alarm is watching.</p>
      )}
    </section>
  );
}
