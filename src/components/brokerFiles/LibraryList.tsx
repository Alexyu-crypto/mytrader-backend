import { useMemo, useState } from 'react';
import { HardDriveDownload, Search, Server, Star, Trash2 } from 'lucide-react';
import { deleteLibraryFile, makeDefaultSetup, norm, type LibraryFile } from '@/lib/brokerFiles';
import { useConfirm } from '@/hooks/useConfirm';

type PlatformFilter = 'all' | 'MT4' | 'MT5';

const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString() : '');
const fmtSize = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, kb)} KB`);

export function LibraryList({ library, usedFiles, onChanged, onError }: { library: LibraryFile[]; usedFiles: Set<string>; onChanged: () => void; onError: (msg: string) => void }) {
  const ask = useConfirm();
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [busy, setBusy] = useState('');

  const isUnused = (f: LibraryFile) => !usedFiles.has(`${f.kind}:${f.platform}:${f.name}`);
  const unusedCount = library.filter((f) => !f.isDefault && isUnused(f)).length;

  const groups = useMemo(() => {
    const q = norm(query);
    const map = new Map<string, { broker: string; files: LibraryFile[] }>();
    for (const f of library) {
      if (f.isDefault) continue;
      if (platform !== 'all' && f.platform !== platform) continue;
      if (onlyUnused && usedFiles.has(`${f.kind}:${f.platform}:${f.name}`)) continue;
      if (q && !norm(f.broker).includes(q) && !norm(f.name).includes(q)) continue;
      const key = norm(f.broker) || f.name;
      const g = map.get(key) ?? { broker: f.broker, files: [] };
      g.files.push(f);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.broker.localeCompare(b.broker));
  }, [library, query, platform, onlyUnused, usedFiles]);

  const run = async (f: LibraryFile, action: 'delete' | 'default') => {
    if (action === 'delete' && !(await ask(`Delete ${f.name}? 確定刪除？`, { tone: 'danger', confirmLabel: 'Delete · 刪除' }))) return;
    if (action === 'default' && !(await ask(`Use ${f.name} as the ${f.platform} setup for PCs whose broker has no own setup? 設為 ${f.platform} 預設安裝程式？`, { tone: 'info', title: 'Default setup · 預設安裝程式', confirmLabel: 'Set default · 設為預設' }))) return;
    setBusy(f.path);
    try {
      if (action === 'delete') await deleteLibraryFile(f);
      else await makeDefaultSetup(f);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
    setBusy('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search broker or server · 搜尋券商或伺服器"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-rose-400 focus:outline-none"
          />
        </label>
        <div className="flex max-w-full flex-wrap rounded-lg border border-slate-700 bg-slate-900 p-0.5">
          {(['all', 'MT4', 'MT5'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${platform === p ? 'bg-rose-500 text-black' : 'text-slate-400 hover:text-white'}`}
            >
              {p === 'all' ? 'All 全部' : p}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlyUnused((v) => !v)}
          title="Files no account or planned broker uses · 沒有戶口或預計券商使用的檔案"
          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${onlyUnused ? 'border-slate-500 bg-slate-700 text-white' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}
        >
          Unused only 只看無人用 ({unusedCount})
        </button>
      </div>
      {onlyUnused && (
        <p className="text-xs text-slate-500">
          No account and no planned broker uses these files now. Keep them if you may need the broker later; otherwise delete.
          <span className="block">目前沒有戶口或預計券商用到這些檔案；日後可能用到可保留，否則可刪除。</span>
        </p>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-12 text-center">
          <Server className="mx-auto h-10 w-10 text-slate-600" />
          <p className="mt-3 font-semibold text-white">{library.length ? 'No match 沒有符合的檔案' : 'Library is empty 檔案庫未有檔案'}</p>
          <p className="mt-1 text-sm text-slate-400">Upload files in the Upload tab. 請於「上載」分頁加入檔案。</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.broker} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-700">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="truncate font-semibold text-white">{g.broker}</h3>
                <span className="text-xs text-slate-500">{g.files.length} file(s)</span>
              </div>
              <ul className="space-y-1">
                {g.files.map((f) => (
                  <li key={f.path} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-800/60">
                    {f.kind === 'setup' ? <HardDriveDownload className="h-4 w-4 shrink-0 text-rose-300" /> : <Server className="h-4 w-4 shrink-0 text-sky-300" />}
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${f.platform === 'MT4' ? 'bg-amber-400/10 text-amber-300' : 'bg-teal-400/10 text-teal-300'}`}>{f.platform}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-200">{f.kind === 'setup' ? 'Setup program 安裝程式' : f.name}</span>
                    {isUnused(f) && <span className="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[11px] text-slate-400">Unused 無人用</span>}
                    <span className="hidden text-xs text-slate-500 sm:inline">{fmtSize(f.sizeKb)} · {fmtDate(f.updatedAt)}</span>
                    {f.kind === 'setup' && (
                      <button onClick={() => run(f, 'default')} disabled={!!busy} title="Use as default setup · 設為預設" aria-label="Use as default setup" className="rounded p-1 text-slate-500 transition-colors hover:text-amber-300 disabled:opacity-40">
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => run(f, 'delete')} disabled={!!busy} aria-label={`Delete ${f.name}`} className="rounded p-1 text-slate-500 transition-colors hover:text-red-300 disabled:opacity-40">
                      <Trash2 className={`h-3.5 w-3.5 ${busy === f.path ? 'animate-pulse' : ''}`} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
