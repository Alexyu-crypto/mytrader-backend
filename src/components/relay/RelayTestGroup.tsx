import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, FlaskConical, Info, Loader2, RadioTower } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Account } from '@/lib/types';
import { ENGINE_OPTIONS, loadRelayGroup, RELAY_TEST_GROUP, type BackfillJob, type ContractSize, type RelayEngine, type RelayGroup, type RelayLogRow, type RelayMember } from '@/lib/relay';
import { RelayMembers } from '@/components/relay/RelayMembers';
import { RelayDataSource } from '@/components/relay/RelayDataSource';
import { RelayLog } from '@/components/relay/RelayLog';

interface RelayData {
  group: RelayGroup;
  members: RelayMember[];
  sizes: ContractSize[];
  jobs: BackfillJob[];
  log: RelayLogRow[];
}

export function RelayTestGroup({ canEdit, accounts, liveLinked }: { canEdit: boolean; accounts: Account[]; liveLinked: Set<string> }) {
  const [data, setData] = useState<RelayData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'none'>('loading');
  const [open, setOpen] = useState(true);
  const [engineError, setEngineError] = useState('');
  const [notice, setNotice] = useState(false);

  const load = useCallback(async () => {
    const res = await loadRelayGroup(RELAY_TEST_GROUP);
    if (res.error) return setState('error');
    if (!res.group) return setState('none');
    setData({ group: res.group, members: res.members, sizes: res.sizes, jobs: res.jobs, log: res.log });
    setState('ready');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state === 'none') return null;
  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-amber-500/30 px-4 py-3 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Relay Test group...
      </div>
    );
  }
  if (state === 'error' || !data) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">Could not load the Relay Test group. 未能載入 Relay 測試組。</div>;
  }

  const { group } = data;
  const filled = data.members.filter((m) => m.account_name).length;

  const setEngine = async (engine: RelayEngine) => {
    setNotice(engine === 'cloud_relay');
    if (engine === group.engine) return;
    setEngineError('');
    const { error } = await supabase.from('relay_groups').update({ engine, updated_at: new Date().toISOString() }).eq('id', group.id);
    if (error) return setEngineError('Could not change the engine. 未能更改引擎。');
    setData({ ...data, group: { ...group, engine } });
  };

  return (
    <section className="overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] to-slate-900/40">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-5 py-4 text-start transition-colors hover:bg-amber-500/5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-white">
            {group.name}
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">Test 測試</span>
          </p>
          <p className="text-xs text-slate-400">
            Isolated from live copying · 獨立測試，不會經現有引擎落單 · {filled}/10 accounts 戶口
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-amber-500/20 px-5 py-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Engine 引擎</p>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-700">
              {ENGINE_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setEngine(o.key)}
                  disabled={!canEdit}
                  className={`px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                    group.engine === o.key ? 'bg-amber-500 text-black' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {engineError && <p className="mt-2 text-sm text-red-400">{engineError}</p>}
            {group.engine === 'cloud_relay' && (
              <div className={`mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200 ${notice ? 'animate-fade-in' : ''}`}>
                <RadioTower className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Relay not connected, testing · Relay 未接入，測試中</span>
              </div>
            )}
            {group.engine !== 'cloud_relay' && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>Saved as the plan for this test group only. No trades are sent. 只記錄此測試組嘅選擇，唔會落任何單。</span>
              </div>
            )}
          </div>

          <RelayMembers canEdit={canEdit} members={data.members} sizes={data.sizes} accounts={accounts} liveLinked={liveLinked} onChanged={load} />
          <RelayDataSource canEdit={canEdit} group={group} jobs={data.jobs} onChanged={load} />
          <RelayLog rows={data.log} />
        </div>
      )}
    </section>
  );
}
