import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, CheckCircle2, Clock, CloudUpload, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, UserRoundPlus, Users } from 'lucide-react';
import {
  REFERRAL_STATUSES,
  deleteReferral,
  fetchOpeningBrokers,
  fetchReferrals,
  referralMeta,
  setReferralStatus,
  type OpeningBroker,
  type Referral,
  type ReferralStatus,
} from '@/lib/ibReferrals';
import { OpeningBrokerCard } from '@/components/opening/OpeningBrokerCard';
import { ReferralDialog } from '@/components/opening/ReferralDialog';
import { IconButton } from '@/components/IconButton';
import { useConfirm } from '@/hooks/useConfirm';

type Filter = 'all' | ReferralStatus;

export function AccountOpeningPage({ canDelete, onConnectCloud }: { canDelete: boolean; onConnectCloud?: (r: Referral, brokerName: string) => void }) {
  const ask = useConfirm();
  const [brokers, setBrokers] = useState<OpeningBroker[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<{ referral: Referral | null; brokerId: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, r] = await Promise.all([fetchOpeningBrokers(), fetchReferrals()]);
    setBrokers(b.brokers);
    setReferrals(r.referrals);
    setError(b.error ?? r.error ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const brokerName = useMemo(() => new Map(brokers.map((b) => [b.id, b.broker_name])), [brokers]);
  const countByBroker = useMemo(() => {
    const m = new Map<string, number>();
    referrals.forEach((r) => m.set(r.broker_id, (m.get(r.broker_id) ?? 0) + 1));
    return m;
  }, [referrals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return referrals.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return [r.client_name, r.client_contact, r.account_number, brokerName.get(r.broker_id) ?? ''].some((v) => v.toLowerCase().includes(q));
    });
  }, [referrals, query, filter, brokerName]);

  const countOf = (s: ReferralStatus) => referrals.filter((r) => r.status === s).length;
  const stats = [
    { label: 'Total clients 總客戶', value: referrals.length, icon: Users, tone: 'text-cyan-300 bg-cyan-500/10' },
    { label: 'Awaiting opening 待開戶', value: countOf('applied'), icon: Clock, tone: 'text-sky-300 bg-sky-500/10' },
    { label: 'Opened 已開戶', value: countOf('opened'), icon: CheckCircle2, tone: 'text-amber-300 bg-amber-500/10' },
    { label: 'Funded 已入金', value: countOf('funded'), icon: Banknote, tone: 'text-emerald-300 bg-emerald-500/10' },
  ];

  const changeStatus = async (r: Referral, status: ReferralStatus) => {
    setBusyId(r.id);
    const err = await setReferralStatus(r, status);
    setBusyId(null);
    if (err) setError(err);
    else load();
  };

  const remove = async (r: Referral) => {
    if (!(await ask(`Delete ${r.client_name}? 確定刪除？`, { tone: 'danger', confirmLabel: 'Delete · 刪除' }))) return;
    setBusyId(r.id);
    const err = await deleteReferral(r.id);
    setBusyId(null);
    if (err) setError(err);
    else load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Account Opening 開戶部</h1>
          <p className="mt-1 text-sm text-slate-400">Share our IB links with clients and track each account from application to funding. 向客戶發送代理連結，追蹤由申請到入金的每個帳戶。</p>
        </div>
        <div className="flex gap-2">
          <IconButton label="Refresh · 重新整理" tone="slate" size="md" onClick={() => { setLoading(true); load(); }}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
          <IconButton label="Register client · 登記客戶" tone="solid" size="md" onClick={() => setDialog({ referral: null, brokerId: brokers[0]?.id ?? '' })} disabled={brokers.length === 0}>
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Approved brokers & links 已開通經紀商及連結</h2>
        {loading && brokers.length === 0 ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
        ) : brokers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-12 text-center">
            <UserRoundPlus className="mx-auto h-10 w-10 text-slate-600" />
            <p className="mt-3 font-semibold text-white">No approved brokers yet 尚未有已開通的經紀商</p>
            <p className="mt-1 text-sm text-slate-400">Brokers appear here once the IB team marks them approved. IB 部標記為已開通後會在此顯示。</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {brokers.map((b) => (
              <OpeningBrokerCard key={b.id} broker={b} clients={countByBroker.get(b.id) ?? 0} onRegister={() => setDialog({ referral: null, brokerId: b.id })} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 p-4">
          <h2 className="mr-auto font-semibold text-white">Clients 客戶記錄</h2>
          <div className="flex flex-wrap gap-1">
            {(['all', ...REFERRAL_STATUSES.map((s) => s.key)] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {f === 'all' ? 'All 全部' : referralMeta(f).label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client, account… 搜尋"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">{referrals.length ? 'No matching clients 沒有符合的客戶' : 'No clients registered yet 尚未登記客戶'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2.5 font-medium">Client 客戶</th>
                  <th className="px-3 py-2.5 font-medium">Broker 經紀商</th>
                  <th className="px-3 py-2.5 font-medium">Account 帳號</th>
                  <th className="px-3 py-2.5 font-medium">Opened 開戶日</th>
                  <th className="px-3 py-2.5 font-medium">Status 狀態</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filtered.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-800/30">
                    <td className="px-3 py-2">
                      <p className="font-medium text-white">{r.client_name}</p>
                      <p className="text-xs text-slate-500">{r.client_contact || '—'}</p>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{brokerName.get(r.broker_id) ?? '—'}</td>
                    <td className="px-3 py-2">
                      <p className="font-mono text-slate-200">{r.account_number || '—'}</p>
                      {r.account_type && <p className="text-xs text-slate-500">{r.account_type}</p>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-400">{r.opened_on ?? '—'}</td>
                    <td className="px-3 py-2">
                      <select
                        value={r.status}
                        disabled={busyId === r.id}
                        onChange={(e) => changeStatus(r, e.target.value as ReferralStatus)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium focus:outline-none ${referralMeta(r.status).tone}`}
                        aria-label="Status"
                      >
                        {REFERRAL_STATUSES.map((s) => <option key={s.key} value={s.key} className="bg-slate-900 text-white">{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {onConnectCloud && r.account_number && (r.status === 'opened' || r.status === 'funded') && (
                          <IconButton label="連接 MetaApi 雲端 · Connect MetaApi cloud" tone="cyan" onClick={() => onConnectCloud(r, brokerName.get(r.broker_id) ?? '')}>
                            <CloudUpload className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                        <IconButton label="Edit · 修改" tone="ghost" onClick={() => setDialog({ referral: r, brokerId: r.broker_id })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        {canDelete && (
                          <IconButton label="Delete · 刪除" tone="red" onClick={() => remove(r)} disabled={busyId === r.id}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog && (
        <ReferralDialog
          brokers={brokers}
          referral={dialog.referral}
          defaultBrokerId={dialog.brokerId}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); load(); }}
        />
      )}
    </div>
  );
}
