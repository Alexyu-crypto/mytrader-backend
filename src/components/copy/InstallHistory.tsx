import { useCallback, useEffect, useState } from 'react';
import { Cpu, HardDrive, Monitor, RefreshCw, RefreshCcw, Trash2 } from 'lucide-react';
import { loadInstallations, removeInstallation, type Installation, type InstallStatus } from '@/lib/terminalInstaller';
import { isUninstallPending, RemoteUninstallButton, RemoteUninstallStatus } from '@/components/copy/RemoteUninstall';
import { useConfirm } from '@/hooks/useConfirm';

const STATUS: Record<InstallStatus, { label: string; tone: string }> = {
  pending: { label: 'Not used yet · 未使用', tone: 'text-slate-300 bg-slate-700/60 border-slate-600' },
  checking: { label: 'Checking PC · 檢測中', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' },
  installing: { label: 'Installing · 安裝中', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' },
  installed: { label: 'Installed · 已安裝', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  blocked: { label: 'Too many for PC · 超出容量', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  failed: { label: 'Failed · 失敗', tone: 'text-red-300 bg-red-500/10 border-red-500/30' },
  uninstalled: { label: 'Uninstalled · 已解除', tone: 'text-slate-400 bg-slate-800 border-slate-700' },
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function InstallHistory({ master, refreshKey }: { master: string; refreshKey: number }) {
  const ask = useConfirm();
  const [rows, setRows] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setRows(await loadInstallations(master));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
    if (!silent) setLoading(false);
  }, [master]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const pending = rows.some(isUninstallPending);
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => load(true), 15_000);
    return () => clearInterval(id);
  }, [pending, load]);

  const reloadSilently = () => load(true);

  const remove = async (row: Installation) => {
    const msg =
      row.status === 'installed'
        ? 'Remove this record? The PC keeps its terminals, but its Uninstall shortcut will no longer report back here.\n刪除紀錄？電腦上的 MT 不會被移除。'
        : 'Remove this record? Its install file will stop working.\n刪除紀錄？該安裝檔將失效。';
    if (!(await ask(msg, { tone: 'danger', confirmLabel: 'Remove · 移除' }))) return;
    setBusy(row.id);
    try {
      await removeInstallation(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Latest 10 packages for this group · 最近 10 個安裝包</p>
        <button onClick={() => load()} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!loading && rows.length === 0 && !error && (
        <p className="text-slate-500 text-sm text-center py-8 border border-dashed border-slate-700 rounded-lg">No packages downloaded yet. 尚未下載安裝包。</p>
      )}
      <ul className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
        {rows.map((r) => {
          const s = STATUS[r.status];
          const expired = r.status === 'pending' && new Date(r.expires_at).getTime() < Date.now();
          return (
            <li key={r.id} className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${expired ? STATUS.uninstalled.tone : s.tone}`}>{expired ? 'Expired · 已過期' : s.label}</span>
                    <span className="text-xs text-slate-400 tabular-nums">{r.account_names.length} terminals</span>
                    <span className="text-xs text-slate-500">{when(r.created_at)}</span>
                  </div>
                  {r.machine_name && (
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1 text-slate-300">
                        <Monitor className="w-3.5 h-3.5" />
                        {r.machine_name}
                      </span>
                      {r.hardware?.cores != null && (
                        <span className="inline-flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5" />
                          {r.hardware.cores} threads · {r.hardware.ram_gb} GB
                        </span>
                      )}
                      {r.hardware?.free_disk_gb != null && (
                        <span className="inline-flex items-center gap-1">
                          <HardDrive className="w-3.5 h-3.5" />
                          {r.hardware.free_disk_gb} GB free
                        </span>
                      )}
                      {r.capacity != null && <span className="text-cyan-300">Max {r.capacity} MT · 最高容量</span>}
                    </p>
                  )}
                  {r.message && <p className="text-xs text-slate-400 break-words">{r.message}</p>}
                  {r.synced_at && (
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className={`inline-flex items-center gap-1 ${Date.now() - new Date(r.synced_at).getTime() < 15 * 60_000 ? 'text-emerald-300' : 'text-amber-300'}`}>
                        <RefreshCcw className="w-3.5 h-3.5" />
                        Auto-sync {when(r.synced_at)} · 最後同步
                      </span>
                      {r.ea_code && <span className="font-mono text-slate-300">EA {r.ea_code}</span>}
                      {r.follow_group && <span className="text-cyan-300">Follows group · 自動跟隨群組</span>}
                    </p>
                  )}
                  {r.sync_message && <p className="text-xs text-slate-500 break-words">{r.sync_message}</p>}
                </div>
                <div className="flex items-start gap-1.5 shrink-0">
                  <RemoteUninstallButton row={r} onChanged={reloadSilently} />
                  <button
                    onClick={() => remove(r)}
                    disabled={busy === r.id}
                    aria-label="Remove record"
                    title="Remove record only · 只刪除紀錄"
                    className="p-1.5 rounded-md text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <RemoteUninstallStatus row={r} onChanged={reloadSilently} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
