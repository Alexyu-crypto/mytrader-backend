import { supabase } from '@/lib/supabase';

const MESSAGES: Record<string, string> = {
  token_missing: 'MetaApi key is not set up. 未設定 MetaApi 金鑰。',
  forbidden: 'Only admins and traders can manage MetaApi. 只有管理員同交易員可以操作。',
  not_found: 'Account not found or not a MetaApi account. 搵唔到此 MetaApi 帳戶。',
  missing_login: 'The account name has no MT login number. 帳戶名稱冇 MT 登入號碼。',
  missing_server: 'Set the broker server on this account first. 請先填寫券商伺服器。',
  missing_password: 'Save the MT password on this account first. 請先儲存 MT 密碼。',
  not_connected: 'Connect this account to MetaApi first. 請先連線此帳戶。',
  same_region: 'The account is already in that region. 帳戶已在該地區。',
  move_in_progress: 'A region switch is already in progress for this account. 此帳戶正在轉換地區。',
  bad_region: 'Your MetaApi plan does not include that region. 你的 MetaApi 方案不包括該地區。',
  regions_unavailable: 'Could not load regions from MetaApi. Please try again. 無法讀取 MetaApi 地區，請再試。',
};
const FALLBACK = 'MetaApi request failed. Please try again. MetaApi 操作失敗，請再試。';

async function call(body: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('metaapi', { body });
  if (!error && data?.ok) return { data, error: null };
  let parsed: Record<string, unknown> | null = data ?? null;
  const ctx = (error as { context?: Response } | null)?.context;
  if (!parsed?.error && ctx && typeof ctx.json === 'function') parsed = await ctx.json().catch(() => null);
  const code = typeof parsed?.error === 'string' ? parsed.error : '';
  if (code === 'metaapi_rejected' && typeof parsed?.message === 'string') return { data: null, error: `MetaApi: ${parsed.message}` };
  return { data: null, error: MESSAGES[code] ?? FALLBACK };
}

export async function syncMetaApi(): Promise<string | null> {
  return (await call({ action: 'sync' })).error;
}

export async function relayMetaApi(accounts: string[]): Promise<string | null> {
  return (await call({ action: 'relay', accounts })).error;
}

export interface MetaApiCloudAccount {
  id: string;
  name: string;
  login: string;
  server: string;
  platform: string;
  state: string;
  connection: string;
  linked_to: string | null;
}

export async function listMetaApiAccounts(): Promise<{ accounts: MetaApiCloudAccount[]; error: string | null }> {
  const { data, error } = await call({ action: 'list' });
  if (error || !Array.isArray(data?.accounts)) return { accounts: [], error: error ?? FALLBACK };
  return { accounts: data.accounts as MetaApiCloudAccount[], error: null };
}

export interface MetaApiBrokerServers {
  broker: string;
  servers: string[];
}

export async function searchMetaApiServers(query: string, platform: 'MT4' | 'MT5'): Promise<{ brokers: MetaApiBrokerServers[]; error: string | null }> {
  const { data, error } = await call({ action: 'servers', query, platform });
  if (error || !Array.isArray(data?.brokers)) return { brokers: [], error: error ?? FALLBACK };
  return { brokers: data.brokers as MetaApiBrokerServers[], error: null };
}

export async function suspendMetaApi(accountId: string): Promise<string | null> {
  return (await call({ action: 'suspend', account_id: accountId })).error;
}

export const METAAPI_REGIONS = [
  { id: 'london', label: '倫敦 · London', country: 'UK' },
  { id: 'new-york', label: '紐約 · New York', country: 'US' },
  { id: 'singapore', label: '新加坡 · Singapore', country: 'SG' },
  { id: 'vint-hill', label: '英國文特山 · Vint Hill', country: 'UK' },
] as const;

export async function fetchMetaApiRegions(): Promise<{ regions: string[]; error: string | null }> {
  const { data, error } = await call({ action: 'regions' });
  if (error || !Array.isArray(data?.regions)) return { regions: [], error: error ?? FALLBACK };
  return { regions: (data.regions as unknown[]).filter((r): r is string => typeof r === 'string'), error: null };
}

export function regionLabel(id: string | null | undefined): string {
  return METAAPI_REGIONS.find((r) => r.id === id)?.label ?? id ?? '—';
}

export async function moveMetaApiRegion(accountId: string, region: string): Promise<{ error: string | null; pending: boolean }> {
  const { data, error } = await call({ action: 'move_region', account_id: accountId, region });
  return { error, pending: data?.pending === true };
}

export async function connectMetaApi(accountId: string): Promise<{ error: string | null; pending: boolean }> {
  const { data, error } = await call({ action: 'connect', account_id: accountId });
  return { error, pending: data?.pending === true };
}
