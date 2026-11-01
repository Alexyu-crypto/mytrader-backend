import { supabase } from '@/lib/supabase';
import type { BalanceOperation, TradeHistory } from '@/lib/types';

const PAGE = 1000;
const MAX_ROWS = 20000;

type AccountSelector = string | string[];

async function fetchPaged<T>(table: string, orderBy: string, accountName?: AccountSelector): Promise<T[]> {
  if (Array.isArray(accountName) && accountName.length === 0) return [];
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = supabase.from(table).select('*').order(orderBy, { ascending: false }).range(from, from + PAGE - 1);
    if (Array.isArray(accountName)) query = query.in('account_name', accountName);
    else if (accountName) query = query.eq('account_name', accountName);
    const { data, error } = await query;
    if (error) {
      console.error(`load ${table} failed`, error);
      throw new Error('Could not load account data. 未能載入帳戶資料。');
    }
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export function fetchTradeHistory(accountName?: AccountSelector) {
  return fetchPaged<TradeHistory>('trade_history', 'close_time', accountName);
}

export function fetchBalanceOperations(accountName?: AccountSelector) {
  return fetchPaged<BalanceOperation>('balance_operations', 'op_time', accountName);
}

export function netOf(trade: Pick<TradeHistory, 'profit' | 'commission' | 'swap'>): number {
  return (trade.profit || 0) + (trade.commission || 0) + (trade.swap || 0);
}

export const OP_LABEL: Record<BalanceOperation['op_type'], string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  credit: 'Credit',
};

export function reportUrl(accountName: string, agentSlug?: string | null): string {
  const prefix = agentSlug ? `/a/${agentSlug}/report/` : '/report/';
  return `${window.location.origin}${prefix}${encodeURIComponent(accountName)}`;
}
