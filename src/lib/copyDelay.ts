import { supabase } from '@/lib/supabase';

export type CopyLink = {
  copy_id: string;
  follower_account: string;
  follower_ticket: number;
  master_account: string;
  master_ticket: number;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
};

export const tradeKey = (account: string, ticket: number) => `${account}|${ticket}`;

export const diffMs = (follower: string | null, master: string | null) =>
  follower && master ? new Date(follower).getTime() - new Date(master).getTime() : null;

const LATE_THRESHOLD_MS = 2000;

// Broker times are often whole seconds, so prefer the server's millisecond timestamps for when the
// master action was detected and the follower confirmed. Fall back to the broker's master time only
// when detection lagged far behind it (e.g. a copy resumed late), so lateness is not hidden.
export function serverDelayMs(detectedAt: string | null, confirmedAt: string | null, masterBrokerTime: string | null): number | null {
  if (!detectedAt || !confirmedAt) return null;
  const detected = new Date(detectedAt).getTime();
  const masterTime = masterBrokerTime ? new Date(masterBrokerTime).getTime() : null;
  const base = masterTime !== null && detected - masterTime > LATE_THRESHOLD_MS ? masterTime : detected;
  return new Date(confirmedAt).getTime() - base;
}

export async function fetchCopyLinks(status?: 'open'): Promise<CopyLink[]> {
  let query = supabase
    .from('copy_trades')
    .select('copy_id, follower_account, follower_ticket, master_account, master_ticket, created_at, opened_at, closed_at')
    .not('follower_ticket', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as CopyLink[];
}

export type CloseSignal = { copy_id: string; follower_account: string; close_ticket: number | null; status: string; created_at: string };

export async function fetchCloseSignals(): Promise<CloseSignal[]> {
  const { data, error } = await supabase
    .from('copy_signals')
    .select('copy_id, follower_account, close_ticket, status, created_at')
    .eq('action', 'close')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error || !data) return [];
  return data as CloseSignal[];
}
