import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Account } from '@/lib/types';
import type { RelayMember } from '@/lib/relay';

export function RelaySlotDialog({
  member,
  accounts,
  taken,
  liveLinked,
  onClose,
  onSaved,
}: {
  member: RelayMember;
  accounts: Account[];
  taken: Set<string>;
  liveLinked: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const options = accounts.filter((a) => !taken.has(a.account_name)).sort((a, b) => a.account_name.localeCompare(b.account_name));
  const [account, setAccount] = useState('');
  const [broker, setBroker] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isLive = liveLinked.has(account);

  const pick = (name: string) => {
    setAccount(name);
    setBroker(accounts.find((a) => a.account_name === name)?.broker ?? '');
  };

  const save = async () => {
    if (!account || isLive) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from('relay_group_members')
      .update({ account_name: account, broker: broker.trim(), updated_at: new Date().toISOString() })
      .eq('id', member.id);
    setSaving(false);
    if (err) return setError('Could not add this account. 未能加入此戶口。');
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              Slot #{member.slot} · {member.role === 'master' ? 'Master' : 'Follower'}
            </h2>
            <p className="text-sm text-slate-400">Pick a demo account · 揀一個 Demo 測試戶口</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-400">Account 戶口</label>
            <select
              value={account}
              onChange={(e) => pick(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="">Select... 請選擇</option>
              {options.map((a) => (
                <option key={a.id} value={a.account_name}>
                  {a.account_name} · {a.broker || '-'} · {a.platform}
                  {liveLinked.has(a.account_name) ? ' (live copy 正式跟單)' : ''}
                </option>
              ))}
            </select>
            {options.length === 0 && <p className="mt-1 text-xs text-slate-500">No free accounts. Add demo accounts on the Accounts page first. 請先喺戶口頁加入 Demo 戶口。</p>}
          </div>

          {isLive && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This account is in a live copy group. Use a separate demo account. 此戶口已用於正式跟單，請用另一個 Demo 戶口。</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-400">Broker label 券商</label>
            <input
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder="e.g. IC Markets"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={save}
              disabled={!account || isLive || saving}
              className="flex-1 rounded-lg bg-amber-500 py-2.5 font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Add to slot 加入'}
            </button>
            <button onClick={onClose} className="rounded-lg bg-slate-700 px-4 py-2.5 font-medium text-white transition-colors hover:bg-slate-600">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
