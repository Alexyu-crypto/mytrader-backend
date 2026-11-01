import { useState } from 'react';
import { Ban, Loader2, X } from 'lucide-react';
import { saveBrokerRule, type BrokerRisk } from '@/lib/brokerRisk';
import { IconButton } from '@/components/IconButton';

export function BrokerRuleDialog({ risk, onClose, onSaved }: {
  risk: BrokerRisk;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [manualBlock, setManualBlock] = useState(risk.manual_block);
  const [blockAfter, setBlockAfter] = useState(risk.block_deposits_after ?? '');
  const [autoBlock, setAutoBlock] = useState(risk.auto_block);
  const [maxPending, setMaxPending] = useState(String(risk.max_pending_days));
  const [restrictsProfit, setRestrictsProfit] = useState(risk.restricts_profit);
  const [notes, setNotes] = useState(risk.notes);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    const days = parseInt(maxPending, 10);
    if (isNaN(days) || days < 1) { setErr('Max pending days must be at least 1. 最長待處理日數最少為 1。'); return; }
    setSaving(true);
    try {
      await saveBrokerRule(risk.broker, {
        manual_block: manualBlock,
        block_deposits_after: blockAfter || null,
        auto_block: autoBlock,
        max_pending_days: days,
        restricts_profit: restrictsProfit,
        notes: notes.trim(),
      });
      onSaved();
    } catch {
      setErr('Failed to save. 儲存失敗。');
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-white font-semibold">Risk rules 風控設定</h3>
            <p className="text-slate-400 text-xs mt-0.5">{risk.broker}</p>
          </div>
          <IconButton label="Close · 關閉" tone="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Toggle
            checked={manualBlock}
            onChange={setManualBlock}
            title="Block deposits now 立即禁止入金"
            desc="No new deposit records can be created for this broker. 此經紀商不能再新增入金記錄。"
            danger
          />
          <div>
            <label className="block text-xs text-slate-400 mb-1">Block deposits from date 由此日期起禁止入金</label>
            <div className="flex gap-2">
              <input type="date" value={blockAfter} onChange={(e) => setBlockAfter(e.target.value)} className={inputCls} />
              {blockAfter && (
                <IconButton label="Clear date · 清除" tone="slate" size="md" onClick={() => setBlockAfter('')}>
                  <X className="w-4 h-4" />
                </IconButton>
              )}
            </div>
          </div>
          <Toggle
            checked={autoBlock}
            onChange={setAutoBlock}
            title="Auto block 自動禁止"
            desc="Block when risk score reaches 60 or a withdrawal is pending too long. 風險分數達 60 或出金逾期時自動禁止入金。"
          />
          {autoBlock && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max days a withdrawal may stay pending 出金最長待處理日數</label>
              <input type="number" min="1" value={maxPending} onChange={(e) => setMaxPending(e.target.value)} className={inputCls} />
            </div>
          )}
          <Toggle
            checked={restrictsProfit}
            onChange={setRestrictsProfit}
            title="Withholds profit 只出本金不出盈利"
            desc="Broker refuses to pay out profit. Adds 15 to the risk score. 經紀商拒絕支付盈利，風險分數 +15。"
          />
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes 備註</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Asked for extra KYC before withdrawal" className={`${inputCls} resize-none`} />
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800">
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-sm px-4 py-2 transition-colors">Cancel 取消</button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save 儲存
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, title, desc, danger }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  desc: string;
  danger?: boolean;
}) {
  const on = danger ? 'bg-red-500' : 'bg-cyan-500';
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`w-full flex items-start gap-3 text-left p-3 rounded-xl border transition-colors ${checked ? (danger ? 'border-red-500/40 bg-red-500/5' : 'border-cyan-500/30 bg-cyan-500/5') : 'border-slate-800 hover:border-slate-700'}`}
    >
      <span className={`mt-0.5 shrink-0 w-9 h-5 rounded-full relative transition-colors ${checked ? on : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span>
        <span className="flex items-center gap-1.5 text-sm text-white font-medium">
          {danger && checked && <Ban className="w-3.5 h-3.5 text-red-400" />}
          {title}
        </span>
        <span className="block text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</span>
      </span>
    </button>
  );
}
