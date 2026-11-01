import { supabase } from '@/lib/supabase';

export interface RebateBroker {
  id: string;
  broker_name: string;
  rebate_type: string;
  rebate_per_lot: number | null;
  payout_cycle: string;
  referral_count: number;
}

export interface RebateStatement {
  id: string;
  broker_id: string;
  period_start: string;
  period_end: string;
  currency: string;
  lots: number | null;
  rate_per_lot: number | null;
  expected_amount: number;
  received_amount: number | null;
  received_on: string | null;
  reference: string;
  notes: string;
  created_email: string;
  created_at: string;
}

export type StatementInput = Pick<RebateStatement, 'broker_id' | 'period_start' | 'period_end' | 'currency' | 'lots' | 'rate_per_lot' | 'expected_amount' | 'notes'>;
export type ReceiptInput = Pick<RebateStatement, 'received_amount' | 'received_on' | 'reference'>;

export type ReconStatus = 'pending' | 'overdue' | 'matched' | 'short' | 'over';

export const RECON_META: Record<ReconStatus, { label: string; tone: string }> = {
  pending: { label: 'Awaiting 待到帳', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  overdue: { label: 'Overdue 逾期未到', tone: 'text-red-300 bg-red-500/10 border-red-500/30' },
  matched: { label: 'Matched 金額相符', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  short: { label: 'Short 少收', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  over: { label: 'Over 多收', tone: 'text-orange-300 bg-orange-500/10 border-orange-500/30' },
};

export const CURRENCIES = ['USD', 'HKD', 'USDT', 'EUR', 'GBP', 'AUD'];
export const OVERDUE_AFTER_DAYS = 14;

const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';

export function reconStatus(s: RebateStatement): ReconStatus {
  if (s.received_amount === null) {
    const limit = new Date(Date.now() - OVERDUE_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10);
    return s.period_end < limit ? 'overdue' : 'pending';
  }
  const diff = Number(s.received_amount) - Number(s.expected_amount);
  if (Math.abs(diff) < 0.01) return 'matched';
  return diff < 0 ? 'short' : 'over';
}

export function money(v: number | null, currency: string): string {
  if (v === null || Number.isNaN(Number(v))) return '—';
  return `${currency} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function fetchRebateBrokers(): Promise<{ brokers: RebateBroker[]; error: string | null }> {
  const { data, error } = await supabase.rpc('ib_rebate_brokers');
  if (error || !Array.isArray(data)) return { brokers: [], error: 'Could not load brokers. 未能載入經紀商資料。' };
  return { brokers: data as RebateBroker[], error: null };
}

export async function fetchStatements(): Promise<{ statements: RebateStatement[]; error: string | null }> {
  const { data, error } = await supabase.from('ib_rebate_statements').select('*').order('period_end', { ascending: false });
  if (error || !Array.isArray(data)) return { statements: [], error: 'Could not load rebate records. 未能載入回傭記錄。' };
  return { statements: data as RebateStatement[], error: null };
}

export async function fetchTrackedLots(brokerId: string, start: string, end: string): Promise<{ lots: number; accounts: number } | null> {
  const { data, error } = await supabase.rpc('ib_tracked_lots', { p_broker: brokerId, p_start: start, p_end: end });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return null;
  return { lots: Number(row.lots) || 0, accounts: Number(row.accounts) || 0 };
}

function validNumber(v: number | null, max: number): boolean {
  return v === null || (Number.isFinite(v) && v >= 0 && v <= max);
}

export async function saveStatement(id: string | null, input: StatementInput): Promise<string | null> {
  if (!input.broker_id) return 'Please choose a broker. 請選擇經紀商。';
  if (!input.period_start || !input.period_end || input.period_end < input.period_start) return 'Please enter a valid period. 請輸入正確的結算期。';
  if (!validNumber(input.lots, 1e7) || !validNumber(input.rate_per_lot, 1e5)) return 'Lots and rate must be zero or more. 手數及回傭率不可為負數。';
  if (!Number.isFinite(input.expected_amount) || input.expected_amount < 0 || input.expected_amount > 1e9) return 'Please enter the expected amount. 請輸入應收金額。';
  const row = { ...input, currency: input.currency.trim().toUpperCase().slice(0, 10) || 'USD', notes: input.notes.trim() };
  const { error } = id ? await supabase.from('ib_rebate_statements').update(row).eq('id', id) : await supabase.from('ib_rebate_statements').insert(row);
  return error ? FALLBACK : null;
}

export async function recordReceipt(id: string, input: ReceiptInput): Promise<string | null> {
  if (input.received_amount !== null && (!Number.isFinite(input.received_amount) || input.received_amount < 0 || input.received_amount > 1e9)) {
    return 'Please enter the amount received. 請輸入實收金額。';
  }
  const { error } = await supabase
    .from('ib_rebate_statements')
    .update({ ...input, reference: input.reference.trim().slice(0, 120), received_on: input.received_amount === null ? null : input.received_on })
    .eq('id', id);
  return error ? FALLBACK : null;
}

export async function deleteStatement(id: string): Promise<string | null> {
  const { error } = await supabase.from('ib_rebate_statements').delete().eq('id', id);
  return error ? 'Only full admins can delete. 只有全權管理員可刪除。' : null;
}
