import { useState } from 'react';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { DEFAULT_PAIR_VALUES, isAllSymbols, parseAllowedSymbols, parseSymbols, type PairValues } from '@/lib/copyGroupImport';

const MODES: { value: PairValues['mode']; label: string }[] = [
  { value: 'multiplier', label: 'Multiplier 倍數' },
  { value: 'fixed', label: 'Fixed 固定' },
  { value: 'ratio', label: 'Ratio 比例' },
];

function Toggle({ label, on, onChange, tone = 'bg-emerald-500' }: { label: string; on: boolean; onChange: (v: boolean) => void; tone?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-left transition-colors hover:bg-slate-900/70"
    >
      <span className="text-xs font-medium text-white">{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? tone : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

function NumberField({ label, value, step, min, onChange }: { label: string; value: number; step: string; min: string; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white transition-colors focus:border-amber-500 focus:outline-none"
      />
    </label>
  );
}

export function FollowMasterSection({
  masters,
  master,
  onMasterChange,
  values,
  onValuesChange,
}: {
  masters: string[];
  master: string;
  onMasterChange: (m: string) => void;
  values: PairValues;
  onValuesChange: (v: PairValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const [allowAll, setAllowAll] = useState(values.allowed_symbols.length === 0);
  const [allowedText, setAllowedText] = useState(values.allowed_symbols.join(', '));
  const [blockedText, setBlockedText] = useState(values.blocked_symbols.join(', '));
  const set = <K extends keyof PairValues>(key: K, v: PairValues[K]) => onValuesChange({ ...values, [key]: v });

  const lotSummary = values.mode === 'fixed' ? `${values.fixed_lot} lot` : `${values.lot_multiplier}x`;
  const summary = [values.enabled ? 'On' : 'Off', `${values.mode} ${lotSummary}`, values.reverse ? 'Reverse' : null, values.copy_sl && values.copy_tp ? 'SL/TP' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <label htmlFor="follow-master" className="mb-1 block text-sm font-medium text-slate-300">
        Follow Master Account 跟隨主帳戶 <span className="font-normal text-slate-500">(optional)</span>
      </label>
      <select
        id="follow-master"
        value={master}
        onChange={(e) => onMasterChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white transition-colors focus:border-amber-500 focus:outline-none"
      >
        <option value="">Not now 暫不設定</option>
        {masters.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {masters.length === 0 && <p className="mt-1 text-xs text-slate-500">No master accounts yet. Create one first. 尚未有主帳戶。</p>}

      {master && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-left transition-colors hover:border-amber-500/50"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-white">
              <SlidersHorizontal className="h-4 w-4 text-amber-400" />
              Copy Settings 跟單設定
            </span>
            <span className="flex min-w-0 items-center gap-2">
              {!open && <span className="truncate text-xs capitalize text-slate-400">{summary}</span>}
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {open && (
            <div className="mt-3 space-y-3 animate-fade-in">
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-400">Lot Mode 手數模式</span>
                <div className="grid grid-cols-3 gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => set('mode', m.value)}
                      className={`rounded-lg py-2 text-xs font-medium transition-colors ${values.mode === m.value ? 'bg-amber-500 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {values.mode === 'fixed' ? (
                  <NumberField label="Fixed Lot 固定手數" value={values.fixed_lot} step="0.01" min="0.01" onChange={(n) => set('fixed_lot', n)} />
                ) : (
                  <NumberField label="Multiplier 倍數" value={values.lot_multiplier} step="0.01" min="0.01" onChange={(n) => set('lot_multiplier', n)} />
                )}
                <NumberField label="Min Lot 最小" value={values.min_lot} step="0.01" min="0" onChange={(n) => set('min_lot', n)} />
                <NumberField label="Max Lot 最大" value={values.max_lot} step="0.01" min="0.01" onChange={(n) => set('max_lot', n)} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Toggle label="Enabled 啟用" on={values.enabled} onChange={(v) => set('enabled', v)} />
                <Toggle label="Reverse 反向" on={values.reverse} onChange={(v) => set('reverse', v)} tone="bg-amber-500" />
                <Toggle label="Copy SL 止損" on={values.copy_sl} onChange={(v) => set('copy_sl', v)} />
                <Toggle label="Copy TP 止盈" on={values.copy_tp} onChange={(v) => set('copy_tp', v)} />
                <Toggle label="Pending 掛單" on={values.copy_pending_orders} onChange={(v) => set('copy_pending_orders', v)} tone="bg-cyan-500" />
                <NumberField
                  label="Max Trades (0 = no limit)"
                  value={values.max_open_trades}
                  step="1"
                  min="0"
                  onChange={(n) => set('max_open_trades', Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-400">Allowed Symbols 只跟這些商品</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={allowAll}
                    onClick={() => {
                      const next = !allowAll;
                      setAllowAll(next);
                      set('allowed_symbols', next ? [] : parseAllowedSymbols(allowedText));
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${allowAll ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    All 全部商品
                  </button>
                </div>
                {allowAll ? (
                  <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">Follows every symbol from the master. 跟隨主帳戶所有商品。</p>
                ) : (
                  <input
                    type="text"
                    value={allowedText}
                    onChange={(e) => {
                      setAllowedText(e.target.value);
                      if (isAllSymbols(e.target.value)) {
                        setAllowAll(true);
                        setAllowedText('');
                        set('allowed_symbols', []);
                      } else set('allowed_symbols', parseSymbols(e.target.value));
                    }}
                    placeholder="e.g. XAUUSD, EURUSD"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-amber-500 focus:outline-none"
                  />
                )}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">Blocked Symbols 不跟這些商品</span>
                <input
                  type="text"
                  value={blockedText}
                  onChange={(e) => {
                    setBlockedText(e.target.value);
                    set('blocked_symbols', parseSymbols(e.target.value));
                  }}
                  placeholder="e.g. BTCUSD (empty = none 留空 = 不封鎖)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-amber-500 focus:outline-none"
                />
              </label>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">Symbol mapping can be set later in Copy Settings. 商品對照可之後於跟單設定調整。</p>
                <IconButton
                  label="Reset to defaults · 重設"
                  tone="ghost"
                  onClick={() => {
                    onValuesChange({ ...DEFAULT_PAIR_VALUES });
                    setAllowAll(true);
                    setAllowedText('');
                    setBlockedText('');
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            </div>
          )}
          {!open && <p className="mt-1 text-xs text-slate-500">Uses default settings unless you change them. 未修改則使用預設設定。</p>}
        </div>
      )}
    </div>
  );
}
