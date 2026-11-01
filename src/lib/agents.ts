import { supabase } from '@/lib/supabase';

export interface Brand {
  slug: string;
  brand_name: string;
  tagline: string | null;
  brand_color: string;
  logo_path: string | null;
}

export interface PublicBrand extends Brand {
  signup_open: boolean;
}

export interface MyBrand extends Brand {
  is_owner: boolean;
}

export interface Agent extends Brand {
  id: string;
  user_id: string;
  contact: string | null;
  status: 'active' | 'suspended';
  perm_view_trades: boolean;
  perm_view_activity: boolean;
  perm_client_signup: boolean;
  perm_manage_clients: boolean;
  perm_install_terminals: boolean;
  client_approval: boolean;
  created_at: string;
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface AgentApplication {
  id: string;
  user_id: string;
  email: string;
  brand_name: string;
  desired_slug: string;
  contact_name: string;
  contact: string;
  region: string | null;
  expected_clients: number | null;
  message: string | null;
  status: ApplicationStatus;
  admin_note: string | null;
  created_at: string;
}

export interface AgentClient {
  user_id: string;
  email: string;
  status: string;
  joined_at: string;
  accounts: string[];
}

export interface AgentPermissions {
  viewTrades: boolean;
  viewActivity: boolean;
  clientSignup: boolean;
  manageClients: boolean;
  installTerminals: boolean;
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';
const MESSAGES: Record<string, string> = {
  slug_taken: 'That link name is already taken. 此連結名稱已被使用。',
  not_pending: 'This application was already handled. 此申請已處理。',
  is_admin: 'Full admins cannot become agents. 全權管理員不能成為代理商。',
  already_agent: 'You are already an agent. 您已是代理商。',
  '23505': 'You already have an application under review. 您已有申請正在審核。',
  '23514': 'Please check the form. The link name must be 3-30 lowercase letters, numbers or dashes. 請檢查表格，連結名稱需為 3-30 個小寫字母、數字或「-」。',
};

function friendly(error: { message?: string; code?: string }): string {
  console.error('agent request failed', error);
  const key = Object.keys(MESSAGES).find((k) => error.code === k || error.message?.includes(k));
  return key ? MESSAGES[key] : FALLBACK;
}

export function normalizeSlug(raw: string): string {
  return raw.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

export function brandLink(slug: string): string {
  return `${window.location.origin}/a/${slug}`;
}

export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('agent-logos').getPublicUrl(path).data.publicUrl;
}

export async function fetchPublicBrand(slug: string): Promise<{ brand: PublicBrand | null; error: string | null }> {
  const { data, error } = await supabase.rpc('agent_public_brand', { p_slug: slug });
  if (error || !Array.isArray(data)) return { brand: null, error: FALLBACK };
  return { brand: (data[0] as PublicBrand | undefined) ?? null, error: null };
}

export async function fetchMyBrand(): Promise<MyBrand | null> {
  const { data, error } = await supabase.rpc('my_brand');
  if (error || !Array.isArray(data)) return null;
  return (data[0] as MyBrand | undefined) ?? null;
}

export async function checkSlugAvailable(slug: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('agent_slug_available', { p_slug: slug });
  if (error || typeof data !== 'boolean') return null;
  return data;
}

export async function fetchMyApplications(userId: string): Promise<{ apps: AgentApplication[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_applications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return { apps: [], error: FALLBACK };
  return { apps: data as AgentApplication[], error: null };
}

export async function submitApplication(input: {
  brand_name: string;
  desired_slug: string;
  contact_name: string;
  contact: string;
  region: string;
  expected_clients: number | null;
  message: string;
}): Promise<string | null> {
  const { error } = await supabase.from('agent_applications').insert({
    ...input,
    region: input.region || null,
    message: input.message || null,
  });
  return error ? friendly(error) : null;
}

export async function cancelApplication(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_agent_application', { p_application: id });
  return error ? friendly(error) : null;
}

export async function fetchAllApplications(): Promise<{ apps: AgentApplication[]; error: string | null }> {
  const { data, error } = await supabase.from('agent_applications').select('*').order('created_at', { ascending: false }).limit(200);
  if (error || !data) return { apps: [], error: FALLBACK };
  return { apps: data as AgentApplication[], error: null };
}

export async function fetchAgents(): Promise<{ agents: Agent[]; error: string | null }> {
  const { data, error } = await supabase.from('agents').select('*').order('created_at', { ascending: true });
  if (error || !data) return { agents: [], error: FALLBACK };
  return { agents: data as Agent[], error: null };
}

export async function fetchOwnAgent(userId: string): Promise<{ agent: Agent | null; error: string | null }> {
  const { data, error } = await supabase.from('agents').select('*').eq('user_id', userId).maybeSingle();
  if (error) return { agent: null, error: FALLBACK };
  return { agent: data as Agent | null, error: null };
}

export async function approveApplication(id: string, slug: string, perms: AgentPermissions, note: string): Promise<string | null> {
  const { error } = await supabase.rpc('admin_approve_agent', {
    p_application: id,
    p_slug: slug,
    p_view_trades: perms.viewTrades,
    p_view_activity: perms.viewActivity,
    p_client_signup: perms.clientSignup,
    p_manage_clients: perms.manageClients,
    p_note: note,
    p_install_terminals: perms.installTerminals,
  });
  return error ? friendly(error) : null;
}

export async function rejectApplication(id: string, note: string): Promise<string | null> {
  const { error } = await supabase.rpc('admin_reject_agent_application', { p_application: id, p_note: note });
  return error ? friendly(error) : null;
}

export async function updateAgentSettings(agent: Agent, status: Agent['status'], perms: AgentPermissions): Promise<string | null> {
  const { error } = await supabase.rpc('admin_update_agent', {
    p_agent: agent.id,
    p_status: status,
    p_view_trades: perms.viewTrades,
    p_view_activity: perms.viewActivity,
    p_client_signup: perms.clientSignup,
    p_manage_clients: perms.manageClients,
    p_install_terminals: perms.installTerminals,
  });
  return error ? friendly(error) : null;
}

export async function setClientStatus(userId: string, status: 'active' | 'pending'): Promise<string | null> {
  const { error } = await supabase.rpc('agent_set_client_status', { p_user: userId, p_status: status });
  return error ? friendly(error) : null;
}

export async function setClientApproval(agentId: string, required: boolean): Promise<string | null> {
  const { error } = await supabase.from('agents').update({ client_approval: required }).eq('id', agentId);
  return error ? friendly(error) : null;
}

export async function setMemberAgent(userId: string, agentId: string | null): Promise<string | null> {
  const { error } = await supabase.rpc('admin_set_member_agent', { p_user: userId, p_agent: agentId });
  return error ? friendly(error) : null;
}

export async function fetchAgentClients(): Promise<{ clients: AgentClient[]; error: string | null }> {
  const { data, error } = await supabase.rpc('agent_clients');
  if (error || !Array.isArray(data)) return { clients: [], error: FALLBACK };
  return { clients: data as AgentClient[], error: null };
}

export async function saveBranding(agentId: string, fields: { brand_name: string; tagline: string; contact: string; brand_color: string }): Promise<string | null> {
  const { error } = await supabase
    .from('agents')
    .update({ ...fields, tagline: fields.tagline || null, contact: fields.contact || null })
    .eq('id', agentId);
  return error ? friendly(error) : null;
}

export async function uploadLogo(agent: Agent, file: File): Promise<{ path: string | null; error: string | null }> {
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { path: null, error: 'Please use a PNG, JPG or WEBP image. 請使用 PNG、JPG 或 WEBP 圖片。' };
  if (file.size > LOGO_MAX_BYTES) return { path: null, error: 'The logo must be 1 MB or smaller. LOGO 需為 1 MB 或以下。' };
  const path = `${agent.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('agent-logos').upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { path: null, error: friendly(upErr) };
  const { error } = await supabase.from('agents').update({ logo_path: path }).eq('id', agent.id);
  if (error) {
    await supabase.storage.from('agent-logos').remove([path]);
    return { path: null, error: friendly(error) };
  }
  if (agent.logo_path) await supabase.storage.from('agent-logos').remove([agent.logo_path]);
  return { path, error: null };
}

export async function removeLogo(agent: Agent): Promise<string | null> {
  const { error } = await supabase.from('agents').update({ logo_path: null }).eq('id', agent.id);
  if (error) return friendly(error);
  if (agent.logo_path) await supabase.storage.from('agent-logos').remove([agent.logo_path]);
  return null;
}
