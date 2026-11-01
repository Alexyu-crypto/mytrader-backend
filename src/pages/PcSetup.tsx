import { useMemo, useState } from 'react';
import { BatteryCharging, Loader2, MonitorDown, Power, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useAccounts } from '@/hooks/useRealtime';
import { useLinkedAccounts } from '@/hooks/useLinkedAccounts';
import { InstallPackageDialog } from '@/components/copy/InstallPackageDialog';
import { InstallHistory } from '@/components/copy/InstallHistory';

const FEATURES = [
  { icon: MonitorDown, title: 'One file, all accounts', text: 'Creates one MT terminal per account, logs in, attaches the EA and tiles the windows. 一個檔案完成全部戶口。' },
  { icon: BatteryCharging, title: 'Never sleeps', text: 'High performance power plan, no sleep or hibernate. 最佳效能，不休眠。' },
  { icon: RefreshCcw, title: 'Reopens by itself', text: 'MT restarts after a crash, power cut or Windows restart. 當機或停電後自動重開 MT。' },
  { icon: ShieldCheck, title: 'No auto restarts', text: 'Windows Update will not restart the PC on its own. Windows 不會自動重開機。' },
];

export function PcSetupPage({ isAgent }: { isAgent: boolean }) {
  const { accounts, loading: accountsLoading } = useAccounts();
  const scope = useLinkedAccounts(true);
  const [open, setOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const mine = useMemo(() => {
    const names = new Set(scope.linked?.own ?? []);
    return accounts.filter((a) => names.has(a.account_name));
  }, [accounts, scope.linked]);
  const loading = accountsLoading || scope.loading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">PC Setup · 電腦安裝</h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Download one installer and run it on a Windows PC or VPS. It sets up every MT4 / MT5 account for 24/7 copy trading.
            下載安裝檔並在 Windows 電腦或 VPS 執行，自動設定全部戶口。
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={loading || mine.length === 0}
          className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MonitorDown className="w-4 h-4" />}
          Create install package · 建立安裝包
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 hover:border-cyan-500/30 transition-colors">
            <span className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 grid place-items-center">
              <Icon className="w-4 h-4 text-cyan-400" />
            </span>
            <p className="text-white text-sm font-medium mt-3">{title}</p>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      {scope.error && <p className="text-red-400 text-sm">{scope.error}</p>}
      {!loading && !scope.error && mine.length === 0 && (
        <p className="text-slate-400 text-sm text-center py-8 border border-dashed border-slate-700 rounded-xl">
          No MT accounts are linked to you yet. Ask your agent or admin to link them. 尚未連結任何戶口，請聯絡代理商或管理員。
        </p>
      )}
      {isAgent && mine.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-slate-400">
          <Power className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
          Packaging your clients' accounts needs the "PC install packages" permission from the admin. 為客戶戶口建立安裝包需由管理員開通權限。
        </p>
      )}

      <section className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-3">My packages · 我的安裝包</h2>
        <InstallHistory master="" refreshKey={historyKey} />
      </section>

      {open && (
        <InstallPackageDialog
          groupName="My accounts"
          members={mine}
          onClose={() => {
            setOpen(false);
            setHistoryKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
