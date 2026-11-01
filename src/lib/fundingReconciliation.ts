import { supabase } from '@/lib/supabase';
import type { FundingRequest, FundingRequestStatus, FundingRequestType } from '@/lib/types';

export async function fetchFundingRequests(): Promise<FundingRequest[]> {
  const { data, error } = await supabase
    .from('funding_requests')
    .select('*')
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FundingRequest[];
}

export interface CreateFundingRequest {
  account_name: string;
  request_type: FundingRequestType;
  amount: number;
  currency?: string;
  reference_code?: string;
  requested_at?: string;
  notes?: string;
}

export async function createFundingRequest(req: CreateFundingRequest): Promise<FundingRequest> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from('funding_requests')
    .insert({
      account_name: req.account_name,
      request_type: req.request_type,
      amount: req.amount,
      currency: req.currency || 'USDT',
      reference_code: req.reference_code || '',
      requested_at: req.requested_at || new Date().toISOString(),
      notes: req.notes || '',
      created_by_email: session?.user?.email ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FundingRequest;
}

export async function updateFundingRequest(
  id: string,
  updates: Partial<Pick<FundingRequest, 'account_name' | 'request_type' | 'amount' | 'currency' | 'reference_code' | 'status' | 'confirmed_at' | 'notes' | 'requested_at'>>,
): Promise<void> {
  const { error } = await supabase
    .from('funding_requests')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function confirmFundingRequest(id: string): Promise<void> {
  await updateFundingRequest(id, { status: 'confirmed', confirmed_at: new Date().toISOString() });
}

export async function rejectFundingRequest(id: string): Promise<void> {
  await updateFundingRequest(id, { status: 'rejected' });
}

export async function reopenFundingRequest(id: string): Promise<void> {
  await updateFundingRequest(id, { status: 'pending', confirmed_at: null });
}

export async function deleteFundingRequest(id: string): Promise<void> {
  const { error } = await supabase.from('funding_requests').delete().eq('id', id);
  if (error) throw error;
}

export function statusLabel(s: FundingRequestStatus): string {
  return { pending: 'Pending 待處理', confirmed: 'Confirmed 已到帳', rejected: 'Rejected 已拒絕' }[s];
}

export function statusBadge(s: FundingRequestStatus): string {
  return {
    pending: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    confirmed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    rejected: 'border-red-500/40 bg-red-500/10 text-red-300',
  }[s];
}
