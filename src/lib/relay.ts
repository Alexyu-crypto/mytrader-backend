import { supabase } from '@/lib/supabase';
import type { CopySettings } from '@/lib/types';

export type RelayEngine = 'metaapi' | 'ea' | 'cloud_relay';
export type BackfillDays = 30 | 90;

export interface RelayGroup {
  id: string;
  name: string;
  engine: RelayEngine;
  backfill_days: BackfillDays;
}

export interface RelayMember {
  id: string;
  group_id: string;
  slot: number;
  role: 'master' | 'follower';
  account_name: string | null;
  broker: string;
  enabled: boolean;
  mode: CopySettings['mode'];
  lot_multiplier: number;
  fixed_lot: number;
  min_lot: number;
  max_lot: number;
  reverse: boolean;
  copy_pending_orders: boolean;
  copy_sl: boolean;
  copy_tp: boolean;
  max_open_trades: number;
  allowed_symbols: string[];
  blocked_symbols: string[];
  symbol_map: Record<string, string>;
  strip_suffix: string;
  add_prefix: string;
  add_suffix: string;
}

export interface ContractSize {
  id: string;
  member_id: string;
  master_symbol: string;
  master_contract_size: number;
  follower_contract_size: number;
}

export interface BackfillJob {
  id: string;
  days: BackfillDays;
  status: 'queued' | 'running' | 'done' | 'failed';
  rows_imported: number;
  requested_at: string;
  finished_at: string | null;
}

export interface RelayLogRow {
  id: string;
  master_account: string;
  follower_account: string;
  broker: string;
  symbol: string;
  master_ticket: number | null;
  master_opened_at: string;
  follower_received_at: string | null;
  delay_ms: number | null;
  status: 'pending' | 'copied' | 'missed' | 'failed';
  reason: string | null;
}

export const RELAY_TEST_GROUP = 'Copy Group - Relay Test';

export const ENGINE_OPTIONS: { key: RelayEngine; label: string }[] = [
  { key: 'metaapi', label: 'MetaAPI' },
  { key: 'ea', label: 'EA' },
  { key: 'cloud_relay', label: 'Cloud Relay' },
];

export function dataSourceLabel(engine: RelayEngine): { label: string; ready: boolean } {
  if (engine === 'metaapi') return { label: 'MetaAPI', ready: true };
  if (engine === 'ea') return { label: 'EA bridge · EA 橋接', ready: true };
  return { label: 'Relay Gateway', ready: false };
}

export function memberAsCopySettings(m: RelayMember, master: string): CopySettings {
  return { ...m, master_account: master, follower_account: m.account_name ?? '', created_at: '' };
}

export async function loadRelayGroup(name: string) {
  const g = await supabase.from('relay_groups').select('id, name, engine, backfill_days').eq('name', name).maybeSingle();
  if (g.error) return { error: true as const };
  if (!g.data) return { error: false as const, group: null };
  const group = g.data as RelayGroup;
  const [m, jobs, log] = await Promise.all([
    supabase.from('relay_group_members').select('*').eq('group_id', group.id).order('slot'),
    supabase.from('relay_backfill_jobs').select('id, days, status, rows_imported, requested_at, finished_at').eq('group_id', group.id).order('requested_at', { ascending: false }).limit(5),
    supabase.from('relay_copy_log').select('id, master_account, follower_account, broker, symbol, master_ticket, master_opened_at, follower_received_at, delay_ms, status, reason').eq('group_id', group.id).order('master_opened_at', { ascending: false }).limit(200),
  ]);
  if (m.error || jobs.error || log.error) return { error: true as const };
  const members = (m.data ?? []) as RelayMember[];
  const sizes = members.length
    ? await supabase.from('relay_contract_sizes').select('id, member_id, master_symbol, master_contract_size, follower_contract_size').in('member_id', members.map((x) => x.id)).order('master_symbol')
    : { data: [], error: null };
  if (sizes.error) return { error: true as const };
  return {
    error: false as const,
    group,
    members,
    sizes: (sizes.data ?? []) as ContractSize[],
    jobs: (jobs.data ?? []) as BackfillJob[],
    log: (log.data ?? []) as RelayLogRow[],
  };
}
