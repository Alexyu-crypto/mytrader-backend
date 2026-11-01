import { supabase } from '@/lib/supabase';
import type { Role } from '@/hooks/useAuth';

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  status: 'pending' | 'active';
  created_at: string;
  agent_id: string | null;
  allow_multi_login: boolean;
}

const MESSAGES: Record<string, string> = {
  last_admin: 'At least one full admin must remain. 最少要保留一位全權管理員。',
  user_exists: 'This email already has an account. 此電郵已有帳戶。',
  invalid_email: 'Please enter a valid email. 請輸入有效電郵。',
  weak_password: 'Password must be 6 to 72 characters. 密碼需為 6 至 72 個字元。',
  cannot_remove_self: 'You cannot remove your own account. 不能刪除自己的帳戶。',
  invalid_user: 'This user could not be found. 找不到此用戶。',
  forbidden: 'Only full admins can do this. 只有全權管理員可以操作。',
};
const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';

export async function fetchMembers(): Promise<{ members: Member[]; error: string | null }> {
  const { data, error } = await supabase
    .from('app_members')
    .select('user_id, email, role, status, created_at, agent_id, allow_multi_login')
    .order('created_at', { ascending: true });
  if (error || !Array.isArray(data)) return { members: [], error: FALLBACK };
  return { members: data as Member[], error: null };
}

export async function updateMember(userId: string, role: Role, status: 'pending' | 'active'): Promise<string | null> {
  const { error } = await supabase.rpc('admin_update_member', { p_user: userId, p_role: role, p_status: status });
  if (!error) return null;
  return error.message.includes('last_admin') ? MESSAGES.last_admin : FALLBACK;
}

export async function setMemberMultiLogin(userId: string, on: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('admin_set_multi_login', { p_user: userId, p_on: on });
  return error ? FALLBACK : null;
}

export async function callAdminUsers(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (!error && data?.ok) return null;
  let code = typeof data?.error === 'string' ? data.error : '';
  const ctx = (error as { context?: Response } | null)?.context;
  if (!code && ctx && typeof ctx.json === 'function') {
    const parsed = await ctx.json().catch(() => null);
    if (typeof parsed?.error === 'string') code = parsed.error;
  }
  return MESSAGES[code] ?? FALLBACK;
}
