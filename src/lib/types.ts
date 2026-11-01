export type ArchiveStatus = 'active' | 'frozen' | 'removed_vm' | 'stopped';
export type ConnectionMethod = 'ea' | 'metaapi';

export interface Account {
  id: string;
  account_name: string;
  broker: string;
  broker_server: string | null;
  platform: 'MT4' | 'MT5';
  type: 'master' | 'follower';
  connection_method: ConnectionMethod;
  metaapi_account_id: string | null;
  metaapi_state?: string | null;
  metaapi_connection?: string | null;
  metaapi_region?: string | null;
  metaapi_zone?: string | null;
  metaapi_ip?: string | null;
  metaapi_moving_to?: string | null;
  metaapi_error?: string | null;
  metaapi_synced_at?: string | null;
  holder_name?: string | null;
  mt_holder_name?: string | null;
  mt_holder_at?: string | null;
  mt_trade_allowed?: boolean | null;
  balance: number;
  equity: number;
  is_active: boolean;
  report_public: boolean;
  frozen: boolean;
  archive_status: ArchiveStatus;
  frozen_reason: string | null;
  frozen_at: string | null;
  last_seen: string | null;
  created_at: string;
  broker_ping_ms?: number | null;
  cloud_rtt_ms?: number | null;
  latency_at?: string | null;
  reconnect_requested_at?: string | null;
  reconnect_picked_at?: string | null;
  reconnect_done_at?: string | null;
}

export interface AccountSnapshot {
  id: string;
  account_name: string;
  snapshot_date: string;
  balance: number;
  equity: number;
  total_deposits: number;
  total_withdrawals: number;
  total_credit: number;
  open_positions: number;
  floating_pl: number;
  closed_trades: number;
  closed_profit: number;
  last_seen: string | null;
  connected: boolean;
  updated_at: string;
}

export interface LivePosition {
  id: string;
  account_name: string;
  ticket: number;
  symbol: string;
  order_type: string;
  lots: number;
  open_price: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  magic: number;
  open_time: string | null;
  updated_at: string;
}

export interface TradeHistory {
  id: string;
  account_name: string;
  ticket: number;
  symbol: string;
  order_type: string;
  lots: number;
  open_price: number;
  close_price: number;
  profit: number;
  commission: number;
  swap: number;
  open_time: string | null;
  close_time: string | null;
}

export interface BalanceOperation {
  id: string;
  account_name: string;
  ticket: number;
  op_type: 'deposit' | 'withdrawal' | 'credit';
  amount: number;
  comment: string;
  op_time: string;
  created_at: string;
}

export type FundingRequestStatus = 'pending' | 'confirmed' | 'rejected';
export type FundingRequestType = 'deposit' | 'withdrawal';

export interface FundingRequest {
  id: string;
  account_name: string;
  request_type: FundingRequestType;
  amount: number;
  currency: string;
  reference_code: string;
  status: FundingRequestStatus;
  requested_at: string;
  confirmed_at: string | null;
  notes: string;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CopySettings {
  id: string;
  master_account: string;
  follower_account: string;
  enabled: boolean;
  mode: 'multiplier' | 'fixed' | 'ratio';
  lot_multiplier: number;
  fixed_lot: number;
  max_lot: number;
  reverse: boolean;
  allowed_symbols: string[];
  blocked_symbols: string[];
  min_lot: number;
  copy_pending_orders: boolean;
  symbol_map: Record<string, string>;
  strip_suffix: string;
  add_prefix: string;
  add_suffix: string;
  copy_sl: boolean;
  copy_tp: boolean;
  max_open_trades: number;
  created_at: string;
}

export interface CopySignal {
  id: string;
  follower_account: string;
  master_account: string;
  master_ticket: number;
  symbol: string;
  order_type: string;
  lots: number;
  open_price: number;
  sl: number;
  tp: number;
  magic: number;
  status: 'pending' | 'processing' | 'executed' | 'failed' | 'cancelled';
  action: 'open' | 'close' | 'modify';
  copy_id: string;
  created_at: string;
  processed_at: string | null;
}

export interface CopyTrade {
  id: string;
  copy_id: string;
  master_account: string;
  master_ticket: number;
  follower_account: string;
  follower_ticket: number | null;
  symbol: string;
  order_type: string;
  lots: number;
  open_price: number;
  sl: number;
  tp: number;
  magic: number;
  status: 'pending_open' | 'open' | 'pending_close' | 'closed' | 'cancelled';
  cancel_reason: 'master_closed' | 'expired' | 'open_failed' | null;
  attempts: number;
  master_missing_since: string | null;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
}

export interface AppSettings {
  id: string;
  friday_close_enabled: boolean;
  friday_close_utc_hour: number;
  friday_close_safe_minutes: number;
  weekend_pause_enabled: boolean;
  crypto_symbols: string[];
  signal_max_age_sec: number;
  bridge_key_required: boolean;
  allow_multi_login: boolean;
  ip_whitelist_enabled: boolean;
  created_at: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: '',
  friday_close_enabled: true,
  friday_close_utc_hour: 21,
  friday_close_safe_minutes: 15,
  weekend_pause_enabled: true,
  crypto_symbols: ['BTCUSD', 'ETHUSD', 'BTCUSDT', 'ETHUSDT'],
  signal_max_age_sec: 300,
  bridge_key_required: false,
  allow_multi_login: true,
  ip_whitelist_enabled: false,
  created_at: '',
};
