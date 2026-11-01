import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, HardDriveDownload, Loader2, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { coverageOf, loadLibrary, loadNeeds, loadPlanned, mergeNeeds, norm, type LibraryFile, type Need, type PlannedBroker } from '@/lib/brokerFiles';
import { IconButton } from '@/components/IconButton';
import { UploadPanel } from '@/components/brokerFiles/UploadPanel';
import { LibraryList } from '@/components/brokerFiles/LibraryList';
import { NeedsList } from '@/components/brokerFiles/NeedsList';
import { InstallerDefaults } from '@/components/brokerFiles/InstallerDefaults';
import { AutoCollectPanel } from '@/components/brokerFiles/AutoCollectPanel';

type Tab = 'upload' | 'collect' | 'library' | 'needs' | 'defaults';

export function BrokerFilesPage() {
  const [tab, setTab] = useState<Tab>('upload');
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [planned, setPlanned] = useState<PlannedBroker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [lib, nd, pl] = await Promise.allSettled([loadLibrary(), loadNeeds(), loadPlanned()]);
    if (lib.status === 'fulfilled') setLibrary(lib.value);
    if (nd.status === 'fulfilled') setNeeds(nd.value);
    if (pl.status === 'fulfilled') setPlanned(pl.value);
    const failed = [lib, nd, pl].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    setError(failed ? (failed.reason as Error).message : '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const allNeeds = useMemo(() => mergeNeeds(needs, planned), [needs, planned]);
  const coverage = useMemo(() => coverageOf(allNeeds, library), [allNeeds, library]);
  const missing = coverage.filter((c) => !c.serverFile).length;
  const usedFiles = useMemo(() => new Set(coverage.flatMap((c) => [
    ...(c.serverFile ? [`server:${c.platform}:${c.serverFile}`] : []),
    ...(c.setupFile ? [`setup:${c.platform}:${c.setupFile}`] : []),
  ])), [coverage]);
  const brokers = useMemo(() => [...new Set(allNeeds.map((n) => n.broker.trim()).filter(Boolean))].sort(), [allNeeds]);
  const brokerCount = useMemo(() => new Set(library.filter((f) => !f.isDefault).map((f) => norm(f.broker))).size, [library]);
  const covered = coverage.length ? Math.round(((coverage.length - missing) / coverage.length) * 100) : 100;

  const stats = [
    { label: 'Brokers 券商', value: brokerCount, icon: Building2, tone: 'text-rose-300 bg-rose-500/10' },
    { label: 'Server files 伺服器檔', value: library.filter((f) => f.kind === 'server').length, icon: Server, tone: 'text-sky-300 bg-sky-500/10' },
    { label: 'Setup programs 安裝程式', value: library.filter((f) => f.kind === 'setup' && !f.isDefault).length, icon: HardDriveDownload, tone: 'text-amber-300 bg-amber-500/10' },
    { label: 'Servers covered 伺服器覆蓋率', value: `${covered}%`, icon: ShieldCheck, tone: covered === 100 ? 'text-emerald-300 bg-emerald-500/10' : 'text-orange-300 bg-orange-500/10' },
  ];

  const tabs: [Tab, string, number?][] = [
    ['upload', 'Upload 上載'],
    ['collect', 'Auto collect 自動收集'],
    ['library', 'Library 檔案庫'],
    ['needs', 'Needed 待收集', missing],
    ['defaults', 'Installer defaults 預設安裝'],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Broker Files 券商檔案庫</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Collect MT4 / MT5 server files and setup programs from brokers worldwide. PC install packages pick the right files for each account automatically.
            <span className="block text-slate-500">收集全球券商的 MT4 / MT5 伺服器檔及安裝程式，電腦安裝包會按每個戶口自動配對。</span>
          </p>
        </div>
        <IconButton label="Refresh · 重新整理" tone="slate" size="md" onClick={load}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </IconButton>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-800">
        {tabs.map(([key, text, badge]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${tab === key ? 'border-rose-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {text}
            {!!badge && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-black">{badge}</span>}
          </button>
        ))}
      </div>

      {loading && library.length === 0 && needs.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : (
        <div key={tab} className="animate-fade-in">
          {tab === 'upload' && <UploadPanel brokers={brokers} library={library} onUploaded={load} />}
          {tab === 'collect' && <AutoCollectPanel onLibraryChanged={load} />}
          {tab === 'library' && <LibraryList library={library} usedFiles={usedFiles} onChanged={load} onError={setError} />}
          {tab === 'needs' && <NeedsList coverage={coverage} brokers={brokers} onChanged={load} onError={setError} />}
          {tab === 'defaults' && <InstallerDefaults library={library} />}
        </div>
      )}
    </div>
  );
}
