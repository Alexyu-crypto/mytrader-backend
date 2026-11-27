import { supabase } from '@/lib/supabase';

export interface Plan {
  name: string;
  zh: string;
  audience: string;
  price: number;
  period: string;
  features: string[];
  highlight: boolean;
}

export interface MembershipPage {
  enabled: boolean;
  title: string;
  subtitle: string;
  join_note: string;
  plans: Plan[];
}

export const MAX_PLANS = 6;
export const MAX_FEATURES = 12;

export const DEFAULT_PAGE: MembershipPage = {
  enabled: true,
  title: '請現在加入 · Join now',
  subtitle: 'Priced per signal, per month, in USD (USDT). Pick the plan that fits how you trade. 按每個信號每月收費，以美元 (USDT) 計算。',
  join_note:
    'Choose a signal on the Signals page and send a copy application. Our team will contact you to confirm your plan and payment. 在「交易信號」頁選擇信號並提交跟單申請，我們會聯絡您確認計劃及付款。',
  plans: [
    {
      name: 'Advanced',
      zh: '高級計劃',
      audience: '適用具 API / EA / MT 帳戶經驗的資深使用者 · For experienced API, EA and MT users',
      price: 25,
      period: 'USD (USDT) / signal / month',
      features: ['專用 EA API · Dedicated EA API', '7/24 SIGNAL 低延遲信號源 · 24/7 low-latency signal source', 'Live Positions', 'History'],
      highlight: false,
    },
    {
      name: 'Starter',
      zh: '初級使用者',
      audience: '一般人均可無痛使用 · Easy for anyone, no setup skills needed',
      price: 50,
      period: 'USD (USDT) / signal / month',
      features: ['專用 EA API 安裝 · Dedicated EA API installed for you', 'VPS 7/24 連接 · 24/7 VPS connection', '7/24 SIGNAL 低延遲 · 24/7 low-latency signals', 'Live Positions', 'History'],
      highlight: true,
    },
  ],
};

const ERRORS: Record<string, string> = {
  not_allowed: 'Only an active agent can edit this page. 只有啟用中的代理商可編輯此頁。',
  text_too_long: 'Some text is too long. Please shorten it. 部分文字太長，請縮短。',
  invalid_plans: 'The plans could not be read. Please try again. 無法讀取計劃，請再試。',
  too_many_plans: `You can have up to ${MAX_PLANS} plans. 最多 ${MAX_PLANS} 個計劃。`,
  no_plans: 'Add at least one plan before showing the page. 請先新增至少一個計劃。',
  invalid_plan_name: 'Every plan needs an English name (max 40 characters). 每個計劃都需要英文名稱（最多 40 字元）。',
  invalid_price: 'Price must be a number between 0 and 100000, up to 2 decimals. 價錢須為 0 至 100000 的數字，最多兩位小數。',
  too_many_features: `Each plan can list up to ${MAX_FEATURES} features. 每個計劃最多 ${MAX_FEATURES} 項功能。`,
};

function isPlan(v: unknown): v is Plan {
  const p = v as Plan;
  return !!p && typeof p.name === 'string' && typeof p.price === 'number' && Array.isArray(p.features);
}

export async function fetchAgentMembershipPage(): Promise<{ page: MembershipPage | null; error: string | null }> {
  const { data, error } = await supabase.from('agent_membership_pages').select('enabled, title, subtitle, join_note, plans').maybeSingle();
  if (error) return { page: null, error: 'Could not load the membership page. 未能載入會員收費頁。' };
  if (!data) return { page: null, error: null };
  const plans = Array.isArray(data.plans) ? data.plans.filter(isPlan) : [];
  return { page: { ...(data as Omit<MembershipPage, 'plans'>), plans }, error: null };
}

export async function fetchPublicMembershipPage(slug: string | null): Promise<{ page: MembershipPage; error: string | null }> {
  if (!slug) return { page: DEFAULT_PAGE, error: null };
  const { data, error } = await supabase.rpc('agent_public_membership', { p_slug: slug });
  if (error || !Array.isArray(data)) return { page: DEFAULT_PAGE, error: 'Could not load the membership plans. 未能載入會員計劃。' };
  const row = data[0] as Omit<MembershipPage, 'enabled'> | undefined;
  const plans = row && Array.isArray(row.plans) ? row.plans.filter(isPlan) : [];
  if (!row || plans.length === 0) return { page: DEFAULT_PAGE, error: null };
  return { page: { ...row, enabled: true, plans }, error: null };
}

export function planUrl(index: number, agentSlug: string | null): string {
  return `${window.location.origin}${agentSlug ? `/a/${agentSlug}` : ''}/plan/${index + 1}`;
}

export async function saveAgentMembershipPage(page: MembershipPage): Promise<string | null> {
  const { error } = await supabase.rpc('save_agent_membership_page', {
    p_enabled: page.enabled,
    p_title: page.title,
    p_subtitle: page.subtitle,
    p_join_note: page.join_note,
    p_plans: page.plans.map((p) => ({ ...p, price: String(p.price) })),
  });
  if (!error) return null;
  const key = Object.keys(ERRORS).find((k) => error.message?.includes(k));
  return key ? ERRORS[key] : 'Could not save. Please try again. 未能儲存，請再試。';
}
