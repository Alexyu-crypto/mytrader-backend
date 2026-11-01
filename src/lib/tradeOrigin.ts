import { diffMs, serverDelayMs, tradeKey, type CloseSignal, type CopyLink } from '@/lib/copyDelay';
import type { TradeHistory } from '@/lib/types';

export type OriginReason = 'master' | 'manual_open' | 'oneclick_close' | 'own_close' | 'no_master_record';

export type TimingPart = { kind: 'delay'; ms: number } | { kind: 'reason'; reason: OriginReason };

export type TradeTiming = { open: TimingPart; close: TimingPart } | { source: true };

const reason = (r: OriginReason): TimingPart => ({ kind: 'reason', reason: r });

export function buildTradeTimings(
  trades: TradeHistory[],
  links: CopyLink[],
  closeSignals: CloseSignal[],
  masterAccounts: Set<string>,
  canSeeCopyData: boolean,
): Map<string, TradeTiming> {
  const byKey = new Map(trades.map((t) => [tradeKey(t.account_name, t.ticket), t]));
  const linkByFollower = new Map(links.map((l) => [tradeKey(l.follower_account, l.follower_ticket), l]));
  const oneClick = new Set<string>();
  const engineClosedAt = new Map<string, string>();
  for (const s of closeSignals) {
    if (s.close_ticket) oneClick.add(tradeKey(s.follower_account, s.close_ticket));
    else if (s.status === 'executed') {
      const prev = engineClosedAt.get(s.copy_id);
      if (!prev || s.created_at < prev) engineClosedAt.set(s.copy_id, s.created_at);
    }
  }

  const result = new Map<string, TradeTiming>();
  for (const trade of trades) {
    if (masterAccounts.has(trade.account_name)) {
      result.set(trade.id, { source: true });
      continue;
    }
    if (!canSeeCopyData) continue;
    const key = tradeKey(trade.account_name, trade.ticket);
    const closedByClick = oneClick.has(key);
    const link = linkByFollower.get(key);
    if (!link) {
      result.set(trade.id, { open: reason('manual_open'), close: reason(closedByClick ? 'oneclick_close' : 'own_close') });
      continue;
    }
    const master = byKey.get(tradeKey(link.master_account, link.master_ticket));
    if (!master) {
      result.set(trade.id, { open: reason('no_master_record'), close: reason(closedByClick ? 'oneclick_close' : 'no_master_record') });
      continue;
    }
    const openMs = serverDelayMs(link.created_at, link.opened_at, master.open_time) ?? diffMs(trade.open_time, master.open_time);
    const brokerCloseMs = diffMs(trade.close_time, master.close_time);
    const closeSignalAt = engineClosedAt.get(link.copy_id);
    let close: TimingPart;
    if (closedByClick) close = reason('oneclick_close');
    else if (!closeSignalAt || brokerCloseMs === null || brokerCloseMs < -1000) close = reason('own_close');
    else close = { kind: 'delay', ms: serverDelayMs(closeSignalAt, link.closed_at, master.close_time) ?? Math.max(brokerCloseMs, 0) };
    result.set(trade.id, { open: openMs === null ? reason('no_master_record') : { kind: 'delay', ms: openMs }, close });
  }
  return result;
}

export function openDelayOf(timing: TradeTiming | undefined): number | null {
  if (!timing || 'source' in timing) return null;
  return timing.open.kind === 'delay' ? timing.open.ms : null;
}
