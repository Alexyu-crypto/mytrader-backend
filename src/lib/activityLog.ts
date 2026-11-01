import { supabase } from '@/lib/supabase';

export type ActivityAction = 'sign_in' | 'sign_out' | 'sign_up' | 'password_changed' | 'page_view' | 'view_report' | 'export' | 'close_position' | 'close_all_positions' | 'desk_order' | 'desk_modify';
export type ActivityCategory = 'auth' | 'navigation' | 'report' | 'history' | 'copy_requests' | 'positions';

export interface ActivityEntry {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  category: string;
  target: string | null;
  changes: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export function logActivity(action: ActivityAction, category: ActivityCategory, target?: string, meta?: Record<string, unknown>) {
  return supabase
    .rpc('log_activity', { p_action: action, p_category: category, p_target: target ?? null, p_meta: meta ?? null })
    .then(({ error }) => {
      if (error) console.error('activity log failed', error);
    });
}

export const CATEGORY_LABEL: Record<string, string> = {
  auth: 'Sign-in 登入',
  navigation: 'Pages 瀏覽',
  report: 'Reports 報告',
  history: 'History 記錄',
  positions: 'Positions 持倉',
  accounts: 'Accounts 帳戶',
  copy_settings: 'Copy settings 跟單設定',
  app_settings: 'Global settings 全局設定',
  app_members: 'Users 用戶',
  client_accounts: 'Linked accounts 連結帳戶',
  copy_requests: 'Applications 跟單申請',
  agents: 'Agents 代理商',
  agent_applications: 'Agent applications 代理商申請',
};

export const ACTION_META: Record<string, { label: string; tone: string }> = {
  insert: { label: 'Created 新增', tone: 'bg-emerald-500/15 text-emerald-300' },
  update: { label: 'Changed 修改', tone: 'bg-sky-500/15 text-sky-300' },
  delete: { label: 'Deleted 刪除', tone: 'bg-red-500/15 text-red-300' },
  sign_in: { label: 'Signed in 登入', tone: 'bg-cyan-500/15 text-cyan-300' },
  sign_out: { label: 'Signed out 登出', tone: 'bg-slate-600/40 text-slate-300' },
  sign_up: { label: 'Signed up 註冊', tone: 'bg-emerald-500/15 text-emerald-300' },
  password_changed: { label: 'Password changed 改密碼', tone: 'bg-amber-500/15 text-amber-300' },
  page_view: { label: 'Viewed page 瀏覽', tone: 'bg-slate-600/40 text-slate-300' },
  view_report: { label: 'Viewed report 看報告', tone: 'bg-slate-600/40 text-slate-300' },
  export: { label: 'Exported 匯出', tone: 'bg-amber-500/15 text-amber-300' },
  close_position: { label: 'Close order 平倉', tone: 'bg-red-500/15 text-red-300' },
  close_all_positions: { label: 'Close all orders 全部平倉', tone: 'bg-red-500/15 text-red-300' },
  desk_order: { label: 'Desk order 交易台落單', tone: 'bg-cyan-500/15 text-cyan-300' },
  desk_modify: { label: 'Modify SL/TP 改止損止賺', tone: 'bg-amber-500/15 text-amber-300' },
  user_created: { label: 'User created 建立用戶', tone: 'bg-emerald-500/15 text-emerald-300' },
  user_deleted: { label: 'User deleted 刪除用戶', tone: 'bg-red-500/15 text-red-300' },
  password_reset: { label: 'Password reset 重設密碼', tone: 'bg-amber-500/15 text-amber-300' },
};

export const PAGE_SIZE = 200;

export interface ActivityQuery {
  actorId: string;
  category: string;
  sinceDays: number;
  hideViews: boolean;
  before?: string;
}

export async function fetchActivity(q: ActivityQuery): Promise<{ rows: ActivityEntry[]; error: string | null }> {
  let query = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE);
  if (q.actorId) query = query.eq('actor_id', q.actorId);
  if (q.category) query = query.eq('category', q.category);
  if (q.hideViews) query = query.not('action', 'in', '(page_view,view_report)');
  if (q.sinceDays > 0) query = query.gte('created_at', new Date(Date.now() - q.sinceDays * 86400000).toISOString());
  if (q.before) query = query.lt('created_at', q.before);
  const { data, error } = await query;
  if (error || !data) return { rows: [], error: 'Could not load the activity log. 未能載入操作記錄。' };
  return { rows: data as ActivityEntry[], error: null };
}

export function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
