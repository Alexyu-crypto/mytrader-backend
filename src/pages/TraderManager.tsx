import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cloud, LayoutGrid, Plus, Rows3, Send, Timer, XCircle, Zap } from 'lucide-react';
import { useAccounts, useLivePositions } from '@/hooks/useRealtime';
import { isCloudAccount, useMetaApiRelay } from '@/hooks/useMetaApiRelay';
import { pairKey, useDeskTickets, useOrderStatuses, useQuoteBoard, type DeskTicket } from '@/hooks/useTraderManager';
import { TicketCard } from '@/components/desk/TicketCard';
import { BatchConfirmDialog, type BatchItem } from '@/components/desk/BatchConfirmDialog';
import { ClosePositionsDialog, type CloseGroup } from '@/components/desk/ClosePositionsDialog';
import { SendFailedDialog, type SendFailure } from '@/components/desk/SendFailedDialog';
import { CLOUD_MIN_SEND_TIMEOUT_S, SEND_TIMEOUT, SYMBOL_PATTERN, cancelDeskOrder, clampSendTimeout, loadSendTimeout, saveSendTimeout, loadDeskSymbols, loadLastSymbol, saveLastSymbol, placeDeskOrder, type MarketSide } from '@/lib/desk';
import { logActivity } from '@/lib/activityLog';
import { isOnline } from '@/lib/format';
import { MasterPositionsPanel } from '@/components/desk/MasterPositionsPanel';

export function TraderManager() {
  const { accounts } = useAccounts();
  const { positions } = useLivePositions();
  const { tickets, loading, error, add, update, updateAll, remove } = useDeskTickets();
  const [symbols, setSymbols] = useState<Map<string, string[]>>(new Map());
  const [lastOrder, setLastOrder] = useState<Map<string, string>>(new Map());
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<SendFailure[]>([]);
  const [deadlines, setDeadlines] = useState<Map<string, number>>(new Map());
  const [closeGroups, setCloseGroups] = useState<CloseGroup[] | null>(null);
  const [closing, setClosing] = useState<Set<number>>(new Set());
  const [oneClick, setOneClick] = useState(false);
  const [timeoutS, setTimeoutS] = useState(loadSendTimeout);
  const [timeoutText, setTimeoutText] = useState(String(timeoutS));
  const commitTimeout = () => {
    const next = clampSendTimeout(parseFloat(timeoutText));
    setTimeoutS(next);
    setTimeoutText(String(next));
    saveSendTimeout(next);
  };
  const [confirm, setConfirm] = useState<{ items: BatchItem[]; skipped: { label: string; reason: string }[]; batch: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const masters = useMemo(() => accounts.filter((a) => a.type === 'master').sort((a, b) => a.account_name.localeCompare(b.account_name)), [accounts]);
  const followers = useMemo(() => accounts.filter((a) => a.type === 'follower').sort((a, b) => a.account_name.localeCompare(b.account_name)), [accounts]);
  const onlineOf = useCallback((name: string | null) => {
    const master = name ? masters.find((m) => m.account_name === name) : undefined;
    return !!master && isOnline(master);
  }, [masters]);
  const { error: relayError } = useMetaApiRelay(masters);
  const cloudInUse = tickets.some((t) => isCloudAccount(masters.find((m) => m.account_name === t.account_name)));

  const pairs = useMemo(
    () => tickets.filter((t) => t.account_name && SYMBOL_PATTERN.test(t.symbol)).map((t) => ({ account: t.account_name as string, symbol: t.symbol })),
    [tickets],
  );
  const quotes = useQuoteBoard(pairs);
  const orders = useOrderStatuses([...lastOrder.values()]);

  const usedAccounts = [...new Set(tickets.map((t) => t.account_name).filter((a): a is string => !!a))].sort().join('|');
  useEffect(() => {
    const missing = usedAccounts ? usedAccounts.split('|').filter((a) => !symbols.has(a)) : [];
    missing.forEach((a) => loadDeskSymbols(a).then((list) => setSymbols((prev) => new Map(prev).set(a, list))));
  }, [usedAccounts, symbols]);

  const blockReason = (t: DeskTicket) => {
    if (!t.account_name) return 'Choose an account 請揀帳戶';
    if (!onlineOf(t.account_name)) return 'Account offline 帳戶離線';
    if (masters.find((m) => m.account_name === t.account_name)?.mt_trade_allowed === false) return 'Investor (read-only) login 投資者唯讀登入';
    if (!SYMBOL_PATTERN.test(t.symbol)) return 'Enter a symbol 請輸入產品';
    if (t.lots <= 0) return 'Enter a volume 請輸入手數';
    return '';
  };

  const toItem = (t: DeskTicket, side: MarketSide): BatchItem => ({
    ticketId: t.id,
    order: { account: t.account_name as string, symbol: t.symbol, type: side, lots: t.lots, price: 0, sl: t.sl, tp: t.tp, comment: '' },
  });

  const sendAndWatch = async (item: BatchItem, deadline: number, limitS: number, batch: boolean): Promise<SendFailure | null> => {
    const { order: o, ticketId } = item;
    const res = await placeDeskOrder(o);
    setSending((prev) => {
      const next = new Set(prev);
      next.delete(ticketId);
      return next;
    });
    if (!res.id) return { item, reason: `Not sent 未能發送: ${res.error}`, retryable: true };
    const id = res.id;
    setLastOrder((prev) => new Map(prev).set(ticketId, id));
    logActivity('desk_order', 'positions', o.account, { symbol: o.symbol, type: o.type, lots: o.lots, sl: o.sl || null, tp: o.tp || null, batch });
    if (batch) update(ticketId, { armed: false });

    await new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now())));
    const { status, error: why } = await cancelDeskOrder(id);
    switch (status) {
      case 'filled':
        return null;
      case 'cancelled':
        return { item, reason: `Not filled within ${limitS}s, cancelled — nothing reached the broker. ${limitS}秒內未成交，已取消（未送到券商）。`, retryable: true };
      case 'failed':
      case 'expired':
        return { item, reason: `Rejected 被拒: ${why || 'broker error 券商錯誤'}`, retryable: true };
      case 'processing':
        return { item, reason: 'Terminal is already executing, cannot cancel. Check the window for the result. 終端執行中，無法取消，請留意視窗結果。', retryable: false };
      default:
        return { item, reason: 'Could not confirm the result. Check the window before retrying. 無法確認結果，重試前請先查看視窗。', retryable: false };
    }
  };

  const execute = async (items: BatchItem[], batch: boolean) => {
    const viaCloud = items.some((i) => isCloudAccount(masters.find((m) => m.account_name === i.order.account)));
    const limitS = viaCloud ? Math.max(timeoutS, CLOUD_MIN_SEND_TIMEOUT_S) : timeoutS;
    const deadline = Date.now() + limitS * 1000;
    setSending((prev) => new Set([...prev, ...items.map((i) => i.ticketId)]));
    setDeadlines((prev) => {
      const next = new Map(prev);
      items.forEach((i) => next.set(i.ticketId, deadline));
      return next;
    });
    const results = await Promise.all(items.map((i) => sendAndWatch(i, deadline, limitS, batch)));
    const failed = results.filter((f): f is SendFailure => !!f);
    if (failed.length > 0) setFailures(failed);
  };

  const sendOne = (t: DeskTicket, side: MarketSide) => {
    const item = toItem(t, side);
    if (oneClick) execute([item], false);
    else setConfirm({ items: [item], skipped: [], batch: false });
  };

  const armed = tickets.filter((t) => t.armed);
  const sendArmed = () => {
    const items: BatchItem[] = [];
    const skipped: { label: string; reason: string }[] = [];
    for (const t of armed) {
      const reason = blockReason(t);
      if (reason) skipped.push({ label: `${t.account_name ?? '—'} ${t.symbol}`, reason });
      else items.push(toItem(t, t.side));
    }
    setConfirm({ items, skipped, batch: true });
  };

  const addWindow = (account?: string) => {
    const last = tickets[tickets.length - 1];
    const free = masters.find((m) => !tickets.some((t) => t.account_name === m.account_name));
    const account_name = account ?? free?.account_name ?? null;
    add({ account_name, symbol: (account_name && loadLastSymbol(account_name)) || last?.symbol || 'XAUUSD', lots: last?.lots || 0.01 });
  };

  const changeTicket = (t: DeskTicket, patch: Partial<DeskTicket>) => {
    if (patch.account_name) {
      const remembered = loadLastSymbol(patch.account_name);
      if (remembered && patch.symbol === undefined) patch = { ...patch, symbol: remembered };
    }
    const account = patch.account_name ?? t.account_name;
    if (patch.symbol && account) saveLastSymbol(account, patch.symbol);
    update(t.id, patch);
  };

  const addAllMasters = () => masters.filter((m) => !tickets.some((t) => t.account_name === m.account_name)).forEach((m) => addWindow(m.account_name));

  const heldBy = (t: DeskTicket) => positions.filter((p) => p.account_name === t.account_name && p.symbol === t.symbol);
  const openGroups: CloseGroup[] = [];
  for (const t of tickets) {
    if (!t.account_name || openGroups.some((g) => g.account === t.account_name && g.symbol === t.symbol)) continue;
    const held = heldBy(t);
    if (held.length > 0) openGroups.push({ account: t.account_name, symbol: t.symbol, positions: held });
  }
  const markClosing = (nums: number[]) => setClosing((prev) => new Set([...prev, ...nums]));

  const positionKey = positions.map((p) => p.ticket).join(',');
  useEffect(() => {
    const live = new Set(positionKey.split(',').map(Number));
    setClosing((prev) => (prev.size === 0 ? prev : new Set([...prev].filter((t) => live.has(t)))));
  }, [positionKey]);

  const armedBuy = armed.filter((t) => t.side === 'BUY').length;
  const armedSell = armed.length - armedBuy;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">
            <LayoutGrid className="h-4 w-4" />
            Trading · 交易
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Trader Manager 交易經理</h1>
          <p className="mt-1 text-sm text-slate-400">Prepare windows in advance, then send one by one or all at once. 預先設定多個視窗，逐張或一併下單。</p>
        </div>
      </header>

      <div className="sticky top-[4.25rem] z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-800 bg-slate-950/90 p-2.5 shadow-lg shadow-black/20 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => addWindow()} className="flex h-9 items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 text-sm font-medium text-cyan-200 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/20 hover:text-white">
            <Plus className="h-4 w-4" />
            <span className="whitespace-nowrap">Add window 新增視窗</span>
          </button>
          {masters.some((m) => !tickets.some((t) => t.account_name === m.account_name)) && (
            <button onClick={addAllMasters} className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white">
              <Rows3 className="h-4 w-4 text-slate-400" />
              <span className="whitespace-nowrap">One per master 每個主帳戶一個</span>
            </button>
          )}
        </div>

        <span aria-hidden className="hidden h-6 w-px bg-slate-800 md:block" />

        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
              oneClick ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
            }`}
          >
            <input type="checkbox" checked={oneClick} onChange={(e) => setOneClick(e.target.checked)} className="sr-only" />
            <Zap className={`h-4 w-4 ${oneClick ? 'text-amber-400' : 'text-slate-500'}`} />
            <span className="whitespace-nowrap">One-click 一鍵交易</span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${oneClick ? 'bg-amber-500' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${oneClick ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
          </label>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 ps-3 pe-1 text-sm font-medium text-slate-300 focus-within:border-amber-500/60" title={`${SEND_TIMEOUT.min}–${SEND_TIMEOUT.max}s`}>
            <Timer className="h-4 w-4 text-amber-400" />
            <span className="whitespace-nowrap">Time limit 成交時限</span>
            <span className="flex h-7 items-center rounded-md bg-slate-800 pe-2">
              <input
                value={timeoutText}
                inputMode="decimal"
                onChange={(e) => setTimeoutText(e.target.value)}
                onBlur={commitTimeout}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="h-7 w-11 bg-transparent text-center font-mono text-sm text-white focus:outline-none"
                aria-label="Time limit in seconds"
              />
              <span className="text-xs text-slate-500">s 秒</span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 ms-auto">
          {openGroups.length > 0 && (
            <button
              onClick={() => setCloseGroups(openGroups)}
              className="flex h-9 items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20"
            >
              <XCircle className="h-4 w-4" />
              <span className="whitespace-nowrap">Close all 一併平倉</span>
            </button>
          )}
          {armed.length > 0 && (
            <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 ps-3 pe-1 text-sm">
              <span className="whitespace-nowrap text-slate-400">Ready 待發</span>
              <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-xs font-semibold text-blue-300">
                {armedBuy} Buy
              </span>
              <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-300">
                {armedSell} Sell
              </span>
              <button onClick={() => updateAll({ armed: false })} className="flex h-7 items-center rounded-md px-2 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
                Clear 清除
              </button>
            </div>
          )}
          <button
            onClick={sendArmed}
            disabled={armed.length === 0}
            className="flex h-9 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-bold text-white shadow-lg shadow-cyan-900/30 transition-all hover:-translate-y-0.5 hover:bg-cyan-500 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <Send className="h-4 w-4" />
            <span className="whitespace-nowrap">Send ready 一併下單</span>
            <span className="min-w-[1.25rem] rounded-full bg-white/20 px-1.5 text-center text-xs font-bold">{armed.length}</span>
          </button>
        </div>
      </div>

      {oneClick && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          One-click is on: Sell / Buy on a window sends immediately without asking. 一鍵交易已開：撳 Sell / Buy 會即刻落單。
        </p>
      )}
      {cloudInUse && (
        <p className={`flex items-start gap-2 rounded-xl border px-4 py-2 text-sm ${relayError ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-sky-500/20 bg-sky-500/10 text-sky-200'}`}>
          <Cloud className="mt-0.5 h-4 w-4 shrink-0" />
          {relayError
            ? `MetaApi cloud link is having trouble: ${relayError}`
            : `MetaApi cloud windows: prices refresh every few seconds, and the time limit is at least ${CLOUD_MIN_SEND_TIMEOUT_S}s for cloud orders. MetaApi 雲端視窗：報價每幾秒更新，雲端指令成交時限最少 ${CLOUD_MIN_SEND_TIMEOUT_S} 秒。`}
        </p>
      )}
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-900/60" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
          <LayoutGrid className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-slate-300">No windows yet 未有視窗</p>
          <p className="mt-1 text-sm text-slate-500">Add a window for each master you want to trade. 為要操作的主帳戶新增視窗。</p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={() => addWindow()} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
              Add window 新增視窗
            </button>
            {masters.length > 0 && (
              <button onClick={addAllMasters} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white">
                One per master 每個主帳戶一個
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {tickets.map((t) => {
            const held = heldBy(t);
            return (
              <TicketCard
                key={t.id}
                ticket={t}
                masters={masters}
                symbols={(t.account_name && symbols.get(t.account_name)) || []}
                online={onlineOf(t.account_name)}
                quote={t.account_name ? quotes.get(pairKey(t.account_name, t.symbol)) : undefined}
                now={now}
                blockReason={blockReason(t)}
                positions={held}
                closing={closing}
                onCloseAll={() => t.account_name && setCloseGroups([{ account: t.account_name, symbol: t.symbol, positions: held }])}
                onClosing={markClosing}
                lastOrder={orders.get(lastOrder.get(t.id) ?? '')}
                deadline={deadlines.get(t.id)}
                sending={sending.has(t.id)}
                onChange={(patch) => changeTicket(t, patch)}
                onRemove={() => remove(t.id)}
                onSend={(side) => sendOne(t, side)}
              />
            );
          })}
        </div>
      )}

      <MasterPositionsPanel masters={masters} followers={followers} positions={positions} closing={closing} onClose={setCloseGroups} />

      {closeGroups && <ClosePositionsDialog groups={closeGroups} onClose={() => setCloseGroups(null)} onQueued={markClosing} />}
      {failures.length > 0 && <SendFailedDialog failures={failures} onClose={() => setFailures([])} onRetry={(items) => execute(items, false)} />}
      {confirm && <BatchConfirmDialog items={confirm.items} skipped={confirm.skipped} onClose={() => setConfirm(null)} onConfirm={(items) => execute(items, confirm.batch)} />}
    </div>
  );
}
