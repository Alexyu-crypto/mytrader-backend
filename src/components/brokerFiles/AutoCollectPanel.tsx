import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleSlash, Copy, Download, Loader2, Monitor, Radar, RefreshCw, Usb } from 'lucide-react';
import { loadHarvest, type HarvestEntry } from '@/lib/brokerFiles';
import { buildCollectorFile, downloadBlob } from '@/lib/terminalInstaller';

const STATUS = {
  added: { text: 'Added 已加入', cls: 'bg-emerald-500/10 text-emerald-300', icon: CheckCircle2 },
  replaced: { text: 'Updated 已更新', cls: 'bg-sky-500/10 text-sky-300', icon: RefreshCw },
  exists: { text: 'Already had 已有', cls: 'bg-slate-700/40 text-slate-300', icon: Copy },
  skipped: { text: 'Could not name 無法辨認', cls: 'bg-amber-500/10 text-amber-300', icon: CircleSlash },
} as const;

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AutoCollectPanel({ onLibraryChanged }: { onLibraryChanged: () => void }) {
  const [log, setLog] = useState<HarvestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState('');
  const [onlyAdded, setOnlyAdded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadHarvest();
      setLog(rows);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setMaking(true);
    setError('');
    setMade('');
    try {
      const { blob, expiresAt } = await buildCollectorFile();
      downloadBlob(blob, 'Collect-Server-Files.cmd');
      setMade(expiresAt ? new Date(expiresAt).toLocaleDateString() : '');
    } catch (err) {
      setError((err as Error).message);
    }
    setMaking(false);
  };

  const counts = useMemo(() => ({
    added: log.filter((r) => r.status === 'added' || r.status === 'replaced').length,
    pcs: new Set(log.map((r) => r.machine_name).filter(Boolean)).size,
    skipped: log.filter((r) => r.status === 'skipped').length,
  }), [log]);
  const rows = onlyAdded ? log.filter((r) => r.status === 'added' || r.status === 'replaced') : log;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Monitor className="h-4 w-4 text-sky-300" /> Company PCs collect by themselves 公司電腦自動收集
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Every PC installed from a staff package scans its other MT4 / MT5 every 6 hours and sends new server files here. A newer version replaces the old one automatically.
            <span className="block text-slate-500">所有由員工安裝包安裝的電腦，每 6 小時掃描電腦上其他 MT4 / MT5，自動把新伺服器檔送到這裡；收到較新版本會即時取代舊檔。</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Usb className="h-4 w-4 text-rose-300" /> Any other PC 其他電腦
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Download the collector, double-click it on a PC that has broker MT4 / MT5 installed. Works for 30 days.
            <span className="block text-slate-500">下載收集器，在裝有券商 MT4 / MT5 的電腦雙擊執行即可，有效 30 天。</span>
          </p>
          <button
            onClick={download}
            disabled={making}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-rose-400 disabled:opacity-50"
          >
            {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download collector 下載收集器
          </button>
          {made && <p className="mt-2 text-xs text-emerald-300">Downloaded. Valid until {made}. 已下載，有效至 {made}。</p>}
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Radar className="h-4 w-4 text-emerald-300" /> Collection log 收集紀錄
            <span className="font-normal text-slate-500">· {counts.added} added / updated 已加入 / 更新 · {counts.pcs} PCs 電腦{counts.skipped > 0 && ` · ${counts.skipped} unnamed 無法辨認`}</span>
          </p>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={onlyAdded} onChange={(e) => setOnlyAdded(e.target.checked)} className="accent-rose-400" /> Only added 只看新加入
            </label>
            <button onClick={() => { load(); onLibraryChanged(); }} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Refresh log">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && log.length === 0 ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Nothing collected yet. Files appear here after PCs update or someone runs the collector.
            <span className="block">暫未有收集紀錄，電腦更新後或有人執行收集器便會出現。</span>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Time 時間</th>
                  <th className="px-4 py-2 font-medium">PC 電腦</th>
                  <th className="px-4 py-2 font-medium">IP 來源</th>
                  <th className="px-4 py-2 font-medium">File 檔案</th>
                  <th className="px-4 py-2 font-medium">Broker / server 券商 / 伺服器</th>
                  <th className="px-4 py-2 font-medium">Result 結果</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {rows.map((r) => {
                  const s = STATUS[r.status] ?? STATUS.skipped;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-slate-800/30">
                      <td className="whitespace-nowrap px-4 py-2 text-slate-400">{when(r.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-300">
                        {r.machine_name || '-'}
                        <span className="ml-1.5 text-[11px] text-slate-500">{r.source === 'pc' ? 'auto 自動' : 'collector 收集器'}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-400">{r.sender_ip || '-'}</td>
                      <td className="px-4 py-2">
                        <span className="mr-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">{r.platform}</span>
                        <span className="font-mono text-xs text-slate-200">{r.file_name}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-300">
                        {r.broker || '-'}
                        {r.server && <span className="block font-mono text-xs text-slate-500">{r.server}</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${s.cls}`}>
                          <s.icon className="h-3 w-3" /> {s.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
