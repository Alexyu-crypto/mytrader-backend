import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Repeat, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Account, CopySettings } from '@/lib/types';

interface Props {
  oldMaster: string;
  groupName: string;
  accounts: Account[];
  settings: CopySettings[];
  groupNames: Map<string, string>;
  openTradesOf: (follower: string) => number;
  onClose: () => void;
  onDone: (newMaster: string) => void;
}

export function ChangeMasterDialog({ oldMaster, groupName, accounts, settings, groupNames, openTradesOf, onClose, onDone }: Props) {
  const [target, setTarget] = useState('');
  const [moveName, setMoveName] = useState(!!groupName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const oldPlatform = accounts.find((a) => a.account_name === oldMaster)?.platform;
  const members = settings.filter((s) => s.master_account === oldMaster);

  const candidates = useMemo(
    () =>
      accounts
        .filter((a) => a.type === 'master' && a.account_name !== oldMaster)
        .map((a) => ({ account: a, followers: settings.filter((s) => s.master_account === a.account_name).length }))
        .sort((a, b) => a.account.account_name.localeCompare(b.account.account_name)),
    [accounts, settings, oldMaster],
  );

  const already = new Set(settings.filter((s) => s.master_account === target).map((s) => s.follower_account));
  const moving = members.filter((s) => !already.has(s.follower_account));
  const skipped = members.length - moving.length;
  const openTrades = members.reduce((sum, s) => sum + openTradesOf(s.follower_account), 0);
  const targetAccount = candidates.find((c) => c.account.account_name === target)?.account;
  const targetName = groupNames.get(target) ?? '';
  const platformDiffers = !!targetAccount && !!oldPlatform && targetAccount.platform !== oldPlatform;

  const submit = async () => {
    if (!target || moving.length === 0) return;
    setSaving(true);
    setError('');
    const { error: moveErr } = await supabase
      .from('copy_settings')
      .update({ master_account: target })
      .eq('master_account', oldMaster)
      .in('id', moving.map((s) => s.id));
    if (moveErr) {
      setSaving(false);
      setError('Could not move the followers. Nothing was changed. 未能更換，請再試。');
      return;
    }
    if (moveName && groupName && !targetName) {
      const { error: nameErr } = await supabase
        .from('copy_groups')
        .upsert({ master_account: target, name: groupName, updated_at: new Date().toISOString() });
      if (!nameErr) await supabase.from('copy_groups').delete().eq('master_account', oldMaster);
    }
    setSaving(false);
    onDone(target);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-700">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 grid place-items-center shrink-0">
              <Repeat className="w-5 h-5 text-cyan-400" />
            </span>
            <div>
              <h2 className="text-white font-semibold">Change master · 更換主帳戶</h2>
              <p className="text-slate-400 text-sm mt-0.5">
                Move all {members.length} followers of {groupName || 'this group'} to a new master. Their copy settings stay the same.
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="min-w-0 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500">Current · 現在</p>
              <p className="text-sm text-slate-300 truncate">{oldMaster}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-cyan-400" />
            <div className={`min-w-0 border rounded-lg px-3 py-2 transition-colors ${target ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-slate-900/60 border-dashed border-slate-600'}`}>
              <p className="text-xs text-slate-500">New · 新主帳戶</p>
              <p className={`text-sm truncate ${target ? 'text-cyan-300 font-medium' : 'text-slate-500'}`}>{target || 'Not chosen'}</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-slate-400">Choose the new master account</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1.5 w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">Select master account...</option>
              {candidates.map(({ account, followers }) => (
                <option key={account.id} value={account.account_name}>
                  {account.account_name} ({account.platform}){groupNames.get(account.account_name) ? ` - ${groupNames.get(account.account_name)}` : ''}
                  {followers ? ` · ${followers} followers` : ''}
                </option>
              ))}
            </select>
          </label>

          {groupName && (
            <label className={`flex items-start gap-2 text-sm ${targetName ? 'text-slate-500' : 'text-slate-300'}`}>
              <input
                type="checkbox"
                checked={moveName && !targetName}
                disabled={!!targetName}
                onChange={(e) => setMoveName(e.target.checked)}
                className="mt-0.5 accent-cyan-500"
              />
              <span>
                Move the group name "{groupName}" to the new master
                {targetName && <span className="block text-xs">The new master already has the name "{targetName}", so it is kept.</span>}
              </span>
            </label>
          )}

          {target && (
            <div className="space-y-2">
              {skipped > 0 && (
                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  {skipped} follower{skipped === 1 ? ' is' : 's are'} already copying {target} and will stay on the current master.
                </p>
              )}
              {platformDiffers && (
                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  The new master is {targetAccount?.platform} and the current one is {oldPlatform}. Check that symbol names still match.
                </p>
              )}
            </div>
          )}

          {openTrades > 0 && (
            <div className="flex gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Followers still hold {openTrades} open trade{openTrades === 1 ? '' : 's'} copied from {oldMaster}. After the change, these trades may no longer close automatically with the old master. Best to change master when followers have no open trades. 跟單帳戶仍有持倉，建議平倉後先更換。
              </span>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!target || moving.length === 0 || saving}
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Repeat className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Moving...' : target ? `Move ${moving.length} followers` : 'Move followers'}
          </button>
        </div>
      </div>
    </div>
  );
}
