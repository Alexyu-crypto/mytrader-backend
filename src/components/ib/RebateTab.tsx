import { PAYOUT_CYCLES, REBATE_TYPES, type IbBroker } from '@/lib/ibPartners';
import { Field, SaveBar, SelectField, inputCls } from '@/components/ib/IbFields';
import { useBrokerDraft } from '@/components/ib/useBrokerDraft';

const KEYS = ['rebate_type', 'rebate_per_lot', 'payout_cycle', 'rebate_terms'] as const;

export function RebateTab({ broker, onSaved }: { broker: IbBroker; onSaved: () => void }) {
  const { draft, set, ...bar } = useBrokerDraft(broker, [...KEYS], onSaved);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">Record the agreed commission so the team knows what each referred client earns us. 記錄已商定的回傭，方便團隊了解每位轉介客戶的收益。</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Rebate type 回傭方式" value={draft.rebate_type} options={REBATE_TYPES} onChange={(v) => set('rebate_type', v)} />
        <Field
          label="Headline rate (USD / lot) 每手回佣"
          type="number"
          value={draft.rebate_per_lot === null ? '' : String(draft.rebate_per_lot)}
          onChange={(v) => set('rebate_per_lot', v === '' || !Number.isFinite(Number(v)) ? null : Number(v))}
          placeholder="e.g. 8"
        />
        <SelectField label="Payout cycle 結算週期" value={draft.payout_cycle} options={PAYOUT_CYCLES} onChange={(v) => set('payout_cycle', v)} />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-slate-400">Full terms 詳細條款（按產品分組、分級、最低出佣等）</span>
        <textarea
          rows={7}
          value={draft.rebate_terms}
          onChange={(e) => set('rebate_terms', e.target.value)}
          placeholder={'FX majors: $8 / lot\nGold: $10 / lot\nIndices: $2 / lot\nTier 2 above 500 lots / month: +$1\nMinimum payout: $50'}
          className={`${inputCls} font-mono`}
        />
      </label>
      <SaveBar {...bar} onSave={bar.save} />
    </div>
  );
}
