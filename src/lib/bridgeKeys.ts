import { supabase } from '@/lib/supabase';

type KeyRow = { bridge_key: string } | { bridge_key: string }[] | null;

export async function fetchBridgeKey(accountName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('account_bridge_keys(bridge_key)')
    .eq('account_name', accountName)
    .maybeSingle();
  if (error) {
    console.error('bridge key fetch failed', error);
    return null;
  }
  const rel = (data as { account_bridge_keys: KeyRow } | null)?.account_bridge_keys ?? null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return typeof row?.bridge_key === 'string' && row.bridge_key.length >= 32 ? row.bridge_key : null;
}
