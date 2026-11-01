import { useState } from 'react';
import { Check, Loader2, PackageX, X, XCircle, Clock } from 'lucide-react';
import { countOpenPositions, setRemoteUninstall, type Installation } from '@/lib/terminalInstaller';
import { serverNow } from '@/lib/serverClock';
import { useConfirm } from '@/hooks/useConfirm';

const PICKUP_SLOW_MS = 10 * 60_000;
const REMOVE_TIMEOUT_MS = 5 * 60_000;

export type UninstallPhase = 'waiting' | 'waiting_slow' | 'removing' | 'failed' | 'done';

export function uninstallPhase(r: Installation, now = serverNow()): UninstallPhase | null {
  if (!r.uninstall_requested_at) return null;
  if (r.status === 'uninstalled') return 'done';
  if (!r.uninstall_picked_at) return now - new Date(r.uninstall_requested_at).getTime() > PICKUP_SLOW_MS ? 'waiting_slow' : 'waiting';
  return now - new Date(r.uninstall_picked_at).getTime() > REMOVE_TIMEOUT_MS ? 'failed' : 'removing';
}

export const isUninstallPending = (r: Installation) => {
  const p = uninstallPhase(r);
  return p === 'waiting' || p === 'waiting_slow' || p === 'removing';
};

export function RemoteUninstallButton({ row, onChanged }: { row: Installation; onChanged: () => void }) {
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const phase = uninstallPhase(row);
  // A PC that syncs is running even if its first install report never arrived.
  const onPc = row.status === 'installed' || (row.status !== 'uninstalled' && row.synced_at != null);
  if (!onPc || (phase && phase !== 'failed')) return null;

  const request = async () => {
    setBusy(true);
    setError('');
    try {
      const open = await countOpenPositions(row.account_names);
      const where = row.machine_name ? `「${row.machine_name}」` : '這部 VPS';
      const warn = open > 0 ? `\n\n注意：這些帳戶仍有 ${open} 張持倉！解除後將停止跟單及平倉。\nWARNING: ${open} open positions will no longer be copied or closed.` : '';
      const ok = await ask(
        `從${where}遠端解除安裝全部 ${row.account_names.length} 個 MT 及 EA？\nRemove all ${row.account_names.length} MT terminals and the EA from this PC?${warn}\n\nVPS 會在 2–5 分鐘內執行。`,
        { tone: 'danger', title: 'Remote uninstall · 遠端解除安裝', confirmLabel: 'Remove · 移除' },
      );
      if (ok) {
        await setRemoteUninstall(row.id, true);
        onChanged();
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={request}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-xs font-medium hover:bg-red-500/20 hover:border-red-500/50 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageX className="w-3.5 h-3.5" />}
        {phase === 'failed' ? '再試解除 · Retry' : '遠端解除 · Uninstall'}
      </button>
      {error && <p className="text-[11px] text-red-400 max-w-[200px] text-right">{error}</p>}
    </div>
  );
}

const PHASE_VIEW: Record<UninstallPhase, { text: string; tone: string }> = {
  waiting: { text: '等待 VPS 接收解除指令（每 2–5 分鐘檢查一次）· Waiting for the PC', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  waiting_slow: { text: 'VPS 仍未接收：可能已關機、離線，或程式未更新。開機後會自動執行。· PC has not picked it up yet', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  removing: { text: 'VPS 正在關閉 MT 及刪除檔案… · Removing', tone: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
  failed: { text: '失敗：VPS 已接收但沒有回報完成，請再試或登入電腦檢查。· No confirmation from the PC', tone: 'text-red-300 border-red-500/30 bg-red-500/10' },
  done: { text: '成功：已從 VPS 遠端解除安裝 · Removed remotely', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
};

export function RemoteUninstallStatus({ row, onChanged }: { row: Installation; onChanged: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const phase = uninstallPhase(row);
  if (!phase) return null;
  const view = PHASE_VIEW[phase];
  const Icon = phase === 'done' ? Check : phase === 'failed' ? XCircle : phase === 'removing' ? Loader2 : Clock;
  const canCancel = phase === 'waiting' || phase === 'waiting_slow';

  const cancel = async () => {
    setCancelling(true);
    setError('');
    try {
      await setRemoteUninstall(row.id, false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
      onChanged();
    }
    setCancelling(false);
  };

  return (
    <div className={`mt-2 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${view.tone}`}>
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${phase === 'removing' ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">
        <p className="break-words">{view.text}</p>
        {error && <p className="text-red-400 mt-0.5">{error}</p>}
      </div>
      {canCancel && (
        <button
          onClick={cancel}
          disabled={cancelling}
          className="inline-flex items-center gap-1 shrink-0 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
        >
          {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          取消
        </button>
      )}
    </div>
  );
}
