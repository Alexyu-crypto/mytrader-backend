import { useState } from 'react';
import { Crown, Plus, Ruler, Settings2, UserMinus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Account } from '@/lib/types';
import { hasSymbolRules } from '@/lib/symbolMap';
import { memberAsCopySettings, type ContractSize, type RelayMember } from '@/lib/relay';
import { CopySettingModal, type CopySettingsPayload } from '@/components/copy/CopySettingModal';
import { IconButton } from '@/components/IconButton';
import { useConfirm } from '@/hooks/useConfirm';
import { RelaySlotDialog } from '@/components/relay/RelaySlotDialog';
import { RelayContractSizesDialog } from '@/components/relay/RelayContractSizesDialog';

const lotText = (m: RelayMember) => (m.mode === 'fixed' ? `Fixed ${m.fixed_lot}` : `×${m.lot_multiplier}`);

export function RelayMembers({
  canEdit,
  members,
  sizes,
  accounts,
  liveLinked,
  onChanged,
}: {
  canEdit: boolean;
  members: RelayMember[];
  sizes: ContractSize[];
  accounts: Account[];
  liveLinked: Set<string>;
  onChanged: () => void;
}) {
  const ask = useConfirm();
  const [assigning, setAssigning] = useState<RelayMember | null>(null);
  const [editing, setEditing] = useState<RelayMember | null>(null);
  const [sizing, setSizing] = useState<RelayMember | null>(null);
  const [error, setError] = useState('');
  const master = members.find((m) => m.role === 'master');
  const brokerOf = new Map(accounts.map((a) => [a.account_name, a.broker]));
  const brokers = new Set(members.filter((m) => m.account_name).map((m) => (m.broker || brokerOf.get(m.account_name!) || '').trim().toLowerCase()).filter(Boolean));

  const clearSlot = async (m: RelayMember) => {
    if (!(await ask(`Remove ${m.account_name} from slot ${m.slot}?`, { tone: 'danger', confirmLabel: 'Remove · 移除' }))) return;
    setError('');
    const { error: err } = await supabase.from('relay_group_members').update({ account_name: null, broker: '', updated_at: new Date().toISOString() }).eq('id', m.id);
    if (err) return setError('Could not clear this slot. 未能清空此位置。');
    onChanged();
  };

  const persist = (m: RelayMember) => async (payload: CopySettingsPayload) => {
    const fields = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'master_account' && k !== 'follower_account'));
    const { error: err } = await supabase.from('relay_group_members').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', m.id);
    return !err;
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Accounts 戶口 · 1 Master + 9 Followers</p>
        <p className="text-xs text-slate-500">Brokers 券商: <span className="font-semibold tabular-nums text-slate-300">{brokers.size}</span> · Multi-broker test 多券商測試</p>
      </div>
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-slate-700/80">
        {members.map((m) => {
          const broker = m.broker || (m.account_name ? brokerOf.get(m.account_name) : '') || '';
          const sizeCount = sizes.filter((s) => s.member_id === m.id).length;
          const isMaster = m.role === 'master';
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5 last:border-b-0">
              <span className="w-6 text-xs tabular-nums text-slate-500">#{m.slot}</span>
              <span className={`inline-flex w-20 items-center gap-1 text-xs font-semibold ${isMaster ? 'text-cyan-300' : 'text-amber-300'}`}>
                {isMaster && <Crown className="h-3.5 w-3.5" />}
                {isMaster ? 'Master' : 'Follower'}
              </span>
              {m.account_name ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p translate="no" className="notranslate truncate text-sm font-medium text-white">{m.account_name}</p>
                    <p className="truncate text-xs text-slate-500">{broker || 'Broker not set 未填券商'}</p>
                  </div>
                  {!isMaster && (
                    <p className="hidden text-xs text-slate-400 sm:block">
                      Lot {lotText(m)} · Max {m.max_lot}
                      {hasSymbolRules(m) && <span className="ms-1 text-cyan-300">· Symbols mapped</span>}
                      {sizeCount > 0 && <span className="ms-1 text-cyan-300">· {sizeCount} contract sizes</span>}
                    </p>
                  )}
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      {!isMaster && master?.account_name && (
                        <>
                          <IconButton label="Copy settings 手數 / 符號設定" onClick={() => setEditing(m)}>
                            <Settings2 className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Contract sizes 合約大細" onClick={() => setSizing(m)}>
                            <Ruler className="h-4 w-4" />
                          </IconButton>
                        </>
                      )}
                      <IconButton label="Remove from slot 移除" onClick={() => clearSlot(m)}>
                        <UserMinus className="h-4 w-4" />
                      </IconButton>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-1 items-center justify-between gap-2">
                  <p className="text-sm italic text-slate-500">Empty slot · 空位（之後加入 Demo 戶口）</p>
                  {canEdit && (
                    <button
                      onClick={() => setAssigning(m)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-600 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-amber-400 hover:text-amber-300"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add 加入
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Risk stop uses each account's existing setting · 風險止損沿用戶口現有設定</p>

      {assigning && (
        <RelaySlotDialog
          member={assigning}
          accounts={accounts}
          taken={new Set(members.map((m) => m.account_name).filter((n): n is string => !!n))}
          liveLinked={liveLinked}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            onChanged();
          }}
        />
      )}
      {editing && master?.account_name && editing.account_name && (
        <CopySettingModal
          master={master.account_name}
          follower={editing.account_name}
          existing={memberAsCopySettings(editing, master.account_name)}
          onPersist={persist(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {sizing && master?.account_name && (
        <RelayContractSizesDialog member={sizing} masterAccount={master.account_name} sizes={sizes.filter((s) => s.member_id === sizing.id)} onClose={() => setSizing(null)} onChanged={onChanged} />
      )}
    </div>
  );
}
