import { supabase } from '@/lib/supabase';

export type IbStage = 'prospect' | 'submitted' | 'review' | 'negotiating' | 'approved' | 'rejected';

export interface IbBroker {
  id: string;
  broker_name: string;
  website: string;
  regulation: string;
  region: string;
  contact_name: string;
  contact_email: string;
  stage: IbStage;
  application_ref: string;
  submitted_at: string | null;
  approved_at: string | null;
  next_follow_up: string | null;
  documents: Record<string, boolean>;
  rebate_type: string;
  rebate_per_lot: number | null;
  payout_cycle: string;
  rebate_terms: string;
  ib_code: string;
  portal_url: string;
  portal_login: string;
  manager_name: string;
  manager_title: string;
  manager_email: string;
  manager_phone: string;
  manager_messenger: string;
  manager_timezone: string;
  notes: string;
  created_at: string;
  updated_at: string;
  link_count: number;
}

export interface IbLink {
  id: string;
  broker_id: string;
  label: string;
  url: string;
  account_type: string;
  region: string;
  active: boolean;
  created_at: string;
}

export interface IbEvent {
  id: string;
  broker_id: string;
  kind: 'note' | 'stage' | 'follow_up' | 'created' | 'reveal' | 'document';
  body: string;
  actor_email: string;
  created_at: string;
}

export type BrokerPatch = Partial<Omit<IbBroker, 'id' | 'created_at' | 'updated_at' | 'link_count'>>;

export const STAGES: { key: IbStage; label: string; hint: string; tone: string; dot: string }[] = [
  { key: 'prospect', label: 'Prospect 物色', hint: 'Researching the broker 準備資料', tone: 'text-slate-300 bg-slate-700/40 border-slate-600', dot: 'bg-slate-400' },
  { key: 'submitted', label: 'Submitted 已提交', hint: 'Application sent 已遞交申請', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30', dot: 'bg-sky-400' },
  { key: 'review', label: 'Under review 審核中', hint: 'Broker is checking 對方審核', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' },
  { key: 'negotiating', label: 'Negotiating 商討條款', hint: 'Rebate & terms 回傭條款', tone: 'text-orange-300 bg-orange-500/10 border-orange-500/30', dot: 'bg-orange-400' },
  { key: 'approved', label: 'Approved 已開通', hint: 'IB account live 代理已開通', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  { key: 'rejected', label: 'Rejected / Paused 拒絕或暫停', hint: 'Not proceeding 暫不進行', tone: 'text-red-300 bg-red-500/10 border-red-500/30', dot: 'bg-red-400' },
];

export const stageMeta = (s: IbStage) => STAGES.find((x) => x.key === s) ?? STAGES[0];

export const DOCUMENTS: { key: string; label: string }[] = [
  { key: 'id_document', label: 'ID card / passport 身份證或護照' },
  { key: 'selfie_with_id', label: 'Selfie holding ID 手持證件自拍' },
  { key: 'address_proof', label: 'Proof of address 個人地址證明' },
  { key: 'bank_details', label: 'Personal bank details for rebates 個人收傭銀行資料' },
  { key: 'aml_form', label: 'AML / KYC questionnaire 反洗錢問卷' },
  { key: 'marketing_plan', label: 'Marketing plan / client source 推廣計劃' },
  { key: 'ib_agreement', label: 'Signed IB agreement 已簽代理協議' },
];

export const REBATE_TYPES = ['Per lot 每手回佣', 'Spread share 點差分成', 'Tiered 分級回傭', 'CPA 每位客戶獎金', 'Hybrid 混合'];
export const PAYOUT_CYCLES = ['Daily 每日', 'Weekly 每週', 'Monthly 每月'];

const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';

export function needsFollowUp(b: IbBroker): boolean {
  if (b.stage === 'approved' || b.stage === 'rejected' || !b.next_follow_up) return false;
  return b.next_follow_up <= new Date().toISOString().slice(0, 10);
}

export function followUpWindow(b: IbBroker): 'overdue' | 'today' | 'soon' | null {
  if (b.stage === 'approved' || b.stage === 'rejected' || !b.next_follow_up) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (b.next_follow_up < today) return 'overdue';
  if (b.next_follow_up === today) return 'today';
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  return b.next_follow_up <= soon ? 'soon' : null;
}

export async function countDueFollowUps(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('ib_brokers')
    .select('id', { count: 'exact', head: true })
    .not('stage', 'in', '(approved,rejected)')
    .lte('next_follow_up', today);
  return error ? 0 : count ?? 0;
}

export async function logFollowUp(b: IbBroker, days: number, note: string): Promise<string | null> {
  const next = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const err = await updateBroker(b.id, { next_follow_up: next });
  if (err) return err;
  const text = `Followed up 已跟進${note.trim() ? `: ${note.trim()}` : ''} · next 下次 ${next}`;
  return addEvent(b.id, 'follow_up', text.slice(0, 2000));
}

export function daysSince(ts: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000));
}

export function approvalGaps(b: IbBroker, links: IbLink[]): string[] {
  const gaps: string[] = [];
  if (!links.some((l) => l.active)) gaps.push('at least one active referral link 最少一條代理連結');
  if (!b.portal_url.trim() || !b.portal_login.trim()) gaps.push('backend portal address and login 代理後台網址及帳號');
  return gaps;
}

type Row = Omit<IbBroker, 'link_count'> & { ib_links?: { count: number }[] };

export async function fetchBrokers(): Promise<{ brokers: IbBroker[]; error: string | null }> {
  const { data, error } = await supabase.from('ib_brokers').select('*, ib_links(count)').order('updated_at', { ascending: false });
  if (error || !Array.isArray(data)) return { brokers: [], error: 'Could not load brokers. 未能載入經紀商資料。' };
  const brokers = (data as Row[]).map(({ ib_links, ...b }) => ({ ...b, documents: b.documents ?? {}, link_count: ib_links?.[0]?.count ?? 0 }));
  return { brokers, error: null };
}

export async function addEvent(brokerId: string, kind: IbEvent['kind'], body: string): Promise<string | null> {
  const { error } = await supabase.from('ib_events').insert({ broker_id: brokerId, kind, body });
  return error ? FALLBACK : null;
}

export async function createBroker(fields: BrokerPatch & { broker_name: string }): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.from('ib_brokers').insert(fields).select('id').maybeSingle();
  if (error || !data) return { id: null, error: FALLBACK };
  await addEvent(data.id, 'created', `Application file opened 建立申請檔案: ${fields.broker_name}`);
  return { id: data.id, error: null };
}

export async function updateBroker(id: string, patch: BrokerPatch): Promise<string | null> {
  const { error } = await supabase.from('ib_brokers').update(patch).eq('id', id);
  return error ? FALLBACK : null;
}

export async function changeStage(b: IbBroker, stage: IbStage, note: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const patch: BrokerPatch = { stage };
  if (stage === 'submitted' && !b.submitted_at) patch.submitted_at = today;
  if (stage === 'approved') patch.approved_at = b.approved_at ?? today;
  const err = await updateBroker(b.id, patch);
  if (err) return err;
  const text = `${stageMeta(b.stage).label} → ${stageMeta(stage).label}${note.trim() ? ` · ${note.trim()}` : ''}`;
  return addEvent(b.id, 'stage', text);
}

export async function deleteBroker(id: string): Promise<string | null> {
  const { data: docs } = await supabase.from('ib_documents').select('storage_path').eq('broker_id', id);
  const { error } = await supabase.from('ib_brokers').delete().eq('id', id);
  if (!error && Array.isArray(docs) && docs.length) {
    await supabase.storage.from('ib-documents').remove(docs.map((d) => d.storage_path as string));
  }
  return error ? 'Only full admins can delete. 只有全權管理員可刪除。' : null;
}

export async function fetchLinks(brokerId: string): Promise<{ links: IbLink[]; error: string | null }> {
  const { data, error } = await supabase.from('ib_links').select('*').eq('broker_id', brokerId).order('created_at');
  if (error || !Array.isArray(data)) return { links: [], error: 'Could not load links. 未能載入連結。' };
  return { links: data as IbLink[], error: null };
}

export async function addLink(link: Omit<IbLink, 'id' | 'created_at' | 'active'>): Promise<string | null> {
  if (!/^https?:\/\/\S+$/i.test(link.url.trim())) return 'Link must start with http:// or https:// 連結需以 http:// 或 https:// 開頭。';
  const { error } = await supabase.from('ib_links').insert({ ...link, url: link.url.trim() });
  return error ? FALLBACK : null;
}

export async function setLinkActive(id: string, active: boolean): Promise<string | null> {
  const { error } = await supabase.from('ib_links').update({ active }).eq('id', id);
  return error ? FALLBACK : null;
}

export async function deleteLink(id: string): Promise<string | null> {
  const { error } = await supabase.from('ib_links').delete().eq('id', id);
  return error ? FALLBACK : null;
}

export async function revealPortalPassword(brokerId: string): Promise<{ password: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ib_reveal_portal_password', { p_broker: brokerId });
  if (error) return { password: null, error: FALLBACK };
  return { password: typeof data === 'string' ? data : null, error: null };
}

export async function savePortalPassword(brokerId: string, password: string): Promise<string | null> {
  if (!password || password.length > 128) return 'Password must be 1 to 128 characters. 密碼需為 1 至 128 個字元。';
  const { error } = await supabase.rpc('ib_set_portal_password', { p_broker: brokerId, p_password: password });
  return error ? FALLBACK : null;
}

export async function fetchEvents(brokerId: string): Promise<{ events: IbEvent[]; error: string | null }> {
  const { data, error } = await supabase.from('ib_events').select('id, broker_id, kind, body, actor_email, created_at').eq('broker_id', brokerId).order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return { events: [], error: 'Could not load the timeline. 未能載入時間線。' };
  return { events: data as IbEvent[], error: null };
}
