import { updateBroker, type IbBroker } from '@/lib/ibPartners';
import { Field, SaveBar, inputCls } from '@/components/ib/IbFields';
import { useBrokerDraft } from '@/components/ib/useBrokerDraft';
import { DocumentsSection } from '@/components/ib/DocumentsSection';

const KEYS = ['broker_name', 'website', 'regulation', 'region', 'contact_name', 'contact_email', 'application_ref', 'submitted_at', 'next_follow_up', 'documents', 'notes'] as const;

export function ApplicationTab({ broker, onSaved }: { broker: IbBroker; onSaved: () => void }) {
  const { draft, set, ...bar } = useBrokerDraft(broker, [...KEYS], onSaved);

  const markUploaded = async (key: string) => {
    if (key !== 'other' && !broker.documents[key]) {
      set('documents', { ...draft.documents, [key]: true });
      await updateBroker(broker.id, { documents: { ...broker.documents, [key]: true } });
    }
    onSaved();
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Broker details 經紀商資料</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Broker name 經紀商名稱" value={draft.broker_name} onChange={(v) => set('broker_name', v)} span />
          <Field label="Website 網站" value={draft.website} onChange={(v) => set('website', v)} placeholder="https://" />
          <Field label="Regulation 監管牌照" value={draft.regulation} onChange={(v) => set('regulation', v)} />
          <Field label="Region 地區" value={draft.region} onChange={(v) => set('region', v)} />
          <Field label="Broker contact 對方聯絡人" value={draft.contact_name} onChange={(v) => set('contact_name', v)} />
          <Field label="Contact email 聯絡電郵" value={draft.contact_email} onChange={(v) => set('contact_email', v)} type="email" span />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Application progress 申請進度</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Application ref 申請編號" value={draft.application_ref} onChange={(v) => set('application_ref', v)} />
          <Field label="Submitted on 提交日期" type="date" value={draft.submitted_at ?? ''} onChange={(v) => set('submitted_at', v || null)} />
          <Field label="Next follow-up 下次跟進" type="date" value={draft.next_follow_up ?? ''} onChange={(v) => set('next_follow_up', v || null)} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          The follow-up date is set automatically when the stage changes; you can still pick your own. 轉階段時會自動安排跟進日期，亦可自行更改。
        </p>
      </section>

      <DocumentsSection
        brokerId={broker.id}
        checked={draft.documents}
        onToggle={(key) => set('documents', { ...draft.documents, [key]: !draft.documents[key] })}
        onUploaded={markUploaded}
      />

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-slate-400">Internal notes 內部備註</span>
        <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} />
      </label>

      <SaveBar {...bar} onSave={bar.save} />
    </div>
  );
}
