import { useState } from 'react';
import { CheckCircle2, CircleDashed, DatabaseBackup, History, Radio } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import { dataSourceLabel, type BackfillDays, type BackfillJob, type RelayGroup } from '@/lib/relay';

const STATUS_STYLE: Record<BackfillJob['status'], string> = {
  queued: 'border-slate-600 text-slate-300',
  running: 'border-cyan-500/40 text-cyan-300',
  done: 'border-emerald-500/40 text-emerald-300',
  failed: 'border-red-500/40 text-red-300',
};

export function RelayDataSource({ canEdit, group, live, jobs, onChanged }: { canEdit: boolean; group: RelayGroup; live: boolean; jobs: BackfillJob[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const source = dataSourceLabel(group.engine, live);
  const hasQueued = jobs.some((j) => j.status === 'queued' || j.status === 'running');

  const setDays = async (days: BackfillDays) => {
    if (days === group.backfill_days) return;
    setError('');
    const { error: err } = await supabase.from('relay_groups').update({ backfill_days: days, updated_at: new Date().toISOString() }).eq('id', group.id);
    if (err) return setError('Could not save. 未能儲存。');
    onChanged();
  };

  const queue = async () => {
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('relay_backfill_jobs').insert({ group_id: group.id, days: group.backfill_days });
    setBusy(false);
    if (err) return setError('Could not queue the backfill. 未能排隊補數。');
    onChanged();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          <Radio className="h-3.5 w-3.5" /> Data source 數據來源
        </p>
        {[
          ['Live Positions 即時賬單', 'live'],
          ['History 歷史賬單', 'history'],
        ].map(([label, key]) => (
          <div key={key} className="flex items-center justify-between border-b border-slate-800 py-2 text-sm last:border-b-0">
            <span className="text-slate-300">{label}</span>
            <span className={`inline-flex items-center gap-1.5 font-medium ${source.ready ? 'text-emerald-300' : 'text-amber-300'}`}>
              {source.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
              {source.label}
              {!source.ready && <span className="text-xs font-normal text-slate-500">· 未接入，留位</span>}
            </span>
          </div>
        ))}
        <p className="mt-2 text-xs text-slate-500">Follows the engine above. Live accounts keep using MetaAPI / EA. 跟上面引擎切換，正式戶口照用 MetaAPI / EA。</p>
      </div>

      <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          <History className="h-3.5 w-3.5" /> History backfill 歷史補數
        </p>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          On first Relay connection, import past history into the database once, then switch to live push. 第一次駁 Relay 時一次過補返歷史，之後轉即時推送。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-700">
            {([30, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                disabled={!canEdit}
                className={`px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  group.backfill_days === d ? 'bg-slate-200 text-slate-900' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {d} 日
              </button>
            ))}
          </div>
          {canEdit && (
            <button
              onClick={queue}
              disabled={busy || hasQueued}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
            >
              <DatabaseBackup className="h-4 w-4" /> {hasQueued ? 'Queued 已排隊' : 'Queue backfill 排隊補數'}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <ul className="mt-3 space-y-1.5">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 text-xs text-slate-400">
              <span className={`rounded border px-1.5 py-0.5 font-medium uppercase ${STATUS_STYLE[j.status]}`}>{j.status}</span>
              <span>{j.days} 日</span>
              <span className="tabular-nums">{j.rows_imported} rows</span>
              <span className="ms-auto">{timeAgo(j.requested_at)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Nothing runs the backfill yet. It waits for the Relay Gateway. 暫時冇嘢處理，等 Relay Gateway 接入。</p>
      </div>
    </div>
  );
}
