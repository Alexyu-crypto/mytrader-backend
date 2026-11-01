import type { Account, BalanceOperation, LivePosition, TradeHistory } from '@/lib/types';
import { netOf } from '@/lib/accountData';

export interface CurvePoint {
  time: number;
  balance: number;
  growth: number;
  profit: number;
}

export interface Bucket {
  label: string;
  value: number;
  profit: number;
  trades: number;
}

export interface SymbolSlice {
  symbol: string;
  trades: number;
  profit: number;
}

export interface TradeRef {
  value: number;
  symbol: string;
  time: string | null;
}

export interface Performance {
  growthPct: number;
  pnlPct: number | null;
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  commission: number;
  swap: number;
  deposits: number;
  withdrawals: number;
  estimatedOpening: number;
  floating: number;
  maxDrawdownPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  longs: number;
  longsWon: number;
  shorts: number;
  shortsWon: number;
  lots: number;
  best: TradeRef | null;
  worst: TradeRef | null;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  expectancy: number;
  avgHoldMs: number;
  firstTime: number | null;
  lastTime: number | null;
  curve: CurvePoint[];
  monthly: Bucket[];
  daily: Bucket[];
  hourly: Bucket[];
  symbols: SymbolSlice[];
}

type Event = { time: number; kind: 'cash'; amount: number } | { time: number; kind: 'trade'; net: number };

const ts = (value: string | null) => (value ? new Date(value).getTime() : NaN);
const monthKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${monthKey(t)}-${String(d.getDate()).padStart(2, '0')}`;
};

export function computePerformance(
  account: Account,
  trades: TradeHistory[],
  ops: BalanceOperation[],
  positions: LivePosition[],
): Performance {
  const closed = trades.filter((t) => Number.isFinite(ts(t.close_time))).sort((a, b) => ts(a.close_time) - ts(b.close_time));
  const cash = ops.filter((o) => o.op_type !== 'credit');
  const deposits = cash.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0);
  const withdrawals = cash.filter((o) => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0);
  const netProfit = closed.reduce((s, t) => s + netOf(t), 0);

  const events: Event[] = [
    ...cash.map((o) => ({ time: ts(o.op_time), kind: 'cash' as const, amount: o.amount })),
    ...closed.map((t) => ({ time: ts(t.close_time), kind: 'trade' as const, net: netOf(t) })),
  ].sort((a, b) => a.time - b.time || (a.kind === 'cash' ? -1 : 1));

  // Older EAs did not upload deposits: infer the missing starting capital from today's balance.
  const residual = (account.balance || 0) - netProfit - (deposits - withdrawals);
  const estimatedOpening = account.balance > 0 && residual > 0.01 ? residual : 0;

  let balance = estimatedOpening;
  let factor = 1;
  let peak = 1;
  let maxDd = 0;
  let cumProfit = 0;
  const curve: CurvePoint[] = [];
  const monthFactor = new Map<string, number>();
  const monthProfit = new Map<string, { profit: number; trades: number }>();

  if (events.length) curve.push({ time: events[0].time - 1, balance, growth: 0, profit: 0 });
  for (const e of events) {
    if (e.kind === 'cash') {
      balance += e.amount;
    } else {
      const r = balance > 0 ? e.net / balance : 0;
      factor *= 1 + r;
      balance += e.net;
      cumProfit += e.net;
      const key = monthKey(e.time);
      monthFactor.set(key, (monthFactor.get(key) ?? 1) * (1 + r));
      const m = monthProfit.get(key) ?? { profit: 0, trades: 0 };
      m.profit += e.net;
      m.trades += 1;
      monthProfit.set(key, m);
      peak = Math.max(peak, factor);
      maxDd = Math.max(maxDd, peak > 0 ? (peak - factor) / peak : 0);
    }
    curve.push({ time: e.time, balance, growth: (factor - 1) * 100, profit: cumProfit });
  }

  const monthly: Bucket[] = [...monthFactor.entries()].map(([key, f]) => ({
    label: key,
    value: (f - 1) * 100,
    profit: monthProfit.get(key)!.profit,
    trades: monthProfit.get(key)!.trades,
  }));

  const dailyMap = new Map<string, Bucket>();
  const hourly: Bucket[] = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: 0, profit: 0, trades: 0 }));
  const symbolMap = new Map<string, SymbolSlice>();
  for (const t of closed) {
    const time = ts(t.close_time);
    const net = netOf(t);
    const day = dailyMap.get(dayKey(time)) ?? { label: dayKey(time), value: 0, profit: 0, trades: 0 };
    day.value += net;
    day.profit += net;
    day.trades += 1;
    dailyMap.set(day.label, day);
    const hour = hourly[new Date(time).getHours()];
    hour.value += net;
    hour.profit += net;
    hour.trades += 1;
    const sym = symbolMap.get(t.symbol) ?? { symbol: t.symbol, trades: 0, profit: 0 };
    sym.trades += 1;
    sym.profit += net;
    symbolMap.set(t.symbol, sym);
  }

  const winners = closed.filter((t) => netOf(t) > 0);
  const losers = closed.filter((t) => netOf(t) < 0);
  const grossProfit = winners.reduce((s, t) => s + netOf(t), 0);
  const grossLoss = losers.reduce((s, t) => s + netOf(t), 0);
  const longs = closed.filter((t) => t.order_type.toUpperCase().startsWith('BUY'));
  const shorts = closed.filter((t) => t.order_type.toUpperCase().startsWith('SELL'));
  const ref = (t: TradeHistory | undefined): TradeRef | null => (t ? { value: netOf(t), symbol: t.symbol, time: t.close_time } : null);
  const byNet = [...closed].sort((a, b) => netOf(b) - netOf(a));
  const holds = closed.map((t) => ts(t.close_time) - ts(t.open_time)).filter((ms) => Number.isFinite(ms) && ms >= 0);

  const invested = deposits + estimatedOpening;
  const takenOut = withdrawals + (account.equity || 0);

  return {
    growthPct: (factor - 1) * 100,
    pnlPct: invested > 0 ? ((takenOut - invested) / invested) * 100 : null,
    netProfit,
    grossProfit,
    grossLoss,
    commission: closed.reduce((s, t) => s + (t.commission || 0), 0),
    swap: closed.reduce((s, t) => s + (t.swap || 0), 0),
    deposits,
    withdrawals,
    estimatedOpening,
    floating: positions.reduce((s, p) => s + (p.profit || 0) + (p.swap || 0), 0),
    maxDrawdownPct: maxDd * 100,
    totalTrades: closed.length,
    wins: winners.length,
    losses: losers.length,
    winRate: closed.length ? (winners.length / closed.length) * 100 : 0,
    longs: longs.length,
    longsWon: longs.filter((t) => netOf(t) > 0).length,
    shorts: shorts.length,
    shortsWon: shorts.filter((t) => netOf(t) > 0).length,
    lots: closed.reduce((s, t) => s + (t.lots || 0), 0),
    best: ref(byNet[0]),
    worst: ref(byNet[byNet.length - 1]),
    avgWin: winners.length ? grossProfit / winners.length : 0,
    avgLoss: losers.length ? grossLoss / losers.length : 0,
    profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null,
    expectancy: closed.length ? netProfit / closed.length : 0,
    avgHoldMs: holds.length ? holds.reduce((s, h) => s + h, 0) / holds.length : 0,
    firstTime: events.length ? events[0].time : null,
    lastTime: events.length ? events[events.length - 1].time : null,
    curve,
    monthly,
    daily: [...dailyMap.values()].slice(-31),
    hourly,
    symbols: [...symbolMap.values()].sort((a, b) => b.trades - a.trades),
  };
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = min / 60;
  if (hr < 48) return `${hr.toFixed(1)}h`;
  return `${(hr / 24).toFixed(1)}d`;
}

export function buildSummary(account: Account, p: Performance, openCount: number): string[] {
  const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  if (p.totalTrades === 0) {
    return [`${account.account_name} has no closed trades on record yet. Statistics, charts and commentary will appear automatically once the EA uploads trading history.`];
  }

  const since = p.firstTime ? new Date(p.firstTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const months = p.monthly.length;
  const positive = p.monthly.filter((m) => m.value > 0).length;
  const bestMonth = [...p.monthly].sort((a, b) => b.value - a.value)[0];
  const worstMonth = [...p.monthly].sort((a, b) => a.value - b.value)[0];
  const topSymbol = p.symbols[0];
  const share = topSymbol ? (topSymbol.trades / p.totalTrades) * 100 : 0;
  const monthName = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const lines = [
    `Since ${since}, the account has returned ${pct(p.growthPct)} on a time-weighted basis, producing a net closed profit of ${money(p.netProfit)} across ${p.totalTrades} trades. ` +
      `Net capital contributed stands at ${money(p.deposits - p.withdrawals + p.estimatedOpening)}, with a current balance of ${money(account.balance || 0)} and equity of ${money(account.equity || 0)}.`,
    `Trading was ${p.winRate >= 50 ? 'consistently accurate' : 'selective, relying on larger winners'}: ${p.winRate.toFixed(1)}% of trades closed in profit, ` +
      `with an average win of ${money(p.avgWin)} against an average loss of ${money(p.avgLoss)}` +
      (p.profitFactor !== null ? ` (profit factor ${p.profitFactor.toFixed(2)}).` : ' and no losing trades recorded.') +
      ` The deepest peak-to-trough decline on closed trades was ${p.maxDrawdownPct.toFixed(2)}%.`,
  ];
  if (months > 1 && bestMonth && worstMonth) {
    lines.push(
      `${positive} of ${months} months finished positive. The strongest month was ${monthName(bestMonth.label)} (${pct(bestMonth.value)}), ` +
        `while the weakest was ${monthName(worstMonth.label)} (${pct(worstMonth.value)}).`,
    );
  }
  if (topSymbol) {
    lines.push(
      `${topSymbol.symbol} was the main instrument, accounting for ${share.toFixed(0)}% of trades and ${money(topSymbol.profit)} of net profit. ` +
        (openCount > 0
          ? `${openCount} position${openCount === 1 ? ' is' : 's are'} currently open with floating P&L of ${money(p.floating)}.`
          : 'There are no open positions at the time of this report.'),
    );
  }
  return lines;
}
