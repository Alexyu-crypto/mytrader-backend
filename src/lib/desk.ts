import { supabase } from '@/lib/supabase';

export type MarketSide = 'BUY' | 'SELL';
export type PendingType = 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
export type DeskOrderType = MarketSide | PendingType;

export interface Quote {
  bid: number;
  ask: number;
  digits: number;
  vol_min: number | null;
  vol_step: number | null;
  vol_max: number | null;
  quoted_at: string;
}

export interface DeskOrder {
  id: string;
  account_name: string;
  symbol: string;
  order_type: DeskOrderType;
  lots: number;
  price: number | null;
  sl: number | null;
  tp: number | null;
  status: 'pending' | 'processing' | 'filled' | 'failed' | 'expired' | 'cancelled';
  ticket: number | null;
  error: string | null;
  requested_email: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface DeskOrderInput {
  account: string;
  symbol: string;
  type: DeskOrderType;
  lots: number;
  price: number;
  sl: number;
  tp: number;
  comment: string;
}

export const PENDING_TYPES: { value: PendingType; label: string }[] = [
  { value: 'BUY_LIMIT', label: 'Buy Limit' },
  { value: 'SELL_LIMIT', label: 'Sell Limit' },
  { value: 'BUY_STOP', label: 'Buy Stop' },
  { value: 'SELL_STOP', label: 'Sell Stop' },
];

export const ORDER_TYPE_LABEL: Record<DeskOrderType, string> = {
  BUY: 'Buy',
  SELL: 'Sell',
  BUY_LIMIT: 'Buy Limit',
  SELL_LIMIT: 'Sell Limit',
  BUY_STOP: 'Buy Stop',
  SELL_STOP: 'Sell Stop',
};

export const COMMON_SYMBOLS = [
  'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD', 'EURJPY', 'GBPJPY', 'EURGBP',
  'XPDUSD', 'XPTUSD', 'US30', 'NAS100', 'SPX500', 'GER40', 'UK100', 'JPN225', 'HK50', 'USOIL', 'UKOIL', 'BTCUSD', 'ETHUSD',
];

export const SYMBOL_PATTERN = /^[A-Za-z0-9._#+/!-]{1,64}$/;
export const QUOTE_STALE_MS = 5000;
export const CLOUD_QUOTE_STALE_MS = 15000;
export const CLOUD_MIN_SEND_TIMEOUT_S = 10;
export const quoteStaleMs = (cloud: boolean) => (cloud ? CLOUD_QUOTE_STALE_MS : QUOTE_STALE_MS);
export const TERMINAL_FRESH_MS = 3 * 60 * 1000;

export const isBuy = (t: string) => t.startsWith('BUY');

export async function loadDeskSymbols(account: string): Promise<string[]> {
  const [uploaded, live] = await Promise.all([
    supabase.from('account_symbols').select('symbols').eq('account_name', account).maybeSingle(),
    supabase.from('live_positions').select('symbol').eq('account_name', account).limit(500),
  ]);
  const list = Array.isArray(uploaded.data?.symbols) ? (uploaded.data.symbols as string[]) : [];
  const traded = ((live.data ?? []) as { symbol: string | null }[]).map((r) => r.symbol);
  return [...new Set([...list, ...traded].filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b));
}

const SYMBOL_ALIASES: Record<string, string[]> = { XAUUSD: ['GOLD'], XAGUSD: ['SILVER'] };

export function matchBrokerSymbol(wanted: string, list: string[]): string {
  if (list.length === 0 || list.includes(wanted)) return wanted;
  const base = wanted.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const name of [base, ...(SYMBOL_ALIASES[base] ?? [])]) {
    const hit = list
      .filter((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith(name))
      .sort((a, b) => a.length - b.length)[0];
    if (hit) return hit;
  }
  return wanted;
}

export async function placeDeskOrder(o: DeskOrderInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('desk_place_order', {
    p_account: o.account,
    p_symbol: o.symbol,
    p_type: o.type,
    p_lots: o.lots,
    p_price: o.price,
    p_sl: o.sl,
    p_tp: o.tp,
    p_comment: o.comment,
  });
  if (error || typeof data !== 'string') return { id: null, error: error?.message ?? 'No response' };
  return { id: data, error: null };
}

export async function closeDeskPosition(account: string, ticket: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('desk_close_position', { p_account: account, p_ticket: ticket });
  return !error && (data === 'queued' || data === 'already_queued');
}

export const SEND_TIMEOUT = { default: 1.5, min: 0.5, max: 30 };
const SEND_TIMEOUT_KEY = 'trader-manager-send-timeout';

export const clampSendTimeout = (s: number) =>
  Number.isFinite(s) ? Math.min(SEND_TIMEOUT.max, Math.max(SEND_TIMEOUT.min, Math.round(s * 10) / 10)) : SEND_TIMEOUT.default;

export function loadSendTimeout(): number {
  const raw = localStorage.getItem(SEND_TIMEOUT_KEY);
  return raw === null ? SEND_TIMEOUT.default : clampSendTimeout(parseFloat(raw));
}

export function saveSendTimeout(s: number) {
  localStorage.setItem(SEND_TIMEOUT_KEY, String(s));
}

const lastSymbolKey = (account: string) => `desk.lastSymbol.${account}`;

export function loadLastSymbol(account: string): string | null {
  const s = localStorage.getItem(lastSymbolKey(account));
  return s && SYMBOL_PATTERN.test(s) ? s : null;
}

export function saveLastSymbol(account: string, symbol: string) {
  if (SYMBOL_PATTERN.test(symbol)) localStorage.setItem(lastSymbolKey(account), symbol);
}

export async function cancelDeskOrder(id: string): Promise<{ status: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('desk_cancel_order', { p_id: id });
  if (error || typeof data !== 'string') return { status: null, error: null };
  if (data !== 'failed' && data !== 'expired') return { status: data, error: null };
  const { data: row } = await supabase.from('desk_orders').select('error').eq('id', id).maybeSingle();
  return { status: data, error: (row?.error as string | null) ?? null };
}

export type CloseSide = 'ALL' | MarketSide;

export async function closeDeskSymbol(account: string, symbol: string, side: CloseSide): Promise<number | null> {
  const { data, error } = await supabase.rpc('desk_close_symbol', { p_account: account, p_symbol: symbol, p_side: side });
  return error || typeof data !== 'number' ? null : data;
}

export async function modifyDeskPosition(account: string, ticket: number, sl: number, tp: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('desk_modify_position', { p_account: account, p_ticket: ticket, p_sl: sl, p_tp: tp });
  return !error && data === 'queued';
}

export const fmtPrice = (v: number | null | undefined, digits: number) => (v == null || v === 0 ? '—' : v.toFixed(digits));

export function guessDigits(price: number): number {
  if (!price) return 2;
  const s = String(price);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : Math.min(5, s.length - dot - 1);
}
