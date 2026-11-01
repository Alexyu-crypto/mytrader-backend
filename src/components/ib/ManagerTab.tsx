import { Mail, MessageCircle, Phone } from 'lucide-react';
import type { IbBroker } from '@/lib/ibPartners';
import { Field, SaveBar } from '@/components/ib/IbFields';
import { useBrokerDraft } from '@/components/ib/useBrokerDraft';
import { Hint } from '@/components/IconButton';

const KEYS = ['manager_name', 'manager_title', 'manager_email', 'manager_phone', 'manager_messenger', 'manager_timezone'] as const;

export function ManagerTab({ broker, onSaved }: { broker: IbBroker; onSaved: () => void }) {
  const { draft, set, ...bar } = useBrokerDraft(broker, [...KEYS], onSaved);
  const hasContact = broker.manager_email || broker.manager_phone;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">The broker's dedicated IB manager who looks after our referred clients. 經紀商指派專門負責我們轉介客戶的 IB 經理。</p>

      {hasContact && (
        <div className="flex flex-wrap gap-2">
          {broker.manager_email && (
            <Hint label="Email · 電郵">
              <a href={`mailto:${broker.manager_email}`} aria-label="Email" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300">
                <Mail className="h-4 w-4" />
              </a>
            </Hint>
          )}
          {broker.manager_phone && (
            <Hint label="Call · 致電">
              <a href={`tel:${broker.manager_phone.replace(/[^\d+]/g, '')}`} aria-label="Call" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300">
                <Phone className="h-4 w-4" />
              </a>
            </Hint>
          )}
          {broker.manager_messenger && (
            <span className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300">
              <MessageCircle className="h-4 w-4" /> {broker.manager_messenger}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name 姓名" value={draft.manager_name} onChange={(v) => set('manager_name', v)} />
        <Field label="Title 職位" value={draft.manager_title} onChange={(v) => set('manager_title', v)} placeholder="IB Account Manager" />
        <Field label="Email 電郵" type="email" value={draft.manager_email} onChange={(v) => set('manager_email', v)} />
        <Field label="Phone 電話" value={draft.manager_phone} onChange={(v) => set('manager_phone', v)} placeholder="+852 …" />
        <Field label="WhatsApp / Telegram / WeChat" value={draft.manager_messenger} onChange={(v) => set('manager_messenger', v)} placeholder="Telegram @name" />
        <Field label="Time zone / language 時區及語言" value={draft.manager_timezone} onChange={(v) => set('manager_timezone', v)} placeholder="GMT+8 · 粵語 / English" />
      </div>
      <SaveBar {...bar} onSave={bar.save} />
    </div>
  );
}
