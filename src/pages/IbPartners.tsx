import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BellRing, Briefcase, CheckCircle2, Clock, Link2, Loader2, Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import { STAGES, daysSince, fetchBrokers, needsFollowUp, type IbBroker } from '@/lib/ibPartners';
import { NewBrokerDialog } from '@/components/ib/NewBrokerDialog';
import { BrokerDrawer } from '@/components/ib/BrokerDrawer';
import { FollowUpPanel } from '@/components/ib/FollowUpPanel';
import { IconButton } from '@/components/IconButton';

function BrokerCard({ b, onOpen }: { b: IbBroker; onOpen: () => void }) {
  const due = needsFollowUp(b);
  const days = daysSince(b.updated_at);
  return (
    <button
      onClick={onOpen}
      className={`group w-full rounded-xl border bg-slate-900 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 ${
        due ? 'border-amber-500/40' : 'border-slate-800'
      }`}
    >
      <p className="truncate font-semibold text-white group-hover:text-cyan-200">{b.broker_name}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{[b.regulation, b.region].filter(Boolean).join(' · ') || '—'}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        {due && (
          <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-300">
            <BellRing className="h-3 w-3" /> Follow up 跟進
          </span>
        )}
        {b.link_count > 0 && (
          <span className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
            <Link2 className="h-3 w-3" /> {b.link_count}
          </span>
        )}
        {b.manager_name && (
          <span className="flex max-w-[120px] items-center gap-1 truncate rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
            <UserRound className="h-3 w-3 shrink-0" /> {b.manager_name}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-slate-500" title="Days since last update 距上次更新日數">
          <Clock className="h-3 w-3" /> {days}d
        </span>
      </div>
    </button>
  );
}

export function IbPartnersPage({ isAdmin, onFollowUpsChanged }: { isAdmin: boolean; onFollowUpsChanged: () => void }) {
  const [brokers, setBrokers] = useState<IbBroker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchBrokers();
    setBrokers(res.brokers);
    setError(res.error ?? '');
    setLoading(false);
    onFollowUpsChanged();
  }, [onFollowUpsChanged]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter((b) => [b.broker_name, b.region, b.regulation, b.manager_name, b.ib_code].some((v) => v.toLowerCase().includes(q)));
  }, [brokers, query]);

  const open = brokers.find((b) => b.id === openId) ?? null;
  const inProgress = brokers.filter((b) => b.stage !== 'approved' && b.stage !== 'rejected').length;
  const approved = brokers.filter((b) => b.stage === 'approved').length;
  const due = brokers.filter(needsFollowUp).length;

  const stats = [
    { label: 'In progress 申請中', value: inProgress, icon: Briefcase, tone: 'text-sky-300 bg-sky-500/10' },
    { label: 'Approved 已開通', value: approved, icon: CheckCircle2, tone: 'text-emerald-300 bg-emerald-500/10' },
    { label: 'Follow-up due 待跟進', value: due, icon: BellRing, tone: due ? 'text-amber-300 bg-amber-500/15' : 'text-slate-400 bg-slate-700/30' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">IB Partners IB 代理管理</h1>
          <p className="mt-1 text-sm text-slate-400">Track every broker IB application from first contact to a live partner account. 由接洽到開通，追蹤每間經紀商的代理申請。</p>
        </div>
        <div className="flex gap-2">
          <IconButton label="Refresh · 重新整理" tone="slate" size="md" onClick={() => { setLoading(true); load(); }}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
          <IconButton label="New application · 新增申請" tone="solid" size="md" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <FollowUpPanel brokers={brokers} onOpen={setOpenId} onChanged={load} />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search broker, region, IB manager… 搜尋"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      {loading && brokers.length === 0 ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : brokers.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-16 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-slate-600" />
          <h2 className="mt-4 font-semibold text-white">No IB applications yet 尚未有代理申請</h2>
          <p className="mt-1 text-sm text-slate-400">Create a file for the first broker you are approaching. 為第一間接洽的經紀商建立檔案。</p>
          <button onClick={() => setCreating(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400">
            <Plus className="h-4 w-4" /> New application 新增申請
          </button>
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
          <div className="grid min-w-[1080px] grid-cols-6 gap-3">
            {STAGES.map((s) => {
              const items = filtered.filter((b) => b.stage === s.key);
              return (
                <section key={s.key} className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/50">
                  <header className="border-b border-slate-800 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      <h3 className="flex-1 truncate text-sm font-semibold text-white">{s.label}</h3>
                      <span className="rounded-full bg-slate-800 px-2 text-xs tabular-nums text-slate-300">{items.length}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{s.hint}</p>
                  </header>
                  <div className="flex-1 space-y-2 p-2">
                    {items.map((b) => <BrokerCard key={b.id} b={b} onOpen={() => setOpenId(b.id)} />)}
                    {items.length === 0 && <p className="py-6 text-center text-xs text-slate-600">—</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {creating && (
        <NewBrokerDialog
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            await load();
            setOpenId(id);
          }}
        />
      )}
      {open && <BrokerDrawer broker={open} isAdmin={isAdmin} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
