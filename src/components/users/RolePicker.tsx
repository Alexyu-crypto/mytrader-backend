import { Briefcase, FolderArchive, Handshake, Landmark, Radio, ShieldCheck, TrendingUp, UserPlus } from 'lucide-react';
import type { Role } from '@/hooks/useAuth';

export const ROLE_DESC: Record<Role, string> = {
  admin: 'Everything, including managing users. 可做所有事，包括管理用戶。',
  trader: 'Edit accounts and copy settings, close follower trades. 可改設定及平倉。',
  client: 'Signals, User Manual, plus live trades and history of their own linked accounts and joined signals. 可看信號頁、使用手冊，以及自己帳戶與已參加信號的即時交易及歷史。',
  agent: 'Partner with an own branded login link, logo and clients. Assign via the Agents tab. 代理商：擁有專屬品牌登入連結、LOGO 及旗下客戶，請於「代理商」分頁設定。',
  finance: 'Deposit, withdrawal and rebate staff. Sees the Funding, Deposits & Withdrawals and Rebates pages. 出入金同事：可使用出入金核對、出入金記錄及回傭核對頁。',
  ib_manager: 'Opens IB accounts with brokers. Sees IB Partners, Account Opening and Rebates. IB 管理員：負責向經紀商申請代理帳號，可使用 IB 代理管理、開戶部及回傭核對頁。',
  account_opening: 'Opens client accounts through our IB links. Only sees the Account Opening page, never portal passwords or rebate terms. 開戶部：用代理連結為客戶開戶，只可使用開戶部頁，看不到後台密碼及回傭條款。',
  broker_files: 'Collects and uploads MT4 / MT5 server files and setup programs. Only sees the Broker Files page, never accounts or passwords. 券商檔案部：收集及上載 MT4 / MT5 伺服器檔與安裝程式，只可使用券商檔案庫，看不到戶口及密碼。',
};

export const ROLE_OPTIONS: { value: Role; short: string; icon: typeof ShieldCheck; tone: string }[] = [
  { value: 'admin', short: 'Admin 全權', icon: ShieldCheck, tone: 'bg-cyan-500 text-black' },
  { value: 'trader', short: 'Trader 交易', icon: TrendingUp, tone: 'bg-emerald-500 text-black' },
  { value: 'client', short: 'Client 客戶', icon: Radio, tone: 'bg-amber-400 text-black' },
  { value: 'finance', short: 'Finance 出入金', icon: Landmark, tone: 'bg-sky-400 text-black' },
  { value: 'ib_manager', short: 'IB 管理', icon: Briefcase, tone: 'bg-orange-400 text-black' },
  { value: 'account_opening', short: '開戶部', icon: UserPlus, tone: 'bg-lime-400 text-black' },
  { value: 'broker_files', short: '券商檔案', icon: FolderArchive, tone: 'bg-rose-400 text-black' },
  { value: 'agent', short: 'Agent 代理', icon: Handshake, tone: 'bg-teal-400 text-black' },
];

export function RolePicker({
  value,
  onChange,
  disabled,
  lockedRoles = [],
}: {
  value: Role;
  onChange: (r: Role) => void;
  disabled?: boolean;
  lockedRoles?: Role[];
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-slate-700 bg-slate-950 p-0.5">
      {ROLE_OPTIONS.map(({ value: r, short, icon: Icon, tone }) => {
        const active = r === value;
        const locked = lockedRoles.includes(r);
        return (
          <button
            key={r}
            type="button"
            disabled={disabled || locked}
            onClick={() => !active && onChange(r)}
            title={locked ? (r === 'agent' ? 'Approve an agent application first · 請先於代理商分頁批核' : 'At least one full admin must remain · 最少要保留一位全權管理員') : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
              active ? tone : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            } disabled:cursor-not-allowed ${!active && (disabled || locked) ? 'opacity-40' : ''}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {short}
          </button>
        );
      })}
    </div>
  );
}
