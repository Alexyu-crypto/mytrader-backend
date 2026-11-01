import { useEffect, useMemo, useState } from 'react';
import { Gauge, Server, Building2 } from 'lucide-react';
import { fetchAccountIps, type LoginIp } from '@/lib/accountCredentials';
import { BROKER_LIMITS, CLOUD_LIMITS, LEVEL_DOT, LEVEL_TEXT, average, latencyOf, levelFor } from '@/lib/latency';
import { isOnline } from '@/lib/format';
import type { Account } from '@/lib/types';

type GroupBy = 'broker' | 'vps';

interface Row {
  key: string;
  accounts: number;
  broker: number | null;
  cloud: number | null;
  worst: number | null;
}

const IP_REFRESH_MS = 5 * 60_000;

const GROUP_OPTIONS: { value: GroupBy; label: string; Icon: typeof Server }[] = [
  { value: 'broker', label: 'By broker · 券商', Icon: Building2 },
  { value: 'vps', label: 'By VPS · 電腦', Icon: Server },
];

function useAccountIps(enabled: boolean) {
  const [ips, setIps] = useState<Record<string, LoginIp> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      const result = await fetchAccountIps();
      if (active && result) setIps(result);
    };
    load();
    const id = setInterval(load, IP_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [enabled]);
  return ips;
}

function Ms({ value, limits }: { value: number | null; limits: { fair: number; slow: number } }) {
  const level = levelFor(value, limits);
  return (
    <span className={`inline-flex items-center justify-end gap-1.5 tabular-nums ${LEVEL_TEXT[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT[level]}`} />
      {value === null ? '--' : `${value} ms`}
    </span>
  );
}

export function LatencyPanel({ accounts, now, showVps }: { accounts: Account[]; now: number; showVps: boolean }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('broker');
  const ips = useAccountIps(showVps);

  const measured = useMemo(
    () => accounts.filter((a) => isOnline(a.last_seen)).map((a) => ({ account: a, latency: latencyOf(a, now) })).filter((m) => m.latency.fresh),
    [accounts, now],
  );
  const waitingUpgrade = accounts.filter((a) => isOnline(a.last_seen) && !a.latency_at).length;

  const rows = useMemo(() => {
    const groups = new Map<string, typeof measured>();
    for (const m of measured) {
      const key = groupBy === 'broker' ? m.account.broker_server || m.account.broker : ips?.[m.account.id]?.ip ?? 'Unknown VPS · 未知';
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    return [...groups.entries()]
      .map(([key, list]): Row => {
        const brokers = list.map((m) => m.latency.broker).filter((v): v is number => v !== null);
        return {
          key,
          accounts: list.length,
          broker: average(brokers),
          cloud: average(list.map((m) => m.latency.cloud).filter((v): v is number => v !== null)),
          worst: brokers.length ? Math.max(...brokers) : null,
        };
      })
      .sort((a, b) => (b.broker ?? -1) - (a.broker ?? -1));
  }, [measured, groupBy, ips]);

  const overallBroker = average(measured.map((m) => m.latency.broker).filter((v): v is number => v !== null));
  const overallCloud = average(measured.map((m) => m.latency.cloud).filter((v): v is number => v !== null));
  const slow = measured.filter((m) => levelFor(m.latency.broker, BROKER_LIMITS) === 'slow' || levelFor(m.latency.cloud, CLOUD_LIMITS) === 'slow').length;

  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 border-b border-slate-700">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 grid place-items-center shrink-0">
            <Gauge className="w-5 h-5 text-cyan-400" />
          </span>
          <div>
            <h2 className="text-white font-semibold">Connection latency · 連線延遲</h2>
            <p className="text-slate-400 text-sm mt-0.5 leading-relaxed">
              Broker = MT4/MT5 to broker server. Cloud = EA to this website. Updates every 15 seconds.
            </p>
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
          {GROUP_OPTIONS.filter((o) => showVps || o.value !== 'vps').map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setGroupBy(value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                groupBy === value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-700 border-b border-slate-700">
        <div className="p-4">
          <p className="text-slate-400 text-xs">Avg broker ping</p>
          <p className="text-xl font-bold mt-1"><Ms value={overallBroker} limits={BROKER_LIMITS} /></p>
        </div>
        <div className="p-4">
          <p className="text-slate-400 text-xs">Avg cloud</p>
          <p className="text-xl font-bold mt-1"><Ms value={overallCloud} limits={CLOUD_LIMITS} /></p>
        </div>
        <div className="p-4">
          <p className="text-slate-400 text-xs">Slow accounts</p>
          <p className={`text-xl font-bold mt-1 tabular-nums ${slow ? 'text-red-400' : 'text-slate-300'}`}>{slow}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8 px-4">
          No latency data yet. Install EA v2.7 on each terminal to start measuring · 請安裝 v2.7 EA 開始量度
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left font-medium px-3 py-2">{groupBy === 'broker' ? 'Broker server' : 'VPS IP'}</th>
                <th className="text-right font-medium px-3 py-2">Accounts</th>
                <th className="text-right font-medium px-3 py-2">Avg broker</th>
                <th className="text-right font-medium px-3 py-2">Slowest</th>
                <th className="text-right font-medium px-3 py-2">Avg cloud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-slate-800/60 transition-colors">
                  <td className="px-3 py-2 text-white font-mono text-xs truncate max-w-[220px]">{r.key}</td>
                  <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{r.accounts}</td>
                  <td className="px-3 py-2 text-right"><Ms value={r.broker} limits={BROKER_LIMITS} /></td>
                  <td className="px-3 py-2 text-right"><Ms value={r.worst} limits={BROKER_LIMITS} /></td>
                  <td className="px-3 py-2 text-right"><Ms value={r.cloud} limits={CLOUD_LIMITS} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT.good}`} />Broker under {BROKER_LIMITS.fair} ms</span>
        <span className="inline-flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT.fair}`} />{BROKER_LIMITS.fair}-{BROKER_LIMITS.slow - 1} ms</span>
        <span className="inline-flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT.slow}`} />{BROKER_LIMITS.slow} ms or more (Telegram alert)</span>
        {waitingUpgrade > 0 && <span className="text-amber-400">{waitingUpgrade} online EAs need v2.7 to report latency</span>}
      </div>
    </section>
  );
}
