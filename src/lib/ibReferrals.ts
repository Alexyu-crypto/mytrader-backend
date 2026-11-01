import { supabase } from '@/lib/supabase';

export type ReferralStatus = 'applied' | 'opened' | 'funded' | 'rejected';

export interface OpeningLink {
  id: string;
  label: string;
  url: string;
  account_type: string;
  region: string;
}

export interface OpeningBroker {
  id: string;
  broker_name: string;
  region: string;
  regulation: string;
  website: string;
  ib_code: string;
  links: OpeningLink[];
}

export interface Referral {
  id: string;
  broker_id: string;
  link_id: string | null;
  client_name: string;
  client_contact: string;
  account_number: string;
  account_type: string;
  status: ReferralStatus;
  opened_on: string | null;
  notes: string;
  created_email: string;
  created_at: string;
  updated_at: string;
}

export type ReferralInput = Pick<Referral, 'broker_id' | 'link_id' | 'client_name' | 'client_contact' | 'account_number' | 'account_type' | 'status' | 'opened_on' | 'notes'>;

export const REFERRAL_STATUSES: { key: ReferralStatus; label: string; tone: string; dot: string }[] = [
  { key: 'applied', label: 'Applied 已申請', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30', dot: 'bg-sky-400' },
  { key: 'opened', label: 'Opened 已開戶', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' },
  { key: 'funded', label: 'Funded 已入金', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  { key: 'rejected', label: 'Rejected 被拒', tone: 'text-red-300 bg-red-500/10 border-red-500/30', dot: 'bg-red-400' },
];

export const referralMeta = (s: ReferralStatus) => REFERRAL_STATUSES.find((x) => x.key === s) ?? REFERRAL_STATUSES[0];

const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';
const DUPLICATE = 'This account number is already registered for this broker. 此經紀商已登記此帳號。';

export async function fetchOpeningBrokers(): Promise<{ brokers: OpeningBroker[]; error: string | null }> {
  const { data, error } = await supabase.rpc('ib_opening_brokers');
  if (error || !Array.isArray(data)) return { brokers: [], error: 'Could not load brokers. 未能載入經紀商資料。' };
  const brokers = (data as OpeningBroker[]).map((b) => ({ ...b, links: Array.isArray(b.links) ? b.links : [] }));
  return { brokers, error: null };
}

export async function fetchReferrals(): Promise<{ referrals: Referral[]; error: string | null }> {
  const { data, error } = await supabase.from('ib_referrals').select('*').order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return { referrals: [], error: 'Could not load clients. 未能載入客戶記錄。' };
  return { referrals: data as Referral[], error: null };
}

function validate(input: ReferralInput): string | null {
  const name = input.client_name.trim();
  if (!input.broker_id) return 'Please choose a broker. 請選擇經紀商。';
  if (!name || name.length > 120) return 'Client name must be 1 to 120 characters. 客戶名稱需為 1 至 120 個字元。';
  if (input.account_number.trim().length > 40) return 'Account number is too long. 帳號過長。';
  if (input.client_contact.trim().length > 200 || input.account_type.trim().length > 60) return 'Contact or account type is too long. 聯絡方式或帳戶類型過長。';
  return null;
}

function clean(input: ReferralInput): ReferralInput {
  return {
    ...input,
    client_name: input.client_name.trim(),
    client_contact: input.client_contact.trim(),
    account_number: input.account_number.trim(),
    notes: input.notes.trim(),
    opened_on: input.opened_on || null,
    link_id: input.link_id || null,
  };
}

function mapError(code: string | undefined): string {
  return code === '23505' ? DUPLICATE : FALLBACK;
}

export async function createReferral(input: ReferralInput): Promise<string | null> {
  const invalid = validate(input);
  if (invalid) return invalid;
  const { error } = await supabase.from('ib_referrals').insert(clean(input));
  return error ? mapError(error.code) : null;
}

export async function updateReferral(id: string, input: ReferralInput): Promise<string | null> {
  const invalid = validate(input);
  if (invalid) return invalid;
  const { error } = await supabase.from('ib_referrals').update(clean(input)).eq('id', id);
  return error ? mapError(error.code) : null;
}

export async function setReferralStatus(r: Referral, status: ReferralStatus): Promise<string | null> {
  const patch: Partial<Referral> = { status };
  if ((status === 'opened' || status === 'funded') && !r.opened_on) patch.opened_on = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('ib_referrals').update(patch).eq('id', r.id);
  return error ? FALLBACK : null;
}

export async function deleteReferral(id: string): Promise<string | null> {
  const { error } = await supabase.from('ib_referrals').delete().eq('id', id);
  return error ? 'Only IB managers or admins can delete. 只有 IB 管理員或全權管理員可刪除。' : null;
}
