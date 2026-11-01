import { useState } from 'react';
import { ChevronDown, Copy, Check, Server, Cpu, MemoryStick, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Hand } from 'lucide-react';
import { RemoteUninstallButton, RemoteUninstallStatus } from '@/components/copy/RemoteUninstall';
import { VdsAccountRow } from '@/components/vds/VdsAccountRow';
import { VdsDesktopControls } from '@/components/vds/VdsDesktopControls';
import { timeAgo } from '@/lib/format';
import { sortAccounts, type AccountSort, type SortKey, type Vds } from '@/lib/vdsMonitor';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'login', label: 'Account No.' },
  { key: 'platform', label: 'Platform' },
  { key: 'status', label: 'Status' },
  { key: 'ea', label: 'EA Version' },
  { key: 'reason', label: '原因 · Reason' },
];

function SortHeader({ col, sort, onSort }: { col: (typeof COLUMNS)[number]; sort: AccountSort | null; onSort: (key: SortKey) => void }) {
  const active = sort?.key === col.key;
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-2 text-left font-medium" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(col.key)} className={`group inline-flex items-center gap-1 uppercase tracking-wide transition-colors ${active ? 'text-cyan-300' : 'hover:text-slate-200'}`}>
        {col.label}
        <Icon className={`w-3 h-3 transition-opacity ${active ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
      </button>
    </th>
  );
}

const STATUS_LABEL: Record<string, string> = {
  installed: '已安裝 · Installed',
  installing: '安裝中 · Installing',
  uninstalled: '已解除 · Uninstalled',
  failed: '失敗 · Failed',
};

export function VdsCard({ vds, canEdit, onChanged }: { vds: Vds; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sort, setSort] = useState<AccountSort | null>(null);
  const [collapseOverride, setCollapseOverride] = useState<Record<string, boolean>>({});

  const isCollapsed = (id: string, superseded: boolean) => collapseOverride[id] ?? superseded;
  const toggleGroup = (id: string, superseded: boolean) =>
    setCollapseOverride((prev) => ({ ...prev, [id]: !(prev[id] ?? superseded) }));

  const onSort = (key: SortKey) =>
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const offline = vds.total - vds.onlineCount;
  const pct = vds.total ? Math.round((vds.onlineCount / vds.total) * 100) : 0;
  const desktopTargets = vds.installs.filter((i) => !i.superseded && i.install.status !== 'uninstalled').map((i) => i.install);
  const barTone = offline === 0 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';

  const copyIp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!vds.ip) return;
    try {
      await navigator.clipboard.writeText(vds.ip);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`rounded-xl border bg-slate-900/60 transition-colors ${open ? 'border-cyan-500/40' : 'border-slate-800 hover:border-slate-700'}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left px-4 py-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto_auto] gap-3 md:gap-4 items-center">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`relative w-9 h-9 rounded-lg grid place-items-center shrink-0 ${vds.online ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
            <Server className="w-4 h-4" />
            <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${vds.online ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-slate-100 tabular-nums truncate">{vds.ip ?? 'IP 未知 · unknown'}</span>
              {vds.ip && (
                <span role="button" tabIndex={0} onClick={copyIp} title="Copy IP" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800">
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">
              {vds.machine ?? (vds.installs.length ? '—' : '手動安裝 · Manual')}
              {vds.ipAuto && ' · IP 取自帳戶登入紀錄'}
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="text-slate-400">AC Live · 帳戶在線</span>
            <span className="tabular-nums">
              <span className="text-slate-100 font-semibold">{vds.onlineCount}</span>
              <span className="text-slate-500"> / {vds.total}</span>
              {offline > 0 && <span className="text-red-300 ml-2">{offline} 離線</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${barTone}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {vds.eaCodes.length ? (
            vds.eaCodes.map((c) => (
              <span key={c} className="font-mono text-[11px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5">
                {c}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-600">EA —</span>
          )}
        </div>

        <div className="text-xs">
          <span className={vds.online ? 'text-emerald-300' : 'text-red-300'}>{vds.online ? 'VDS 在線' : 'VDS 離線'}</span>
          <span className="block text-slate-500">{vds.lastContact ? timeAgo(vds.lastContact) : '從未聯絡'}</span>
        </div>

        <div>{canEdit && desktopTargets.length > 0 && <VdsDesktopControls targets={desktopTargets} onChanged={onChanged} />}</div>

        <ChevronDown className={`w-4 h-4 text-slate-500 justify-self-end transition-transform duration-200 ${open ? 'rotate-180 text-cyan-300' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-800 px-4 pb-4 pt-3 space-y-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex flex-wrap gap-4 text-xs text-slate-400">
            {vds.hardware?.cores != null && (
              <span className="inline-flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" />{vds.hardware.cores} cores</span>
            )}
            {vds.hardware?.ram_gb != null && (
              <span className="inline-flex items-center gap-1.5"><MemoryStick className="w-3.5 h-3.5" />{vds.hardware.ram_gb} GB RAM</span>
            )}
            {vds.hardware?.os && <span>{vds.hardware.os}</span>}
          </div>

          {!vds.detailed && (
            <p className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              呢部 VDS 程式未更新，暫時未能回報 MT 運行狀態同登入失敗原因。網站發佈後，VDS 會喺幾分鐘內自動更新。
            </p>
          )}

          {vds.installs.map(({ install, accounts, superseded }) => {
            const folded = isCollapsed(install.id, superseded);
            return (
            <div key={install.id} className={`rounded-lg border border-slate-800 overflow-hidden ${superseded ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 bg-slate-800/40">
                <button
                  type="button"
                  onClick={() => toggleGroup(install.id, superseded)}
                  aria-expanded={!folded}
                  title={folded ? '展開 · Expand' : '收起 · Collapse'}
                  className="group flex items-center gap-2.5 min-w-0 flex-1 text-left"
                >
                  <span className="w-6 h-6 rounded-md grid place-items-center shrink-0 border border-slate-700 bg-slate-900/60 text-slate-400 group-hover:text-cyan-300 group-hover:border-cyan-500/40 transition-colors">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${folded ? '-rotate-90' : ''}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-slate-100 font-medium truncate group-hover:text-white">{install.group_name}</span>
                      {superseded && (
                        <span className="shrink-0 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                          舊紀錄 · 已被較新安裝取代，不計入總數
                        </span>
                      )}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {STATUS_LABEL[install.status] ?? install.status} · {accounts.length} 個帳戶
                      {install.synced_at && ` · 同步 ${timeAgo(install.synced_at)}`}
                    </span>
                  </span>
                </button>
                {canEdit && (
                  <div className="flex flex-col items-end gap-1">
                    <RemoteUninstallButton row={install} onChanged={onChanged} />
                    <RemoteUninstallStatus row={install} onChanged={onChanged} />
                  </div>
                )}
              </div>
              {install.status !== 'uninstalled' && !folded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                        {COLUMNS.map((col) => (
                          <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} />
                        ))}
                        <th className="px-3 py-2 text-right font-medium">加速</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortAccounts(accounts, sort).map((row) => (
                        <VdsAccountRow key={row.name} row={row} canEdit={canEdit} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            );
          })}

          {vds.manual.map((group) => {
            const id = `manual:${group.name}`;
            const folded = isCollapsed(id, false);
            return (
              <div key={id} className="rounded-lg border border-dashed border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(id, false)}
                  aria-expanded={!folded}
                  className="group w-full flex items-center gap-2.5 px-3 py-2.5 bg-slate-800/30 text-left"
                >
                  <span className="w-6 h-6 rounded-md grid place-items-center shrink-0 border border-slate-700 bg-slate-900/60 text-slate-400 group-hover:text-cyan-300 group-hover:border-cyan-500/40 transition-colors">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${folded ? '-rotate-90' : ''}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-slate-100 font-medium truncate group-hover:text-white">{group.name}</span>
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded px-1.5 py-0.5">
                        <Hand className="w-3 h-3" />手動安裝 · 只可睇連線狀態
                      </span>
                    </span>
                    <span className="block text-[11px] text-slate-500">唔係用安裝包裝 · {group.accounts.length} 個帳戶 · 無遠端解除</span>
                  </span>
                </button>
                {!folded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                          {COLUMNS.map((col) => (
                            <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} />
                          ))}
                          <th className="px-3 py-2 text-right font-medium">加速</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortAccounts(group.accounts, sort).map((row) => (
                          <VdsAccountRow key={row.name} row={row} canEdit={false} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
