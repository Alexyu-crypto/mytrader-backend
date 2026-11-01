import { useState } from 'react';
import { BellRing, Check, ChevronRight, Loader2 } from 'lucide-react';
import { followUpWindow, logFollowUp, stageMeta, type IbBroker } from '@/lib/ibPartners';
import { inputCls } from '@/components/ib/IbFields';
import { IconButton } from '@/components/IconButton';

const NEXT_OPTIONS = [3, 7, 14];

function dueLabel(b: IbBroker): { text: string; tone: string } {
  const w = followUpWindow(b);
  const diff = Math.round((new Date(`${b.next_follow_up}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  if (w === 'overdue') return { text: `${-diff}d overdue 逾期 ${-diff} 日`, tone: 'bg-red-500/15 text-red-300' };
  if (w === 'today') return { text: 'Today 今日', tone: 'bg-amber-500/15 text-amber-300' };
  return { text: `In ${diff}d ${diff} 日後`, tone: 'bg-sky-500/10 text-sky-300' };
}

function ReminderRow({ b, onOpen, onDone }: { b: IbBroker; onOpen: () => void; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const due = dueLabel(b);
  const stage = stageMeta(b.stage);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await logFollowUp(b, days, note);
    setBusy(false);
    if (err) return setError(err);
    setOpen(false);
    setNote('');
    onDone();
  };

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 animate-fade-in">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${due.tone}`}>{due.text}</span>
        <button onClick={onOpen} className="flex min-w-0 items-center gap-1 font-medium text-white hover:text-cyan-200">
          <span className="truncate">{b.broker_name}</span> <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} /> {stage.label}
        </span>
        {!open && (
          <span className="ml-auto flex">
            <IconButton label="Followed up · 已跟進" tone="green" onClick={() => setOpen(true)}>
              <Check className="h-3.5 w-3.5" />
            </IconButton>
          </span>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="mt-2.5 space-y-2 animate-fade-in">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? 跟進內容（可選）" className={inputCls} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Next reminder 下次提醒：</span>
            {NEXT_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${days === d ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-white'}`}
              >
                {d}d
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save 儲存
            </button>
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </form>
      )}
    </li>
  );
}

export function FollowUpPanel({ brokers, onOpen, onChanged }: { brokers: IbBroker[]; onOpen: (id: string) => void; onChanged: () => void }) {
  const items = brokers
    .filter((b) => followUpWindow(b) !== null)
    .sort((a, b) => (a.next_follow_up ?? '').localeCompare(b.next_follow_up ?? ''));
  if (items.length === 0) return null;
  const urgent = items.filter((b) => followUpWindow(b) !== 'soon').length;

  return (
    <section className={`rounded-xl border p-4 ${urgent ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
      <header className="mb-3 flex items-center gap-2">
        <BellRing className={`h-4 w-4 ${urgent ? 'text-amber-300' : 'text-slate-400'}`} />
        <h2 className="text-sm font-semibold text-white">Follow-up reminders 跟進提醒</h2>
        <span className="text-xs text-slate-400">
          {urgent} due now 需即時跟進 · {items.length - urgent} in the next 2 days 兩日內
        </span>
      </header>
      <ul className="space-y-2">
        {items.map((b) => <ReminderRow key={b.id} b={b} onOpen={() => onOpen(b.id)} onDone={onChanged} />)}
      </ul>
    </section>
  );
}
