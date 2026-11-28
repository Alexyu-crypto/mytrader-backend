import { useState } from 'react';
import { ArrowRight, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ContractSize, RelayMember } from '@/lib/relay';
import { IconButton } from '@/components/IconButton';

const inputCls = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none';
const ratio = (s: Pick<ContractSize, 'master_contract_size' | 'follower_contract_size'>) => s.master_contract_size / s.follower_contract_size;

export function RelayContractSizesDialog({
  member,
  masterAccount,
  sizes,
  onClose,
  onChanged,
}: {
  member: RelayMember;
  masterAccount: string;
  sizes: ContractSize[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [symbol, setSymbol] = useState('');
  const [masterSize, setMasterSize] = useState('100');
  const [followerSize, setFollowerSize] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const m = parseFloat(masterSize);
  const f = parseFloat(followerSize);
  const valid = symbol.trim() !== '' && m > 0 && f > 0;

  const add = async () => {
    if (!valid) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase
      .from('relay_contract_sizes')
      .upsert({ member_id: member.id, master_symbol: symbol.trim().toUpperCase(), master_contract_size: m, follower_contract_size: f }, { onConflict: 'member_id,master_symbol' });
    setBusy(false);
    if (err) return setError('Could not save. 未能儲存。');
    setSymbol('');
    onChanged();
  };

  const remove = async (id: string) => {
    setError('');
    const { error: err } = await supabase.from('relay_contract_sizes').delete().eq('id', id);
    if (err) return setError('Could not delete. 未能刪除。');
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Contract sizes 合約大細</h2>
            <p className="text-sm text-slate-400">
              <span className="text-cyan-400">{masterAccount}</span> → <span className="text-amber-400">{member.account_name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-xs leading-relaxed text-slate-400">
          Example 例子: XAUUSD master 1 lot = 100 oz, follower 1 lot = 10 oz → follower lot ×10. Saved for the future Relay only. 只係留位，將來 Relay 先會用。
        </p>

        <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Master symbol</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="XAUUSD" className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Master 1 lot =</label>
            <input type="number" min="0" step="any" value={masterSize} onChange={(e) => setMasterSize(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Follower 1 lot =</label>
            <input type="number" min="0" step="any" value={followerSize} onChange={(e) => setFollowerSize(e.target.value)} className={inputCls} />
          </div>
          <IconButton label="Add 新增" size="md" onClick={add} disabled={!valid || busy}>
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
        {valid && <p className="mt-1.5 text-xs text-slate-500">Follower lot ×{+(m / f).toFixed(4)}</p>}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        <ul className="mt-4 divide-y divide-slate-800 rounded-lg border border-slate-800">
          {sizes.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">No contract sizes yet · 暫時未設定</li>}
          {sizes.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-24 truncate font-mono text-white">{s.master_symbol}</span>
              <span className="text-cyan-300">{s.master_contract_size}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
              <span className="text-amber-300">{s.follower_contract_size}</span>
              <span className="flex-1 text-xs text-slate-500">lot ×{+ratio(s).toFixed(4)}</span>
              <IconButton label="Delete 刪除" tone="ghost" onClick={() => remove(s.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
