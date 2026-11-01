import { useState } from 'react';
import { CalendarClock, CheckCircle2, CircleAlert, ListChecks, Loader2, Plus, Trash2 } from 'lucide-react';
import { addPlanned, deletePlanned, type Coverage, type Platform } from '@/lib/brokerFiles';
import { useConfirm } from '@/hooks/useConfirm';

const inputCls = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-rose-400 focus:outline-none';

function PlanForm({ brokers, onAdded }: { brokers: string[]; onAdded: () => void }) {
  const [platform, setPlatform] = useState<Platform>('MT5');
  const [broker, setBroker] = useState('');
  const [server, setServer] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broker.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      await addPlanned({ platform, broker, server, note });
      setBroker('');
      setServer('');
      setNote('');
      onAdded();
    } catch (err) {
      setMessage((err as Error).message);
    }
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <CalendarClock className="h-4 w-4 text-rose-300" /> Add a future broker 加入未來會用的券商
      </p>
      <div className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className={inputCls} aria-label="Platform">
          <option value="MT4">MT4</option>
          <option value="MT5">MT5</option>
        </select>
        <input value={broker} onChange={(e) => setBroker(e.target.value)} list="planned-brokers" maxLength={60} required placeholder="Broker 券商 e.g. Pepperstone" aria-label="Broker" className={inputCls} />
        <input value={server} onChange={(e) => setServer(e.target.value)} maxLength={80} placeholder="Server (optional) 伺服器" aria-label="Server" className={`${inputCls} font-mono`} />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (optional) 備註" aria-label="Note" className={inputCls} />
        <button type="submit" disabled={saving || !broker.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-rose-400 disabled:opacity-40">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add 加入
        </button>
      </div>
      <datalist id="planned-brokers">{brokers.map((b) => <option key={b} value={b} />)}</datalist>
      <p className="mt-2 text-xs text-slate-500">
        Leave the server empty if unknown: any file of that broker counts as collected. 未知伺服器可留空，該券商任何檔案都當已收集。
      </p>
      {message && <p className="mt-2 text-xs text-red-300">{message}</p>}
    </form>
  );
}

export function NeedsList({ coverage, brokers, onChanged, onError }: { coverage: Coverage[]; brokers: string[]; onChanged: () => void; onError: (msg: string) => void }) {
  const ask = useConfirm();
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [removing, setRemoving] = useState('');
  const rows = onlyMissing ? coverage.filter((c) => !c.serverFile) : coverage;

  const remove = async (id: string, broker: string) => {
    if (!(await ask(`Remove ${broker} from the planned list? 確定移除？`, { tone: 'danger', confirmLabel: 'Remove · 移除' }))) return;
    setRemoving(id);
    try {
      await deletePlanned(id);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
    setRemoving('');
  };

  return (
    <div className="space-y-4">
      <PlanForm brokers={brokers} onAdded={onChanged} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          Servers used by our accounts, plus brokers planned for the future. Missing ones will show "No connection" on a new PC, so collect these first.
          <span className="block text-slate-500">現有戶口用到的伺服器及預計會用的券商，缺少檔案的新電腦會連唔到，請優先收集。</span>
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="accent-rose-500" />
          Missing only 只顯示欠缺
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-12 text-center">
          <ListChecks className="mx-auto h-10 w-10 text-emerald-500/70" />
          <p className="mt-3 font-semibold text-white">{coverage.length ? 'All servers covered 全部伺服器已齊' : 'Nothing to collect yet 暫時未有需要收集'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Platform</th>
                <th className="px-4 py-2.5 font-medium">Broker 券商</th>
                <th className="px-4 py-2.5 font-medium">Server 伺服器</th>
                <th className="px-4 py-2.5 text-right font-medium">Accounts 戶口</th>
                <th className="px-4 py-2.5 font-medium">Server file 伺服器檔</th>
                <th className="px-4 py-2.5 font-medium">Setup 安裝程式</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {rows.map((c) => (
                <tr key={c.plannedId ?? `${c.platform}|${c.broker}|${c.server}`} className="transition-colors hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 text-slate-300">{c.platform}</td>
                  <td className="px-4 py-2.5 text-white">
                    {c.broker || '-'}
                    {c.note && <span className="block text-xs text-slate-500">{c.note}</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{c.server || '-'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                    {c.plannedId ? <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">Planned 預計</span> : c.accounts}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.serverFile
                      ? <span className="flex items-center gap-1.5 text-emerald-300"><CheckCircle2 className="h-4 w-4" />{c.serverFile}</span>
                      : <span className="flex items-center gap-1.5 text-amber-300"><CircleAlert className="h-4 w-4" />Missing 欠缺</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {c.setupFile ? <span className="text-emerald-300">Own setup 專屬</span> : <span className="text-slate-500">Uses default 用預設</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {c.plannedId && (
                      <button onClick={() => remove(c.plannedId!, c.broker)} disabled={removing === c.plannedId} aria-label={`Remove ${c.broker}`} className="rounded p-1 text-slate-500 transition-colors hover:text-red-300 disabled:opacity-40">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
