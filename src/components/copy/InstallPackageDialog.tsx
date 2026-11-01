import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Download, HardDrive, MemoryStick, MonitorDown, Tag, X } from 'lucide-react';
import type { Account } from '@/lib/types';
import { buildInstallerFile, createPackage, downloadBlob, estimateNeeds, groupSlug, loadLatestPackage, MAX_PACKAGE_ACCOUNTS, type BuildInfo, type InstallValidity } from '@/lib/terminalInstaller';
import { InstallHistory } from '@/components/copy/InstallHistory';
import { isReadOnlyLogin, ReadOnlyBadge } from '@/components/ReadOnlyBadge';

type Tab = 'package' | 'history';

const TABS: [Tab, string][] = [
  ['package', 'Package · 安裝包'],
  ['history', 'History · 紀錄'],
];

const VALIDITY: { value: InstallValidity; title: string; note: string }[] = [
  { value: 'now', title: 'Install on this PC now · 即刻喺呢部電腦安裝', note: 'File works for 1 hour' },
  { value: 'later', title: 'Save for another PC · 儲存到其他電腦安裝', note: 'File works for 7 days' },
];

interface Props {
  master?: string;
  groupName: string;
  members: Account[];
  onClose: () => void;
}

export function InstallPackageDialog({ master, groupName, members, onClose }: Props) {
  const personal = !master;
  const [customLabel, setCustomLabel] = useState(groupName);
  const [tab, setTab] = useState<Tab>('package');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(members.slice(0, MAX_PACKAGE_ACCOUNTS).map((a) => a.account_name)));
  const [validity, setValidity] = useState<InstallValidity>('now');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<{ file: string; expiresAt: string; noServerFile: string[] } | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [buildError, setBuildError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadLatestPackage()
      .then((p) => alive && setBuild(p.build))
      .catch(() => alive && setBuildError(true));
    return () => {
      alive = false;
    };
  }, []);

  const chosen = members.filter((a) => picked.has(a.account_name));
  const mt4 = chosen.filter((a) => a.platform === 'MT4').length;
  const mt5 = chosen.length - mt4;
  const needs = useMemo(() => estimateNeeds(mt4, mt5), [mt4, mt5]);
  const packageMaster = master ?? chosen[0]?.account_name ?? '';
  const label = (personal ? customLabel.trim() : groupName) || packageMaster || 'My accounts';
  const slug = personal ? `my_${groupSlug(packageMaster)}` : groupSlug(packageMaster);
  const tooMany = chosen.length > MAX_PACKAGE_ACCOUNTS;
  const readOnlyCount = chosen.filter(isReadOnlyLogin).length;

  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allPicked = members.length > 0 && members.every((a) => picked.has(a.account_name));

  const download = async () => {
    setBusy(true);
    setError('');
    setProblems([]);
    setDone(null);
    try {
      const latest = await loadLatestPackage();
      setBuild(latest.build);
      setBuildError(false);
      const pkg = await createPackage(packageMaster, chosen.map((a) => a.account_name), validity, latest.build.code, personal ? label : undefined);
      const blob = buildInstallerFile({ slug, label, token: pkg.token, ...latest });
      const file = `Install-${slug}.cmd`;
      downloadBlob(blob, file);
      setDone({ file, expiresAt: pkg.expiresAt, noServerFile: pkg.noServerFile });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
      setProblems((e as Error & { problems?: string[] }).problems ?? []);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-700">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 grid place-items-center shrink-0">
              <MonitorDown className="w-5 h-5 text-cyan-400" />
            </span>
            <div>
              <h2 className="text-white font-semibold">PC install package · 電腦安裝包</h2>
              <p className="text-slate-400 text-sm mt-0.5">
                One file sets up a separate MT terminal for every account in <span className="text-cyan-300">{label}</span>, logs in, attaches the EA and tiles the windows.
              </p>
              <p
                title="The installer window shows the same code at the top. If an old file shows a different code, download a new one. 安裝視窗頂部會顯示相同編號，不同即係舊檔。"
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded border border-slate-600 bg-slate-900/60 text-slate-300"
              >
                <Tag className="w-3 h-3 text-cyan-400" />
                {build ? `EA v${build.version} · build ${build.code}` : buildError ? 'EA version unavailable' : 'Loading EA version...'}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-slate-700 overflow-x-auto">
          {TABS.map(([key, text]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === key ? 'border-cyan-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'history' && <InstallHistory master={master ?? ''} refreshKey={historyKey} />}
          {tab === 'package' && (
            <div className="space-y-5">
              {personal && (
                <label className="block">
                  <span className="text-xs text-slate-400">Package name · 安裝包名稱 (shown on desktop shortcuts)</span>
                  <input
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value.slice(0, 60))}
                    placeholder="My accounts"
                    className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </label>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">
                    Accounts in this package · 戶口 <span className="text-white tabular-nums">{chosen.length}</span>/{members.length}
                  </span>
                  <button
                    onClick={() => setPicked(allPicked ? new Set() : new Set(members.map((a) => a.account_name)))}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    {allPicked ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <ul className="border border-slate-700 rounded-lg divide-y divide-slate-700/60 max-h-60 overflow-y-auto">
                  {members.map((a) => (
                    <li key={a.account_name}>
                      <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-700/30 transition-colors">
                        <input type="checkbox" checked={picked.has(a.account_name)} onChange={() => toggle(a.account_name)} className="accent-cyan-500" />
                        <span className="flex-1 min-w-0 flex items-center gap-2">
                          <span className="truncate text-slate-200">{a.account_name}</span>
                          <ReadOnlyBadge account={a} />
                        </span>
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded border ${a.type === 'master' ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-amber-300 border-amber-500/20 bg-amber-500/10'}`}
                        >
                          {a.type === 'master' ? 'Master' : 'Follower'}
                        </span>
                        <span className="text-xs text-slate-500 w-9 text-right">{a.platform}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {tooMany && <p className="text-xs text-red-400 mt-1.5">A package can hold at most {MAX_PACKAGE_ACCOUNTS} accounts.</p>}
                {readOnlyCount > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-300 mt-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {readOnlyCount} selected account(s) use the investor (read-only) password and cannot trade. Update the saved password to the main trading password first. 有 {readOnlyCount} 個已選戶口使用投資者唯讀密碼，無法交易，請先改用主交易密碼。
                  </p>
                )}
              </div>

              {chosen.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    [MemoryStick, 'RAM', `${needs.ramGb} GB+`],
                    [Cpu, 'CPU threads', `${needs.threads}+`],
                    [HardDrive, 'Free disk', `${needs.diskGb} GB+`],
                  ].map(([Icon, name, value]) => {
                    const I = Icon as typeof Cpu;
                    return (
                      <div key={name as string} className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 uppercase tracking-wide">
                          <I className="w-3.5 h-3.5" />
                          {name as string}
                        </p>
                        <p className="text-white font-semibold tabular-nums mt-0.5">{value as string}</p>
                      </div>
                    );
                  })}
                  <p className="col-span-3 text-xs text-slate-500">
                    Estimated need for MT4 × {mt4} + MT5 × {mt5}. The installer checks the real PC and stops, showing the max MT it can run, if it is too small. 安裝前會自動檢測電腦容量。
                  </p>
                </div>
              )}

              <fieldset className="space-y-2">
                <legend className="text-xs text-slate-400 mb-2">Where will you run it? · 喺邊度安裝？</legend>
                {VALIDITY.map((v) => (
                  <label
                    key={v.value}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${validity === v.value ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-700 hover:border-slate-600'}`}
                  >
                    <input type="radio" name="validity" checked={validity === v.value} onChange={() => setValidity(v.value)} className="mt-0.5 accent-cyan-500" />
                    <span>
                      <span className="block text-sm text-slate-200">{v.title}</span>
                      <span className="block text-xs text-slate-500">{v.note} · works on one PC only, no passwords inside the file</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {error && (
                <div className="flex gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p>{error}</p>
                    {problems.length > 0 && (
                      <ul className="mt-1 text-xs list-disc pl-4 space-y-0.5">
                        {problems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {done && (
                <div className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-3 space-y-2 animate-fade-in">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    {done.file} downloaded · 已下載
                  </p>
                  {build && (
                    <p className="text-xs text-slate-300">
                      The installer window must show <span className="font-mono text-white">build {build.code}</span> at the top. A different code means an old file. 安裝視窗頂部必須顯示相同編號，否則係舊檔。
                    </p>
                  )}
                  <ol className="list-decimal pl-5 text-xs text-slate-300 space-y-1 leading-relaxed">
                    {validity === 'later' && <li>Copy the file to the target PC (USB / cloud). 複製到目標電腦。</li>}
                    <li>Double-click it. If Windows says "protected your PC", click More info, then Run anyway. 按「其他資訊」→「仍要執行」。</li>
                    <li>Click Yes on the administrator prompt. 允許管理員權限。</li>
                    <li>First time only: follow the popup to allow the website URL in MT (one-time per PC). 首次需按指示設定一次。</li>
                    <li>Desktop shortcuts appear: Start all, Stop all, Arrange windows, Uninstall. 桌面會有啟動、關閉、排列、解除安裝捷徑。</li>
                    <li>The PC is set to never sleep, high performance and no automatic Windows restart; MT reopens by itself after a restart or crash. 電腦會設定為不休眠、最佳效能、不自動重開機，MT 當機或重開機後自動重開。</li>
                  </ol>
                  {done.noServerFile.length > 0 && (
                    <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 space-y-1">
                      <p className="flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        No server file yet for {done.noServerFile.length} account(s) · 以下戶口未有伺服器檔
                      </p>
                      <p className="text-slate-300 leading-relaxed">
                        If MT asks for the broker, search the server name below and log in once. MT remembers it, and the PC saves it to the Broker Files library so the next install picks it by itself.
                        如 MT 要求選擇券商，搜尋以下伺服器名並登入一次；MT 會記住，電腦亦會自動存入券商檔案庫，下次安裝自動選中。
                      </p>
                      <ul className="list-disc pl-4 text-slate-300 max-h-28 overflow-y-auto">
                        {done.noServerFile.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">Valid until {new Date(done.expiresAt).toLocaleString()}. Track progress in the History tab.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {tab === 'package' && (
          <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">
              Close
            </button>
            <button
              onClick={download}
              disabled={chosen.length === 0 || tooMany || busy}
              className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className={`w-4 h-4 ${busy ? 'animate-bounce' : ''}`} />
              {busy ? 'Preparing...' : done ? 'Download a new one' : `Download for ${chosen.length} terminals`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
