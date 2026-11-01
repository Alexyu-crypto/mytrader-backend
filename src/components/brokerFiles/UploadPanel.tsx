import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileUp, FolderUp, Loader2, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { classifyFiles, duplicateIds, isSharedMt4, itemProblem, targetPath, uploadItem, type LibraryFile, type QueueItem } from '@/lib/brokerFiles';
import { useConfirm } from '@/hooks/useConfirm';

const KIND_LABEL = { server: 'Server 伺服器', setup: 'Setup 安裝程式' };
const PARALLEL = 3;

export function UploadPanel({ brokers, library, onUploaded }: { brokers: string[]; library: LibraryFile[]; onUploaded: () => void }) {
  const ask = useConfirm();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const existing = useMemo(() => new Set(library.map((f) => `${f.kind}:${f.path}`)), [library]);

  const add = (files: File[]) => {
    const { items, skipped } = classifyFiles(files);
    setQueue((q) => [...q.filter((i) => i.status !== 'done'), ...items]);
    setNote(skipped ? `${skipped} other file(s) skipped. Only .srv, servers.ini, .dat and .exe are used. 已略過 ${skipped} 個無關檔案。` : '');
  };

  const update = (id: string, patch: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const dupes = useMemo(() => duplicateIds(queue), [queue]);
  const problemOf = (i: QueueItem) =>
    itemProblem(i) ?? (dupes.has(i.id) ? (i.platform === 'MT5' && i.kind === 'server' ? 'Same name as another file: add a tag e.g. Live / Demo · 同名，請加標籤' : 'Same name as another file · 與另一檔案同名') : null);
  const ready = queue.filter((i) => i.status === 'ready' || i.status === 'failed');
  const blocked = ready.filter((i) => problemOf(i));

  const uploadAll = async () => {
    const todo = ready.filter((i) => !problemOf(i));
    const replacing = todo.filter((i) => existing.has(`${i.kind}:${targetPath(i)}`)).length;
    if (replacing && !(await ask(`${replacing} file(s) will replace files already in the library. Continue? ${replacing} 個檔案會取代檔案庫內的舊檔，確定繼續？`, { tone: 'warning', title: 'Replace files · 取代檔案', confirmLabel: 'Replace · 取代' }))) return;
    setBusy(true);
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const item = todo[next++];
        update(item.id, { status: 'uploading', message: '' });
        try {
          await uploadItem(item);
          update(item.id, { status: 'done', message: '' });
        } catch (e) {
          update(item.id, { status: 'failed', message: (e as Error).message });
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setBusy(false);
    onUploaded();
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); add([...e.dataTransfer.files]); }}
        className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${dragging ? 'border-rose-400 bg-rose-500/10 scale-[1.01]' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'}`}
      >
        <UploadCloud className={`mx-auto h-10 w-10 transition-colors ${dragging ? 'text-rose-300' : 'text-slate-500'}`} />
        <p className="mt-3 font-semibold text-white">Drop broker files here · 將券商檔案拖放到此</p>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-400">
          Mix freely: MT4 .srv, MT4 servers.ini, MT5 servers.dat and MT4/MT5 setup .exe. Each file is sorted automatically; just check the broker name before uploading.
          <span className="block text-slate-500">可同時放入 MT4 .srv、MT4 servers.ini、MT5 servers.dat 及安裝程式 .exe，系統會自動分類，上載前核對券商名稱即可。</span>
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-rose-400">
            <FileUp className="h-4 w-4" /> Choose files · 選擇檔案
          </button>
          <button onClick={() => folderInput.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-rose-400/50 hover:text-rose-200">
            <FolderUp className="h-4 w-4" /> Choose a folder · 選擇資料夾
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Tip: pick a broker's whole MT4 "config" folder to upload every .srv at once. A folder named after the broker (e.g. "ICMarkets MT5") fills in the broker name; otherwise type it. For a broker with separate Live / Demo servers.dat, add a tag. Newer MT4 has no .srv for a broker found by Scan: upload its config\servers.ini and type the exact server name it logs in to. 提示：新版 MT4 掃描到的券商不會產生 .srv，請上載 config 內的 servers.ini 並輸入完整伺服器名稱。以券商命名的資料夾會自動填入券商名稱，否則請自行輸入；同一券商有 Live / Demo 兩個 servers.dat 時請加標籤。</p>
        <input ref={fileInput} type="file" multiple accept=".srv,.ini,.dat,.exe" hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <input ref={folderInput} type="file" multiple hidden {...{ webkitdirectory: '' }} onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>

      {note && <p className="text-xs text-slate-400">{note}</p>}

      {queue.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <p className="text-sm text-slate-300">
              {queue.length} file(s) · <span className="text-emerald-300">{queue.filter((i) => i.status === 'done').length} done</span>
              {blocked.length > 0 && <span className="text-amber-300"> · {blocked.length} need attention 需處理</span>}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setQueue([])} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-40">Clear 清除</button>
              <button
                onClick={uploadAll}
                disabled={busy || ready.length === blocked.length}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3.5 py-1.5 text-sm font-medium text-black transition-colors hover:bg-rose-400 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Upload {ready.length - blocked.length} · 上載
              </button>
            </div>
          </div>
          <datalist id="broker-file-brokers">{brokers.map((b) => <option key={b} value={b} />)}</datalist>
          <ul className="max-h-[28rem] divide-y divide-slate-800 overflow-y-auto">
            {queue.map((item) => {
              const problem = item.status === 'done' ? null : problemOf(item);
              const taggable = item.kind === 'server' && item.platform === 'MT5';
              const shared = isSharedMt4(item);
              const locked = item.status === 'uploading' || item.status === 'done';
              const replaces = item.platform && !problem && existing.has(`${item.kind}:${targetPath(item)}`);
              return (
                <li key={item.id} className={`grid gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_auto] md:items-center ${dupes.has(item.id) && item.status !== 'done' ? 'bg-red-500/5' : ''}`}>
                  <div className="min-w-0">
                    <p className="truncate text-slate-200">{item.file.name}</p>
                    <p className="text-xs text-slate-500">
                      {shared ? 'Shared MT4 server file 共用伺服器檔' : KIND_LABEL[item.kind]} · {Math.max(1, Math.round(item.file.size / 1024))} KB
                      {!problem && item.platform && <span className="text-slate-400"> → {targetPath(item).split('/').pop()}</span>}
                      {replaces && <span className="text-amber-300"> · replaces existing 將取代舊檔</span>}
                    </p>
                  </div>
                  <select
                    value={item.platform}
                    disabled={locked || (item.kind === 'server')}
                    onChange={(e) => update(item.id, { platform: e.target.value as QueueItem['platform'], status: 'ready' })}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white focus:border-rose-400 focus:outline-none disabled:opacity-60"
                    aria-label="Platform"
                  >
                    <option value="">MT?</option>
                    <option value="MT4">MT4</option>
                    <option value="MT5">MT5</option>
                  </select>
                  <div className="flex gap-2">
                    <input
                      value={item.broker}
                      list="broker-file-brokers"
                      maxLength={40}
                      disabled={locked || (item.kind === 'server' && item.platform === 'MT4' && !shared)}
                      onChange={(e) => update(item.id, { broker: e.target.value, status: 'ready' })}
                      placeholder={shared ? 'Server name 伺服器名稱' : 'Broker name 券商名稱'}
                      aria-label={shared ? 'Server name' : 'Broker name'}
                      className={`min-w-0 flex-1 rounded-lg border bg-slate-950 px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none disabled:opacity-60 ${problem ? 'border-amber-500/60' : 'border-slate-700 focus:border-rose-400'}`}
                    />
                    {taggable && (
                      <input
                        value={item.tag}
                        maxLength={20}
                        disabled={locked}
                        onChange={(e) => update(item.id, { tag: e.target.value, status: 'ready' })}
                        placeholder="Tag 標籤"
                        title="Optional, e.g. Live, Demo, Live2. Use part of the server name so the installer can pick it. 可選，例如 Live / Demo"
                        aria-label="Tag"
                        className={`w-24 rounded-lg border bg-slate-950 px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none disabled:opacity-60 ${dupes.has(item.id) ? 'border-red-500/60' : 'border-slate-700 focus:border-rose-400'}`}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 md:w-44">
                    {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-rose-300" />}
                    {item.status === 'done' && <span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Uploaded</span>}
                    {item.status === 'failed' && <span className="flex items-center gap-1 text-xs text-red-300" title={item.message}><XCircle className="h-4 w-4" /> {item.message}</span>}
                    {item.status === 'ready' && problem && <span className="text-right text-xs text-amber-300">{problem}</span>}
                    {!locked && (
                      <button onClick={() => setQueue((q) => q.filter((i) => i.id !== item.id))} aria-label="Remove from list" className="rounded p-1 text-slate-500 transition-colors hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
