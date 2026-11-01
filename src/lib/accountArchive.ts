import { supabase } from '@/lib/supabase';
import type { Account, AccountSnapshot, ArchiveStatus, BalanceOperation, TradeHistory } from '@/lib/types';
import { downloadWorkbook } from '@/lib/xlsx';

export const MAX_FROZEN_REASON = 500;
export const MAX_HOLDER_NAME = 100;

export const ARCHIVE_STATUSES: Record<ArchiveStatus, { label: string; short: string; hint: string; badge: string; card: string; icon: string; button: string }> = {
  active: {
    label: 'Normal 正常',
    short: 'Normal 正常',
    hint: 'Account in normal use. 帳戶正常使用中。',
    badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    card: 'border-slate-700 bg-slate-900/40',
    icon: 'text-emerald-400',
    button: 'bg-slate-700 text-white hover:bg-slate-600',
  },
  frozen: {
    label: 'Frozen / Under dispute 凍結 / 申訴中',
    short: 'Frozen 凍結',
    hint: 'Broker disabled the account or a dispute is in progress. 經紀停用或申訴中。',
    badge: 'border-red-500/40 bg-red-500/10 text-red-300',
    card: 'border-red-500/40 bg-red-500/5',
    icon: 'text-red-400',
    button: 'bg-red-500 text-white hover:bg-red-600',
  },
  removed_vm: {
    label: 'Removed from VM 已從VM移除',
    short: 'Removed VM 已移除VM',
    hint: 'Terminal no longer runs on the VM server. MT終端已從VM移除。',
    badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    card: 'border-amber-500/40 bg-amber-500/5',
    icon: 'text-amber-400',
    button: 'bg-amber-500 text-slate-900 hover:bg-amber-400',
  },
  stopped: {
    label: 'Stop use AC 停用帳戶',
    short: 'Stopped 停用',
    hint: 'Account retired and no longer used. 帳戶已停止使用。',
    badge: 'border-slate-500/50 bg-slate-500/15 text-slate-300',
    card: 'border-slate-500/50 bg-slate-500/10',
    icon: 'text-slate-300',
    button: 'bg-slate-500 text-white hover:bg-slate-400',
  },
};

export const MARKED_STATUSES: ArchiveStatus[] = ['frozen', 'removed_vm', 'stopped'];
const PAGE = 1000;

async function fetchAll<T>(table: string, account: string, orderBy: string): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('account_name', account)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) {
      console.error(`${table} fetch failed`, error);
      return null;
    }
    rows.push(...(data as T[]));
    if (data.length < PAGE) return rows;
  }
}

export async function fetchSnapshots(account: string): Promise<AccountSnapshot[] | null> {
  const { data, error } = await supabase
    .from('account_snapshots')
    .select('*')
    .eq('account_name', account)
    .order('snapshot_date', { ascending: false })
    .limit(400);
  if (error || !data) {
    console.error('snapshot fetch failed', error);
    return null;
  }
  return data as AccountSnapshot[];
}

export async function setArchiveStatus(account: Account, status: ArchiveStatus, reason: string): Promise<boolean> {
  const marked = status !== 'active';
  const { error } = await supabase
    .from('accounts')
    .update({
      archive_status: status,
      frozen_reason: marked ? reason.trim().slice(0, MAX_FROZEN_REASON) || null : null,
      frozen_at: marked ? (account.archive_status === status && account.frozen_at) || new Date().toISOString() : null,
    })
    .eq('id', account.id);
  if (error) console.error('freeze update failed', error);
  return !error;
}

export async function setHolderName(account: Account, name: string): Promise<boolean> {
  const { error } = await supabase
    .from('accounts')
    .update({ holder_name: name.trim().slice(0, MAX_HOLDER_NAME) || null })
    .eq('id', account.id);
  if (error) console.error('holder name update failed', error);
  return !error;
}

const fmtTime = (ts: string | null | undefined) => (ts ? new Date(ts).toLocaleString('en-GB', { hour12: false }) : '');
const round = (n: number) => Math.round(n * 100) / 100;

export async function downloadAccountEvidence(account: Account): Promise<boolean> {
  const [snapshots, funding, trades] = await Promise.all([
    fetchAll<AccountSnapshot>('account_snapshots', account.account_name, 'snapshot_date'),
    fetchAll<BalanceOperation>('balance_operations', account.account_name, 'op_time'),
    fetchAll<TradeHistory>('trade_history', account.account_name, 'close_time'),
  ]);
  if (!snapshots || !funding || !trades) return false;

  const sum = (type: BalanceOperation['op_type']) =>
    round(funding.filter((o) => o.op_type === type).reduce((s, o) => s + (type === 'withdrawal' ? Math.abs(o.amount) : o.amount), 0));
  const closedPl = round(trades.reduce((s, t) => s + (t.profit ?? 0) + (t.commission ?? 0) + (t.swap ?? 0), 0));
  const firstSnap = snapshots[0]?.snapshot_date ?? '';
  const lastConnected = [...snapshots].reverse().find((s) => s.connected)?.snapshot_date ?? '';

  downloadWorkbook(`${account.account_name}-evidence-${new Date().toISOString().slice(0, 10)}`, [
    {
      name: 'Summary 摘要',
      header: ['Item 項目', 'Value 數值'],
      rows: [
        ['Account 帳戶', account.account_name],
        ['AC holder name 戶口持有人 (entered 登記)', account.holder_name ?? ''],
        ['Name in MT 平台戶名 (from EA 由EA回報)', account.mt_holder_name ?? ''],
        ['MT name reported at 平台戶名回報時間', fmtTime(account.mt_holder_at)],
        ['Broker 經紀', account.broker],
        ['Server 伺服器', account.broker_server ?? ''],
        ['Platform 平台', account.platform],
        ['Role 角色', account.type],
        ['Status 狀態', ARCHIVE_STATUSES[account.archive_status].label],
        ['Status since 狀態日期', fmtTime(account.frozen_at)],
        ['Case note 備註', account.frozen_reason ?? ''],
        ['Last known balance 最後結餘', round(account.balance ?? 0)],
        ['Last known equity 最後淨值', round(account.equity ?? 0)],
        ['EA last connected 最後連線', fmtTime(account.last_seen)],
        ['Total deposits 總入金', sum('deposit')],
        ['Total withdrawals 總出金', sum('withdrawal')],
        ['Total credit 總信用', sum('credit')],
        ['Funding records 出入金筆數', funding.length],
        ['Closed trades 已平倉交易', trades.length],
        ['Closed trades P/L 已平倉盈虧', closedPl],
        ['Daily records from 每日紀錄起始', firstSnap],
        ['Last day connected 最後連線日', lastConnected],
        ['Exported at 匯出時間', fmtTime(new Date().toISOString())],
      ],
    },
    {
      name: 'Daily Balance 每日結餘',
      header: ['Date 日期', 'Balance 結餘', 'Equity 淨值', 'Deposits 累計入金', 'Withdrawals 累計出金', 'Credit 信用', 'Open trades 持倉', 'Floating P/L 浮動盈虧', 'Closed trades 已平倉', 'Closed P/L 已平倉盈虧', 'EA connected 已連線', 'EA last seen 最後連線'],
      rows: snapshots.map((s) => [
        s.snapshot_date,
        round(s.balance),
        round(s.equity),
        round(s.total_deposits),
        round(s.total_withdrawals),
        round(s.total_credit),
        s.open_positions,
        round(s.floating_pl),
        s.closed_trades,
        round(s.closed_profit),
        s.connected ? 'yes' : 'no',
        fmtTime(s.last_seen),
      ]),
    },
    {
      name: 'Funding 出入金',
      header: ['Time 時間', 'Type 類型', 'Amount 金額', 'Ticket 單號', 'Comment 備註'],
      rows: funding.map((o) => [fmtTime(o.op_time), o.op_type, round(o.amount), o.ticket, o.comment ?? '']),
    },
    {
      name: 'Closed Trades 交易',
      header: ['Ticket 單號', 'Symbol 商品', 'Type 類型', 'Lots 手數', 'Open time 開倉', 'Open price 開倉價', 'Close time 平倉', 'Close price 平倉價', 'Profit 盈虧', 'Commission 佣金', 'Swap 隔夜利息'],
      rows: trades.map((t) => [
        t.ticket,
        t.symbol,
        t.order_type,
        t.lots,
        fmtTime(t.open_time),
        t.open_price,
        fmtTime(t.close_time),
        t.close_price,
        round(t.profit ?? 0),
        round(t.commission ?? 0),
        round(t.swap ?? 0),
      ]),
    },
  ]);
  return true;
}
