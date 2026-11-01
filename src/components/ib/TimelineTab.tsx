import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Eye, FilePlus2, Loader2, MessageSquare, Paperclip, Send } from 'lucide-react';
import { addEvent, fetchEvents, type IbEvent } from '@/lib/ibPartners';
import { formatTime } from '@/lib/format';
import { inputCls } from '@/components/ib/IbFields';
import { IconButton } from '@/components/IconButton';

const KIND_ICON: Record<IbEvent['kind'], { icon: typeof MessageSquare; tone: string }> = {
  note: { icon: MessageSquare, tone: 'bg-slate-700 text-slate-200' },
  stage: { icon: ArrowRight, tone: 'bg-cyan-500/20 text-cyan-300' },
  follow_up: { icon: CalendarClock, tone: 'bg-amber-500/20 text-amber-300' },
  created: { icon: FilePlus2, tone: 'bg-emerald-500/20 text-emerald-300' },
  reveal: { icon: Eye, tone: 'bg-red-500/20 text-red-300' },
  document: { icon: Paperclip, tone: 'bg-sky-500/20 text-sky-300' },
};

export function TimelineTab({ brokerId, refreshKey }: { brokerId: string; refreshKey: number }) {
  const [events, setEvents] = useState<IbEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchEvents(brokerId);
    setEvents(res.events);
    setError(res.error ?? '');
    setLoading(false);
  }, [brokerId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    const err = await addEvent(brokerId, 'note', note.trim().slice(0, 2000));
    setBusy(false);
    if (err) return setError(err);
    setNote('');
    load();
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="flex gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a follow-up note… 新增跟進記錄" className={inputCls} />
        <IconButton label="Add note · 新增記錄" tone="solid" size="md" type="submit" disabled={busy || !note.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </IconButton>
      </form>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
      ) : events.length === 0 ? (
        <p className="text-center text-sm text-slate-500">No history yet. 尚未有記錄。</p>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-800 pl-6">
          {events.map((ev) => {
            const { icon: Icon, tone } = KIND_ICON[ev.kind];
            return (
              <li key={ev.id} className="relative animate-fade-in">
                <span className={`absolute -left-[35px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-slate-900 ${tone}`}>
                  <Icon className="h-3 w-3" />
                </span>
                <p className="whitespace-pre-wrap text-sm text-slate-200">{ev.body}</p>
                <p className="mt-0.5 text-xs text-slate-500">{ev.actor_email || '—'} · {formatTime(ev.created_at)}</p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
