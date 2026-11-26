import { supabase } from '@/lib/supabase';

export type AccountRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type RiskAction = 'stop_new' | 'close_all';

export const RISK_ACTION_LABELS: Record<RiskAction, { title: string; desc: string }> = {
  stop_new: { title: 'Stop new copies 停止開新跟單', desc: 'Keep existing positions 保留現有倉位' },
  close_all: { title: 'Stop & close all 停止跟單 即時平倉', desc: 'Close every open position now 立即平掉所有倉位' },
};

export interface AccountRequest {
  id: string;
  requested_by: string;
  for_user_id: string;
  holder_name: string;
  account_number: string;
  broker: string;
  broker_server: string | null;
  platform: 'MT4' | 'MT5';
  account_name: string;
  master_account: string;
  risk_stop_pct: number | null;
  risk_action: RiskAction | null;
  status: AccountRequestStatus;
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
}

export interface AccountRequestInput {
  holderName: string;
  accountNumber: string;
  broker: string;
  brokerServer: string;
  platform: 'MT4' | 'MT5';
  masterAccount: string;
  password: string;
  forUserId: string | null;
  riskPct: number | null;
  riskAction: RiskAction | null;
}

const COLUMNS = 'id, requested_by, for_user_id, holder_name, account_number, broker, broker_server, platform, account_name, master_account, risk_stop_pct, risk_action, status, review_note, reviewed_at, created_at';

const ERRORS: Record<string, string> = {
  not_allowed: 'Your role cannot add accounts. 您的角色不能新增帳戶。',
  not_your_client: 'You can only add accounts for your own clients (requires "Manage clients" permission). 只可替自己的客戶新增帳戶（需要「管理客戶」權限）。',
  invalid_holder: 'Holder name must contain English letters (A-Z). 持有人姓名須包含英文字母。',
  invalid_number: 'Account number must be 3-12 digits. 帳戶號碼須為 3-12 位數字。',
  invalid_broker: 'Broker must contain English letters or digits. 經紀商須包含英文或數字。',
  invalid_server: 'Broker server is too long. 伺服器名稱太長。',
  invalid_platform: 'Choose MT4 or MT5. 請選擇 MT4 或 MT5。',
  invalid_password: 'Trading password is required (max 64 characters). 請輸入交易密碼（最多 64 字元）。',
  invalid_master: 'Please choose a valid master account. 請選擇有效的主帳戶。',
  name_too_long: 'Account name is too long. Use a shorter broker name. 帳戶名稱太長，請縮短經紀商名稱。',
  already_exists: 'This account already exists or is waiting for approval. 此帳戶已存在或正在等待審批。',
  invalid_risk: 'Stop-loss must be between 0.01% and 100%, with an action chosen. 止損須介乎 0.01% 至 100%，並選擇執行方式。',
  not_pending: 'This request is no longer pending. 此申請已不在待審批狀態。',
};

const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';

function friendly(message: string | undefined): string {
  const key = Object.keys(ERRORS).find((k) => message?.includes(k));
  return key ? ERRORS[key] : FALLBACK;
}

export async function fetchAccountRequests(): Promise<{ requests: AccountRequest[]; error: string | null }> {
  const { data, error } = await supabase.from('account_requests').select(COLUMNS).order('created_at', { ascending: false }).limit(200);
  if (error || !Array.isArray(data)) return { requests: [], error: 'Could not load account requests. 未能載入開戶申請。' };
  return { requests: data as AccountRequest[], error: null };
}

export async function submitAccountRequest(input: AccountRequestInput): Promise<string | null> {
  const { error } = await supabase.rpc('submit_account_request', {
    p_holder_name: input.holderName,
    p_account_number: input.accountNumber,
    p_broker: input.broker,
    p_broker_server: input.brokerServer,
    p_platform: input.platform,
    p_master_account: input.masterAccount,
    p_password: input.password,
    p_for_user: input.forUserId,
    p_risk_pct: input.riskPct,
    p_risk_action: input.riskAction,
  });
  return error ? friendly(error.message) : null;
}

export async function reviewAccountRequest(id: string, approve: boolean, note: string): Promise<string | null> {
  const { error } = await supabase.rpc('review_account_request', { p_id: id, p_approve: approve, p_note: note });
  return error ? friendly(error.message) : null;
}

export async function cancelAccountRequest(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_account_request', { p_id: id });
  return error ? friendly(error.message) : null;
}
