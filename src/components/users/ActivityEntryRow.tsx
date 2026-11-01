import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ACTION_META, CATEGORY_LABEL, describeValue, type ActivityEntry } from '@/lib/activityLog';
import { timeAgo } from '@/lib/format';

const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'user_id', 'handled_by', 'approved_by', 'created_by']);

function detailRows(entry: ActivityEntry): { field: string; from?: string; to: string }[] {
  const rows: { field: string; from?: string; to: string }[] = [];
  if (entry.changes) {
    for (const [field, value] of Object.entries(entry.changes)) {
      if (HIDDEN_FIELDS.has(field) && entry.action !== 'update') continue;
      if (entry.action === 'update' && value && typeof value === 'object' && 'to' in value) {
        const v = value as { from: unknown; to: unknown };
        rows.push({ field, from: describeValue(v.from), to: describeValue(v.to) });
      } else rows.push({ field, to: describeValue(value) });
    }
  }
  if (entry.meta) for (const [field, value] of Object.entries(entry.meta)) rows.push({ field, to: describeValue(value) });
  return rows;
}

export function ActivityEntryRow({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const action = ACTION_META[entry.action] ?? { label: entry.action, tone: 'bg-slate-600/40 text-slate-300' };
  const details = detailRows(entry);
  const time = new Date(entry.created_at);

  return (
    <li className="border-b border-slate-700/50 last:border-0">
      <button
        type="button"
        onClick={() => details.length > 0 && setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5 ${details.length ? 'hover:bg-slate-700/25' : 'cursor-default'}`}
        aria-expanded={open}
      >
        <span className="w-14 shrink-0 text-xs tabular-nums text-slate-400" title={time.toLocaleString()}>
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-semibold uppercase text-cyan-300 sm:flex">
          {entry.actor_email?.charAt(0) ?? '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium text-white">{entry.actor_email ?? 'Unknown 未知'}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${action.tone}`}>{action.label}</span>
            <span className="text-xs text-slate-500">{CATEGORY_LABEL[entry.category] ?? entry.category}</span>
          </span>
          {entry.target && <span className="mt-0.5 block truncate text-xs text-slate-400">{entry.target}</span>}
        </span>
        <span className="hidden shrink-0 text-xs text-slate-500 md:block">{timeAgo(entry.created_at)}</span>
        {details.length > 0 && <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div className="px-4 pb-4 sm:pl-[6.5rem] sm:pr-5 animate-fade-in">
          <dl className="overflow-hidden rounded-lg border border-slate-700/70 bg-slate-900/60 text-xs">
            {details.map((d) => (
              <div key={d.field} className="grid grid-cols-[minmax(7rem,30%)_1fr] gap-3 border-b border-slate-800 px-3 py-2 last:border-0">
                <dt className="truncate font-medium text-slate-400">{d.field}</dt>
                <dd className="min-w-0 break-words text-slate-200">
                  {d.from !== undefined ? (
                    <>
                      <span className="text-red-300/80 line-through decoration-red-400/40">{d.from}</span>
                      <span className="mx-1.5 text-slate-500">→</span>
                      <span className="text-emerald-300">{d.to}</span>
                    </>
                  ) : (
                    d.to
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}
