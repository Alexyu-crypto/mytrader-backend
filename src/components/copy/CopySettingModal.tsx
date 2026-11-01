import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CopySettings } from '@/lib/types';
import { Plus, X } from 'lucide-react';
import { SymbolMappingEditor } from '@/components/copy/SymbolMappingEditor';
import type { SymbolRules } from '@/lib/symbolMap';
import { IconButton } from '@/components/IconButton';
import { useConfirm } from '@/hooks/useConfirm';

export function CopySettingModal({
  master,
  follower,
  existing,
  onClose,
  onSaved,
}: {
  master: string;
  follower: string;
  existing: CopySettings | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ask = useConfirm();
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [mode, setMode] = useState<'multiplier' | 'fixed' | 'ratio'>(existing?.mode || 'multiplier');
  const [lotMultiplier, setLotMultiplier] = useState(existing?.lot_multiplier ?? 1.0);
  const [fixedLot, setFixedLot] = useState(existing?.fixed_lot ?? 0.01);
  const [maxLot, setMaxLot] = useState(existing?.max_lot ?? 20);
  const [reverse, setReverse] = useState(existing?.reverse ?? false);
  const [minLot, setMinLot] = useState(existing?.min_lot ?? 0.01);
  const [copyPending, setCopyPending] = useState(existing?.copy_pending_orders ?? false);
  const [allowedSymbols, setAllowedSymbols] = useState(existing?.allowed_symbols ?? []);
  const [blockedSymbols, setBlockedSymbols] = useState(existing?.blocked_symbols ?? []);
  const [symbolRules, setSymbolRules] = useState<SymbolRules>({
    symbol_map: existing?.symbol_map ?? {},
    strip_suffix: existing?.strip_suffix ?? '',
    add_prefix: existing?.add_prefix ?? '',
    add_suffix: existing?.add_suffix ?? '',
  });
  const [copySl, setCopySl] = useState(existing?.copy_sl ?? false);
  const [copyTp, setCopyTp] = useState(existing?.copy_tp ?? false);
  const [maxOpenTrades, setMaxOpenTrades] = useState(existing?.max_open_trades ?? 0);
  const [symbolInput, setSymbolInput] = useState('');
  const [blockedInput, setBlockedInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addAllowedSymbol = () => {
    const s = symbolInput.trim().toUpperCase();
    if (s && !allowedSymbols.includes(s)) {
      setAllowedSymbols([...allowedSymbols, s]);
    }
    setSymbolInput('');
  };

  const addBlockedSymbol = () => {
    const s = blockedInput.trim().toUpperCase();
    if (s && !blockedSymbols.includes(s)) {
      setBlockedSymbols([...blockedSymbols, s]);
    }
    setBlockedInput('');
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (!(await ask('Delete this copy setting?', { tone: 'danger', confirmLabel: 'Delete · 刪除' }))) return;
    await supabase.from('copy_settings').delete().eq('id', existing.id);
    onSaved();
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const payload = {
      master_account: master,
      follower_account: follower,
      enabled,
      mode,
      lot_multiplier: lotMultiplier,
      fixed_lot: fixedLot,
      max_lot: maxLot,
      reverse,
      allowed_symbols: allowedSymbols,
      blocked_symbols: blockedSymbols,
      min_lot: minLot,
      copy_pending_orders: copyPending,
      ...symbolRules,
      copy_sl: copySl,
      copy_tp: copyTp,
      max_open_trades: maxOpenTrades,
    };

    if (existing) {
      const { error: err } = await supabase.from('copy_settings').update(payload).eq('id', existing.id);
      if (err) { console.error('copy settings update failed', err); setError('Could not save these settings. Please try again. 未能儲存設定，請再試。'); }
      else onSaved();
    } else {
      const { error: err } = await supabase.from('copy_settings').insert(payload);
      if (err) { console.error('copy settings insert failed', err); setError('Could not save these settings. Please try again. 未能儲存設定，請再試。'); }
      else onSaved();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Copy Settings</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              <span className="text-cyan-400">{master}</span> → <span className="text-amber-400">{follower}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3">
            <span className="text-white font-medium text-sm">Enabled</span>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Mode */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-2">Lot Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {(['multiplier', 'fixed', 'ratio'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    mode === m ? 'bg-cyan-500 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Lot Config */}
          <div className="grid grid-cols-2 gap-3">
            {(mode === 'multiplier' || mode === 'ratio') && (
              <div>
                <label className="block text-slate-400 text-sm font-medium mb-1">Lot Multiplier (0.01-10)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10"
                  value={lotMultiplier}
                  onChange={(e) => setLotMultiplier(parseFloat(e.target.value) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}
            {mode === 'fixed' && (
              <div>
                <label className="block text-slate-400 text-sm font-medium mb-1">Fixed Lot</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={fixedLot}
                  onChange={(e) => setFixedLot(parseFloat(e.target.value) || 0.01)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}
            <div>
              <label className="block text-slate-400 text-sm font-medium mb-1">Min Lot</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={minLot}
                onChange={(e) => setMinLot(parseFloat(e.target.value) || 0.01)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm font-medium mb-1">Max Lot</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={maxLot}
                onChange={(e) => setMaxLot(parseFloat(e.target.value) || 10)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Reverse & Pending */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3">
              <span className="text-white text-sm font-medium">Reverse Trade</span>
              <button
                onClick={() => setReverse(!reverse)}
                className={`relative w-12 h-6 rounded-full transition-colors ${reverse ? 'bg-amber-500' : 'bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${reverse ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3">
              <span className="text-white text-sm font-medium">Copy Pending</span>
              <button
                onClick={() => setCopyPending(!copyPending)}
                className={`relative w-12 h-6 rounded-full transition-colors ${copyPending ? 'bg-cyan-500' : 'bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${copyPending ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/* SL / TP / Max trades */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                ['Copy Stop Loss', copySl, setCopySl],
                ['Copy Take Profit', copyTp, setCopyTp],
              ] as const
            ).map(([label, on, set]) => (
              <div key={label} className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3">
                <span className="text-white text-sm font-medium">{label}</span>
                <button
                  onClick={() => set(!on)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
            <div className="bg-slate-900 rounded-lg px-4 py-2">
              <label className="block text-slate-400 text-xs font-medium">Max Open Trades (0 = no limit)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={maxOpenTrades}
                onChange={(e) => setMaxOpenTrades(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-transparent text-white text-sm py-1 focus:outline-none"
              />
            </div>
          </div>

          <SymbolMappingEditor master={master} follower={follower} rules={symbolRules} onChange={setSymbolRules} autoMatchOnLoad={!existing} />

          {/* Allowed Symbols */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-2">Allowed Symbols (master names, empty = all)</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAllowedSymbol())}
                placeholder="e.g. EURUSD"
                className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
              <IconButton label="Add allowed symbol · 新增" size="md" onClick={addAllowedSymbol}>
                <Plus className="w-4 h-4" />
              </IconButton>
            </div>
            <div className="flex flex-wrap gap-2">
              {allowedSymbols.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-xs">
                  {s}
                  <button onClick={() => setAllowedSymbols(allowedSymbols.filter((x) => x !== s))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Blocked Symbols */}
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-2">Blocked Symbols (master names)</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={blockedInput}
                onChange={(e) => setBlockedInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBlockedSymbol())}
                placeholder="e.g. XAUUSD"
                className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
              <IconButton label="Add blocked symbol · 新增" size="md" onClick={addBlockedSymbol}>
                <Plus className="w-4 h-4" />
              </IconButton>
            </div>
            <div className="flex flex-wrap gap-2">
              {blockedSymbols.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs">
                  {s}
                  <button onClick={() => setBlockedSymbols(blockedSymbols.filter((x) => x !== s))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {existing && (
              <button
                onClick={handleDelete}
                className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
