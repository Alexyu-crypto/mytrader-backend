import { useEffect, useState } from 'react';
import { LayoutGrid, ChevronsRight, Loader2, Check, Clock, AlertTriangle } from 'lucide-react';
import { requestDesktopCommand, type DesktopCommand, type Installation } from '@/lib/terminalInstaller';
import { serverNow } from '@/lib/serverClock';

const EXPIRE_MS = 3 * 60_000;
const REFRESH_MS = 5_000;

type Phase = 'waiting' | 'done' | 'expired';

type Status = { phase: Phase; command: DesktopCommand; results: string[]; pendingResult: boolean };

function commandPhase(targets: Installation[]): Status | null {
  const latest = targets
    .filter((i) => i.desktop_command && i.desktop_command_at)
    .sort((a, b) => b.desktop_command_at!.localeCompare(a.desktop_command_at!))[0];
  if (!latest) return null;
  const at = latest.desktop_command_at!;
  const batch = targets.filter((i) => i.desktop_command_at === at);
  const command = latest.desktop_command!;
  const fresh = serverNow() - new Date(at).getTime() < EXPIRE_MS;
  const results = batch.map((i) => i.desktop_command_result).filter((r): r is string => !!r);
  if (batch.every((i) => i.desktop_command_picked_at)) {
    return fresh ? { phase: 'done', command, results, pendingResult: results.length < batch.length } : null;
  }
  return { phase: fresh ? 'waiting' : 'expired', command, results, pendingResult: false };
}

const LABEL: Record<DesktopCommand, string> = { arrange: '重新排位', nextpage: 'Next Page' };

const PHASE_VIEW: Record<Phase, { text: string; tone: string; Icon: typeof Check }> = {
  waiting: { text: '等待 VDS（最多 2 分鐘）', tone: 'text-amber-300', Icon: Clock },
  done: { text: 'VDS 已執行', tone: 'text-emerald-300', Icon: Check },
  expired: { text: 'VDS 無回應：離線或程式未更新', tone: 'text-red-300', Icon: AlertTriangle },
};

export function VdsDesktopControls({ targets, onChanged }: { targets: Installation[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<DesktopCommand | null>(null);
  const [error, setError] = useState('');
  const status = commandPhase(targets);
  const waiting = status?.phase === 'waiting' || !!status?.pendingResult;

  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(onChanged, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [waiting, onChanged]);

  const send = async (e: React.SyntheticEvent, command: DesktopCommand) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(command);
    setError('');
    try {
      await requestDesktopCommand(targets.map((i) => i.id), command);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  };

  const onKey = (e: React.KeyboardEvent, command: DesktopCommand) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      send(e, command);
    }
  };

  const btn = (command: DesktopCommand, Icon: typeof Check, title: string) => (
    <span
      role="button"
      tabIndex={0}
      aria-disabled={!!busy}
      title={title}
      onClick={(e) => send(e, command)}
      onKeyDown={(e) => onKey(e, command)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap transition-colors border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:border-cyan-400/60 active:scale-95 ${busy ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
    >
      {busy === command ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {LABEL[command]}
    </span>
  );

  const view = status && PHASE_VIEW[status.phase];

  return (
    <div className="flex flex-col items-start md:items-end gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1.5">
        {btn('arrange', LayoutGrid, '遙控 VDS 將 MT 視窗重新排位 · Arrange MT windows on the VDS')}
        {btn('nextpage', ChevronsRight, '遙控 VDS 顯示下一頁 MT · Show the next page of MT windows')}
      </div>
      {error ? (
        <span className="text-[11px] text-red-400">{error}</span>
      ) : view && status ? (
        <span className={`inline-flex items-center gap-1 text-[11px] ${view.tone}`}>
          <view.Icon className={`w-3 h-3 ${status.phase === 'waiting' ? 'animate-pulse' : ''}`} />
          {LABEL[status.command]} · {view.text}
        </span>
      ) : null}
      {!error && status?.results.map((r, i) => (
        <span key={i} className={`max-w-xs text-right text-[11px] ${/^(Error|No MT)/.test(r) ? 'text-red-300' : 'text-slate-400'}`}>{r}</span>
      ))}
    </div>
  );
}
