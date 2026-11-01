import { supabase } from '@/lib/supabase';

export interface LinkedAccounts {
  own: string[];
  signals: string[];
}

const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';

export async function fetchMyLinkedAccounts(): Promise<{ linked: LinkedAccounts; error: string | null }> {
  const { data, error } = await supabase.rpc('my_linked_accounts');
  if (error || !Array.isArray(data)) return { linked: { own: [], signals: [] }, error: 'Could not load your accounts. 未能載入您的帳戶。' };
  const rows = data as { account_name: string; relation: string }[];
  return {
    linked: {
      own: [...new Set(rows.filter((r) => r.relation === 'own' || r.relation === 'client').map((r) => r.account_name))],
      signals: rows.filter((r) => r.relation === 'signal').map((r) => r.account_name),
    },
    error: null,
  };
}

export async function fetchClientAccounts(userId: string): Promise<{ names: string[]; error: string | null }> {
  const { data, error } = await supabase.from('client_accounts').select('account_name').eq('user_id', userId);
  if (error || !data) return { names: [], error: 'Could not load linked accounts. 未能載入已連結帳戶。' };
  return { names: data.map((r) => r.account_name as string), error: null };
}

export async function saveClientAccounts(userId: string, before: string[], after: string[]): Promise<string | null> {
  const added = after.filter((n) => !before.includes(n));
  const removed = before.filter((n) => !after.includes(n));
  if (added.length) {
    const { error } = await supabase.from('client_accounts').insert(added.map((account_name) => ({ user_id: userId, account_name })));
    if (error) return FALLBACK;
  }
  if (removed.length) {
    const { error } = await supabase.from('client_accounts').delete().eq('user_id', userId).in('account_name', removed);
    if (error) return FALLBACK;
  }
  return null;
}
