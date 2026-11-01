import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Info, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Account } from '@/lib/types';

export type RoleLinks = { asMaster: number; asFollower: number; openTrades: number } | null;

export function renamedForRole(name: string, type: 'master' | 'follower'): string {
  return /^[MF]-/.test(name) ? `${type === 'master' ? 'M' : 'F'}${name.slice(1)}` : name;
}

export function roleChangeError(message: string): string {
  if (message.includes('has_followers'))
    return 'This master still has followers. Move them to another master first (Copy Groups > Change master). 請先將跟單帳戶轉去其他主帳戶。';
  if (message.includes('has_masters')) return 'Tick the box below to remove its current copy links first. 請先勾選移除跟單連結。';
  if (message.includes('signals_busy')) return 'Copies are still being processed for this account. Wait a few seconds and try again. 仍有跟單處理中，請稍後再試。';
  if (message.includes('name_taken')) return 'An account with the new name already exists. 新名稱已存在。';
  if (message.includes('archived')) return 'This account is archived or frozen. Set it back to normal first. 帳戶已存檔，請先恢復。';
  if (message.includes('not_allowed')) return 'You do not have permission to change roles. 你沒有權限。';
  return 'Could not change the role. Please try again. 未能更改角色，請再試。';
}

export function useRoleLinks(account: Account | null): RoleLinks {
  const [links, setLinks] = useState<RoleLinks>(null);
  useEffect(() => {
    if (!account) return;
    let active = true;
    (async () => {
      const name = account.account_name;
      const [m, f, p] = await Promise.all([
        supabase.from('copy_settings').select('id', { count: 'exact', head: true }).eq('master_account', name),
        supabase.from('copy_settings').select('id', { count: 'exact', head: true }).eq('follower_account', name),
        supabase.from('live_positions').select('id', { count: 'exact', head: true }).eq('account_name', name),
      ]);
      if (!active) return;
      setLinks({ asMaster: m.count ?? 0, asFollower: f.count ?? 0, openTrades: p.count ?? 0 });
    })();
    return () => {
      active = false;
    };
  }, [account]);
  return links;
}

export function RoleChangePanel({
  account,
  newType,
  links,
  removeLinks,
  onRemoveLinksChange,
}: {
  account: Account;
  newType: 'master' | 'follower';
  links: RoleLinks;
  removeLinks: boolean;
  onRemoveLinksChange: (v: boolean) => void;
}) {
  const newName = renamedForRole(account.account_name, newType);
  const toFollower = newType === 'follower';

  return (
    <div className="bg-slate-900/70 border border-cyan-500/30 rounded-lg p-3 space-y-3 animate-fade-in">
      <p className="text-white text-sm font-medium">
        Change role to {toFollower ? 'Follower' : 'Master'} · 更改為{toFollower ? '跟單帳戶' : '主帳戶'}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 font-mono text-xs">
        <span className="truncate text-slate-400">{account.account_name}</span>
        <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
        <span className={`truncate font-bold ${toFollower ? 'text-amber-400' : 'text-cyan-400'}`}>{newName}</span>
      </div>

      {!links ? (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Checking copy links...
        </p>
      ) : (
        <>
          {toFollower && links.asMaster > 0 && (
            <p className="flex gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-2.5 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {links.asMaster} followers copy this master. Move them first with Copy Groups &gt; Change master, then come back. 請先到跟單組別一鍵更換主帳戶。
              </span>
            </p>
          )}
          {!toFollower && links.asFollower > 0 && (
            <label className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-2 cursor-pointer">
              <input type="checkbox" checked={removeLinks} onChange={(e) => onRemoveLinksChange(e.target.checked)} className="mt-0.5 accent-amber-500" />
              <span>
                It currently follows {links.asFollower} master{links.asFollower === 1 ? '' : 's'}. Remove these copy links so it stops copying. 移除現有跟單連結。
              </span>
            </label>
          )}
          {links.openTrades > 0 && (
            <p className="flex gap-2 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              It has {links.openTrades} open trade{links.openTrades === 1 ? '' : 's'}. They stay open and keep their history.
            </p>
          )}
        </>
      )}

      <p className="flex gap-2 text-xs text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-cyan-400" />
        <span>
          History, reports and funding records move to the new name automatically. After saving, change <span className="text-white">AccountLabel</span> in the EA to the new name (or download the EA again), otherwise it will go offline. 儲存後請把 EA 的 AccountLabel 改成新名稱。
        </span>
      </p>
    </div>
  );
}
