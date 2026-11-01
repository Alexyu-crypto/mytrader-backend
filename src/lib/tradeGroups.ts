import { tradeKey, type CopyLink } from '@/lib/copyDelay';
import type { TradeHistory } from '@/lib/types';

export type TradeGroup = { lead: TradeHistory; followers: TradeHistory[] };

export function groupByMaster(sorted: TradeHistory[], links: CopyLink[]): TradeGroup[] {
  const present = new Set(sorted.map((t) => tradeKey(t.account_name, t.ticket)));
  const masterOf = new Map<string, string>();
  for (const l of links) {
    const master = tradeKey(l.master_account, l.master_ticket);
    if (present.has(master)) masterOf.set(tradeKey(l.follower_account, l.follower_ticket), master);
  }
  const followersOf = new Map<string, TradeHistory[]>();
  for (const t of sorted) {
    const master = masterOf.get(tradeKey(t.account_name, t.ticket));
    if (!master) continue;
    const list = followersOf.get(master);
    if (list) list.push(t);
    else followersOf.set(master, [t]);
  }
  return sorted
    .filter((t) => !masterOf.has(tradeKey(t.account_name, t.ticket)))
    .map((lead) => ({ lead, followers: followersOf.get(tradeKey(lead.account_name, lead.ticket)) ?? [] }));
}

export function paginateGroups(groups: TradeGroup[], rowsPerPage: number): TradeGroup[][] {
  const pages: TradeGroup[][] = [];
  let current: TradeGroup[] = [];
  let rows = 0;
  for (const g of groups) {
    const size = 1 + g.followers.length;
    if (current.length > 0 && rows + size > rowsPerPage) {
      pages.push(current);
      current = [];
      rows = 0;
    }
    current.push(g);
    rows += size;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}
