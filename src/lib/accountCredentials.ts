import { supabase } from '@/lib/supabase';

export const MAX_PASSWORD_LENGTH = 64;
export const MAX_IP_LENGTH = 64;

export interface AccountAccess {
  password: string;
  ip_address: string;
  detected_ip: string;
  detected_ip_at: string | null;
}

export interface LoginIp {
  ip: string;
  auto: boolean;
  checkedAt: string | null;
}

type IpFields = { ip_address: string | null; detected_ip: string | null; detected_ip_at: string | null };

export function resolveLoginIp(row: Partial<IpFields> | null | undefined): LoginIp | null {
  if (row?.ip_address) return { ip: row.ip_address, auto: false, checkedAt: null };
  if (row?.detected_ip) return { ip: row.detected_ip, auto: true, checkedAt: row.detected_ip_at ?? null };
  return null;
}

export async function fetchAccountAccess(accountId: string): Promise<AccountAccess & { error: boolean }> {
  const { data, error } = await supabase
    .from('account_credentials')
    .select('password, ip_address, detected_ip, detected_ip_at')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) {
    console.error('load account credentials failed', error);
    return { password: '', ip_address: '', detected_ip: '', detected_ip_at: null, error: true };
  }
  return {
    password: data?.password ?? '',
    ip_address: data?.ip_address ?? '',
    detected_ip: data?.detected_ip ?? '',
    detected_ip_at: data?.detected_ip_at ?? null,
    error: false,
  };
}

export async function saveAccountPasswords(entries: { account_id: string; password: string; ip_address?: string }[]): Promise<boolean> {
  const rows = entries.filter((e) => e.password || e.ip_address !== undefined);
  if (rows.length === 0) return true;
  const { error } = await supabase.from('account_credentials').upsert(
    rows.map((r) => ({
      account_id: r.account_id,
      ...(r.password ? { password: r.password } : {}),
      ...(r.ip_address !== undefined ? { ip_address: r.ip_address.trim() || null } : {}),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'account_id' },
  );
  if (error) console.error('save account credentials failed', error);
  return !error;
}

export async function fetchAccountIps(): Promise<Record<string, LoginIp> | null> {
  const { data, error } = await supabase
    .from('account_credentials')
    .select('account_id, ip_address, detected_ip, detected_ip_at')
    .or('ip_address.not.is.null,detected_ip.not.is.null');
  if (error) {
    console.error('load account IPs failed', error);
    return null;
  }
  const result: Record<string, LoginIp> = {};
  for (const row of data ?? []) {
    const ip = resolveLoginIp(row as IpFields);
    if (ip) result[row.account_id as string] = ip;
  }
  return result;
}

export function loginNumber(accountName: string): string {
  return accountName.split('-')[2] ?? '';
}
