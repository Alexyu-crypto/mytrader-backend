import { useState } from 'react';
import { LayoutDashboard, LayoutGrid, Users, CandlestickChart, History as HistoryIcon, Activity, BookOpen, Menu, X, LogOut, ShieldCheck, Radio, Handshake, Store, Gem, Layers, Landmark, Briefcase, UserRoundPlus, Scale, ArrowLeftRight, MonitorDown, MonitorUp, FolderArchive, Server, Cloud } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { LanguageMenu } from '@/components/LanguageMenu';
import { BrandMark } from '@/components/agents/BrandMark';
import { ROLE_LABEL, type Role } from '@/hooks/useAuth';
import type { MyBrand } from '@/lib/agents';

export type PageKey = 'dashboard' | 'signals' | 'accounts' | 'positions' | 'history' | 'funding' | 'funding-history' | 'copy-groups' | 'health' | 'manual' | 'users' | 'agent' | 'partner' | 'membership' | 'ib' | 'opening' | 'rebates' | 'pc-setup' | 'broker-files' | 'desk' | 'trader-manager' | 'vds' | 'metaapi';

export const PAGE_KEYS: PageKey[] = ['dashboard', 'signals', 'accounts', 'positions', 'history', 'funding', 'funding-history', 'ib', 'opening', 'rebates', 'copy-groups', 'vds', 'metaapi', 'health', 'manual', 'users', 'agent', 'partner', 'membership', 'pc-setup', 'broker-files', 'desk', 'trader-manager'];

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'signals', label: 'Signals · 交易信號', icon: Radio },
  { key: 'accounts', label: 'Accounts', icon: Users },
  { key: 'positions', label: 'Live Positions', icon: CandlestickChart },
  { key: 'desk', label: 'Trading Desk · 交易台', icon: MonitorUp },
  { key: 'trader-manager', label: 'Trader Manager · 交易經理', icon: LayoutGrid },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'copy-groups', label: 'Copy Groups · 跟單組別', icon: Layers },
  { key: 'vds', label: 'VDS Monitor · VDS 監察', icon: Server },
  { key: 'metaapi', label: 'MetaApi Monitor · Meta API 監察', icon: Cloud },
  { key: 'funding', label: 'Funding · 出入金核對', icon: Landmark },
  { key: 'funding-history', label: 'Deposits & Withdrawals · 出入金記錄', icon: ArrowLeftRight },
  { key: 'ib', label: 'IB Partners · IB 代理管理', icon: Briefcase },
  { key: 'opening', label: 'Account Opening · 開戶部', icon: UserRoundPlus },
  { key: 'rebates', label: 'Rebates · 回傭核對', icon: Scale },
  { key: 'broker-files', label: 'Broker Files · 券商檔案庫', icon: FolderArchive },
  { key: 'health', label: 'EA Health', icon: Activity },
  { key: 'manual', label: 'User Manual', icon: BookOpen },
  { key: 'pc-setup', label: 'PC Setup · 電腦安裝', icon: MonitorDown },
  { key: 'membership', label: 'Membership · 會員收費', icon: Gem },
  { key: 'users', label: 'Admin · 用戶管理', icon: ShieldCheck },
  { key: 'agent', label: 'Agent Portal · 代理商後台', icon: Store },
  { key: 'partner', label: 'Become an Agent · 成為代理商', icon: Handshake },
];

export function visiblePages(role: Role): PageKey[] {
  if (role === 'client') return ['signals', 'positions', 'history', 'pc-setup', 'manual', 'membership', 'partner'];
  if (role === 'agent') return ['agent', 'signals', 'positions', 'history', 'pc-setup', 'manual', 'membership'];
  if (role === 'finance') return ['funding', 'funding-history', 'rebates'];
  if (role === 'ib_manager') return ['ib', 'opening', 'rebates'];
  if (role === 'account_opening') return ['opening'];
  if (role === 'broker_files') return ['broker-files'];
  const adminOnly: PageKey[] = ['users', 'ib', 'opening', 'rebates'];
  return NAV_ITEMS.map((item) => item.key).filter((key) => key !== 'agent' && key !== 'partner' && key !== 'membership' && key !== 'pc-setup' && (!adminOnly.includes(key) || role === 'admin'));
}

export function Layout({
  current,
  onNavigate,
  email,
  role,
  onSignOut,
  badges = {},
  brand,
  children,
}: {
  brand?: MyBrand | null;
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  email: string;
  role: Role;
  onSignOut: () => void;
  badges?: Partial<Record<PageKey, number>>;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (page: PageKey) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 flex flex-col bg-slate-950 border-r border-slate-800 z-40 transition-transform ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex min-h-0 flex-1 flex-col p-6 pb-3">
          {brand ? (
            <div className="flex flex-nowrap items-center gap-2.5 mb-8">
              <BrandMark brand={brand} className="w-10 h-10" />
              <div className="min-w-0" translate="no">
                <h1 className="truncate font-bold text-white text-lg leading-tight" title={brand.brand_name}>{brand.brand_name}</h1>
                <p className="truncate text-xs" style={{ color: brand.brand_color }}>{brand.tagline || 'Powered by MyTrader Tools'}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-nowrap items-center gap-2.5 mb-8">
              <Logo className="w-9 h-9" />
              <div translate="no">
                <h1 className="font-bold text-white text-lg leading-tight">MyTrader Tools</h1>
                <p className="text-slate-500 text-xs">MT4/MT5 Bridge</p>
              </div>
            </div>
          )}

          <nav className="-mx-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 scrollbar-thin">
            {NAV_ITEMS.filter((item) => visiblePages(role).includes(item.key)).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => handleNav(item.key)}
                  className={`w-full flex flex-nowrap items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium leading-snug transition-colors ${
                    current === item.key
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="min-w-0 flex-1 text-start break-words">{item.label}</span>
                  {!!badges[item.key] && (
                    <span
                      className={`shrink-0 min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none tabular-nums ${
                        item.key === 'health' ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-400 text-black'
                      }`}
                      title={item.key === 'health' ? 'Missed copies 甩單' : 'Waiting for follow-up 待跟進'}
                    >
                      {badges[item.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="shrink-0 p-4 border-t border-slate-800">
          <div className="flex flex-nowrap items-center gap-3 rounded-lg px-2 py-2">
            <div className="w-8 h-8 shrink-0 rounded-full bg-cyan-500/15 text-cyan-300 flex items-center justify-center text-sm font-semibold uppercase">
              {email.charAt(0) || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-slate-300 text-xs truncate" title={email}>{email}</p>
              <p className="text-slate-600 text-[11px] truncate">{ROLE_LABEL[role]}</p>
            </div>
            <button
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden text-slate-400 hover:text-white"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-4 ms-auto">
              <div className="hidden sm:flex flex-nowrap items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="whitespace-nowrap text-slate-400 text-sm">Realtime Active</span>
              </div>
              <LanguageMenu />
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
