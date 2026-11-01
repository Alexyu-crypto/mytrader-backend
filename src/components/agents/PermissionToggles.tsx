import type { AgentPermissions } from '@/lib/agents';

const ITEMS: { key: keyof AgentPermissions; label: string; desc: string }[] = [
  { key: 'clientSignup', label: 'Client sign-up 客戶註冊', desc: 'New clients can register through the agent link. 客戶可經連結註冊。' },
  { key: 'viewTrades', label: 'View client trades 查看客戶交易', desc: 'Agent sees live positions and history of their clients. 可看旗下客戶持倉及記錄。' },
  { key: 'viewActivity', label: 'View client activity 查看客戶記錄', desc: 'Agent sees the activity log of their clients. 可看旗下客戶操作記錄。' },
  { key: 'manageClients', label: 'Authorise own clients 自行授權客戶', desc: 'Agent approves their clients and handles their copy applications. 代理商自行批核旗下客戶及跟單申請。' },
  { key: 'installTerminals', label: 'PC install packages 電腦安裝包', desc: "Agent can download PC install packages for their clients' accounts. 可為旗下客戶戶口下載電腦安裝包。" },
];

export function PermissionToggles({ value, onChange, disabled, compact }: { value: AgentPermissions; onChange: (v: AgentPermissions) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div className={compact ? 'flex flex-wrap gap-2' : 'space-y-2'}>
      {ITEMS.map(({ key, label, desc }) => {
        const on = value[key];
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, [key]: !on })}
            title={desc}
            className={`flex items-center gap-3 rounded-lg border text-left transition-colors disabled:opacity-50 ${compact ? 'px-2.5 py-1.5' : 'w-full px-3 py-2.5'} ${
              on ? 'border-teal-400/40 bg-teal-400/10' : 'border-slate-700 bg-slate-950 hover:border-slate-600'
            }`}
          >
            <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? 'bg-teal-400' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
            </span>
            <span className="min-w-0">
              <span className={`block text-xs font-medium ${on ? 'text-white' : 'text-slate-400'}`}>{label}</span>
              {!compact && <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{desc}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
