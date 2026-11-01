import { supabase } from '@/lib/supabase';

export type CopyStatus = 'pending' | 'contacted' | 'approved' | 'rejected' | 'cancelled';

export interface CopyRequest {
  id: string;
  user_id: string;
  email: string;
  master_account: string;
  contact_name: string;
  contact: string;
  platform: 'MT4' | 'MT5';
  broker: string;
  account_number: string;
  capital: number | null;
  message: string;
  status: CopyStatus;
  admin_note: string;
  handled_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CopyRequestInput = Pick<
  CopyRequest,
  'master_account' | 'contact_name' | 'contact' | 'platform' | 'broker' | 'account_number' | 'capital' | 'message'
>;

export const STATUS_META: Record<CopyStatus, { label: string; tone: string; dot: string }> = {
  pending: { label: 'New 新申請', tone: 'bg-amber-400/10 text-amber-300 ring-amber-400/30', dot: 'bg-amber-400' },
  contacted: { label: 'Contacted 已聯絡', tone: 'bg-sky-400/10 text-sky-300 ring-sky-400/30', dot: 'bg-sky-400' },
  approved: { label: 'Approved 已批准', tone: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30', dot: 'bg-emerald-400' },
  rejected: { label: 'Rejected 已拒絕', tone: 'bg-red-400/10 text-red-300 ring-red-400/30', dot: 'bg-red-400' },
  cancelled: { label: 'Cancelled 已取消', tone: 'bg-slate-500/10 text-slate-400 ring-slate-500/30', dot: 'bg-slate-500' },
};

export const STATUS_ORDER: CopyStatus[] = ['pending', 'contacted', 'approved', 'rejected', 'cancelled'];

export const isOpen = (s: CopyStatus) => s === 'pending' || s === 'contacted';

const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';

function friendly(error: { code?: string; message?: string }): string {
  if (error.code === '23505') return 'You already have an open application for this signal. 您已有此信號的申請在處理中。';
  if (error.message?.includes('unknown_master')) return 'This signal is no longer available. 此信號已不存在。';
  if (error.message?.includes('not_cancellable')) return 'This application can no longer be cancelled. 此申請已無法取消。';
  if (error.code === '23514') return 'Please check the details you entered. 請檢查輸入資料。';
  return FALLBACK;
}

export async function fetchCopyRequests(): Promise<{ requests: CopyRequest[]; error: string | null }> {
  const { data, error } = await supabase.from('copy_requests').select('*').order('created_at', { ascending: false });
  if (error || !data) return { requests: [], error: 'Could not load applications. 未能載入申請。' };
  return { requests: data as CopyRequest[], error: null };
}

export async function submitCopyRequest(input: CopyRequestInput): Promise<string | null> {
  const { error } = await supabase.from('copy_requests').insert(input);
  return error ? friendly(error) : null;
}

export async function cancelCopyRequest(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_copy_request', { p_id: id });
  return error ? friendly(error) : null;
}

export async function updateCopyRequest(id: string, patch: Partial<Pick<CopyRequest, 'status' | 'admin_note'>>): Promise<string | null> {
  const { error } = await supabase.from('copy_requests').update(patch).eq('id', id);
  return error ? friendly(error) : null;
}

export async function agentHandleCopyRequest(id: string, status: CopyStatus, note: string): Promise<string | null> {
  const { error } = await supabase.rpc('agent_handle_copy_request', { p_id: id, p_status: status, p_note: note });
  return error ? friendly(error) : null;
}

export async function deleteCopyRequest(id: string): Promise<string | null> {
  const { error } = await supabase.from('copy_requests').delete().eq('id', id);
  return error ? friendly(error) : null;
}
