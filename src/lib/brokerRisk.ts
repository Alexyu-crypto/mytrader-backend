import { supabase } from '@/lib/supabase';

export type RiskLevel = 'low' | 'medium' | 'high';
export type BlockReason = 'manual' | 'date' | 'overdue' | 'score';

export interface BrokerRisk {
  broker: string;
  account_count: number;
  deposits_confirmed: number;
  withdrawals_confirmed: number;
  net_exposure: number;
  wd_confirmed: number;
  wd_rejected: number;
  wd_pending: number;
  wd_overdue: number;
  wd_overdue_amount: number;
  oldest_pending_days: number;
  avg_wd_delay_days: number;
  max_wd_delay_days: number;
  risk_score: number;
  risk_level: RiskLevel;
  deposit_blocked: boolean;
  block_reason: BlockReason | null;
  manual_block: boolean;
  block_deposits_after: string | null;
  auto_block: boolean;
  max_pending_days: number;
  restricts_profit: boolean;
  notes: string;
}

export interface BrokerRuleInput {
  manual_block: boolean;
  block_deposits_after: string | null;
  auto_block: boolean;
  max_pending_days: number;
  restricts_profit: boolean;
  notes: string;
}

export async function fetchBrokerRisk(): Promise<BrokerRisk[]> {
  const { data, error } = await supabase.rpc('broker_risk_report');
  if (error) throw error;
  return ((data ?? []) as BrokerRisk[]).map((r) => ({
    ...r,
    deposits_confirmed: Number(r.deposits_confirmed),
    withdrawals_confirmed: Number(r.withdrawals_confirmed),
    net_exposure: Number(r.net_exposure),
    wd_overdue_amount: Number(r.wd_overdue_amount),
    avg_wd_delay_days: Number(r.avg_wd_delay_days),
    max_wd_delay_days: Number(r.max_wd_delay_days),
  }));
}

export async function saveBrokerRule(broker: string, rule: BrokerRuleInput): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('broker_risk_rules').upsert({
    broker,
    ...rule,
    updated_by_email: session?.user?.email ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export function isDepositBlockedError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && String((err as { message?: string }).message ?? '').includes('DEPOSIT_BLOCKED');
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low 低',
  medium: 'Medium 中',
  high: 'High 高',
};

export const RISK_BADGE: Record<RiskLevel, string> = {
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  high: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export function blockReasonLabel(r: BrokerRisk): string {
  switch (r.block_reason) {
    case 'manual': return 'Manually blocked 人手禁止入金';
    case 'date': return `Blocked since ${r.block_deposits_after} 由此日期起禁止入金`;
    case 'overdue': return `Withdrawal pending ${r.oldest_pending_days}d (> ${r.max_pending_days}d limit) 出金逾期未到帳`;
    case 'score': return `Risk score ${r.risk_score} ≥ 60 風險分數過高`;
    default: return '';
  }
}

export function riskAdvice(r: BrokerRisk): string {
  if (r.deposit_blocked) return 'Do not deposit. Chase pending withdrawals first. 停止入金，優先追討出金。';
  if (r.risk_level === 'high') return 'Stop new deposits and withdraw surplus. 暫停入金並提走多餘資金。';
  if (r.risk_level === 'medium') return 'Deposit with caution, keep exposure low. 謹慎入金，控制資金曝險。';
  return 'Normal 正常';
}
