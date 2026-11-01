import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CandlestickChart, Cloud, Cpu } from 'lucide-react';
import { useAccounts, useLivePositions } from '@/hooks/useRealtime';
import { useDeskMeta, useDeskOrders } from '@/hooks/useDesk';
import { isCloudAccount, useMetaApiRelay } from '@/hooks/useMetaApiRelay';
import { MasterList } from '@/components/desk/MasterList';
import { OrderTicket } from '@/components/desk/OrderTicket';
import { ReadOnlyNotice, isReadOnlyLogin } from '@/components/ReadOnlyBadge';
import { DeskPositions } from '@/components/desk/DeskPositions';
import { DeskOrderLog } from '@/components/desk/DeskOrderLog';
import { TERMINAL_FRESH_MS } from '@/lib/desk';
import { formatCurrency, formatSigned, isOnline } from '@/lib/format';
import type { LivePosition } from '@/lib/types';

export function TradingDesk() {
  const { accounts, loading } = useAccounts();
  const { positions } = useLivePositions();
  const { terminals, groups, followers } = useDeskMeta();
  const [selected, setSelected] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const { orders } = useDeskOrders(selected);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const masters = useMemo(() => accounts.filter((a) => a.type === 'master').sort((a, b) => a.account_name.localeCompare(b.account_name)), [accounts]);
  const { error: relayError } = useMetaApiRelay(masters);

  const positionsByAccount = useMemo(() => {
    const m = new Map<string, LivePosition[]>();
    for (const p of positions) m.set(p.account_name, [...(m.get(p.account_name) ?? []), p]);
    return m;
  }, [positions]);

  useEffect(() => {
    if (!selected && masters.length > 0) setSelected(masters[0].account_name);
  }, [masters, selected]);

  const account = masters.find((a) => a.account_name === selected) ?? null;
  const accountPositions = selected ? positionsByAccount.get(selected) ?? [] : [];
  const online = account ? isOnline(account) : false;
  const cloud = isCloudAccount(account);
  const polled = selected ? terminals.get(selected) : undefined;
  const deskReady = !!polled && Date.now() - new Date(polled).getTime() < TERMINAL_FRESH_MS;
  const followerTrades = (followers.get(selected ?? '') ?? []).reduce((s, f) => s + (positionsByAccount.get(f)?.length ?? 0), 0);
  const floating = accountPositions.reduce((s, p) => s + (p.profit || 0) + (p.swap || 0), 0);
  const defaultSymbol = accountPositions[0]?.symbol ?? 'XAUUSD';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">
            <CandlestickChart className="h-4 w-4" />
            Trading · 交易
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Trading Desk 交易台</h1>
          <p className="mt-1 text-sm text-slate-400">Trade any master account directly. Followers copy automatically. 直接為主帳戶落單，跟單帳戶自動複製。</p>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-900/60" />
      ) : masters.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center text-slate-400">No master accounts yet. 尚未有主帳戶。</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <MasterList masters={masters} positionsByAccount={positionsByAccount} groups={groups} terminals={terminals} selected={selected} onSelect={setSelected} />

          {account && (
            <div className="min-w-0 space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Balance 結餘', formatCurrency(account.balance ?? 0), 'text-white'],
                  ['Equity 淨值', formatCurrency(account.equity ?? 0), 'text-white'],
                  ['Floating 浮動盈虧', formatSigned(floating), floating >= 0 ? 'text-emerald-400' : 'text-red-400'],
                  ['Status 狀態', online ? 'Online 在線' : 'Offline 離線', online ? 'text-emerald-400' : 'text-slate-500'],
                ].map(([k, v, cls]) => (
                  <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                    <p className="text-[11px] text-slate-500">{k}</p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${cls}`}>{v}</p>
                  </div>
                ))}
              </div>

              {cloud && (
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${relayError ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-sky-500/20 bg-sky-500/10 text-sky-200'}`}>
                  <Cloud className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {relayError
                      ? `MetaApi cloud link is having trouble: ${relayError}`
                      : 'Connected through MetaApi cloud. Orders run directly in the cloud; prices refresh every few seconds rather than every tick. 經 MetaApi 雲端連接，指令直接於雲端執行；報價每幾秒更新一次，並非逐筆跳動。'}
                  </p>
                </div>
              )}
              {!cloud && !deskReady && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  <Cpu className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    This terminal is not running the desk-ready EA (v3.0) yet. Closing works, but new orders and live prices need the v3.0 EA. 此終端未安裝 v3.0 EA，可以平倉，但落單及即時報價需要先更新 EA。
                  </p>
                </div>
              )}
              {!online && (
                <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Account is offline — orders are disabled. 帳戶離線，暫停落單。
                </div>
              )}
              {isReadOnlyLogin(account) && <ReadOnlyNotice />}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <OrderTicket key={account.account_name} account={account.account_name} online={online} cloud={cloud} defaultSymbol={defaultSymbol} onSent={() => undefined} />
                <DeskOrderLog orders={orders} />
              </div>

              <DeskPositions account={account.account_name} positions={accountPositions} followerTrades={followerTrades} canTrade={online} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
