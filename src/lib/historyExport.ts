import type { BalanceOperation, LivePosition, TradeHistory } from '@/lib/types';
import { netOf, OP_LABEL } from '@/lib/accountData';
import { downloadWorkbook, type Sheet } from '@/lib/xlsx';

const stamp = (value: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function exportHistoryWorkbook(fileName: string, trades: TradeHistory[], ops: BalanceOperation[], periodLabel: string) {
  const gross = trades.reduce((s, t) => s + (t.profit || 0), 0);
  const commission = trades.reduce((s, t) => s + (t.commission || 0), 0);
  const swap = trades.reduce((s, t) => s + (t.swap || 0), 0);
  const wins = trades.filter((t) => netOf(t) > 0).length;
  const deposits = ops.filter((o) => o.op_type === 'deposit').reduce((s, o) => s + o.amount, 0);
  const withdrawals = ops.filter((o) => o.op_type === 'withdrawal').reduce((s, o) => s + o.amount, 0);

  const summary: Sheet = {
    name: 'Summary',
    header: ['Item', 'Value'],
    rows: [
      ['Exported at', stamp(new Date().toISOString())],
      ['Period', periodLabel],
      ['Accounts', [...new Set([...trades.map((t) => t.account_name), ...ops.map((o) => o.account_name)])].join(', ')],
      ['Closed trades', trades.length],
      ['Win rate %', trades.length ? round((wins / trades.length) * 100) : 0],
      ['Gross profit', round(gross)],
      ['Commission', round(commission)],
      ['Swap', round(swap)],
      ['Net P&L', round(gross + commission + swap)],
      ['Deposits', round(deposits)],
      ['Withdrawals', round(withdrawals)],
      ['Net funding', round(deposits + withdrawals)],
    ],
  };

  const tradeSheet: Sheet = {
    name: 'Closed Trades',
    header: ['Account', 'Ticket', 'Symbol', 'Type', 'Lots', 'Open Price', 'Close Price', 'Open Time', 'Close Time', 'Profit', 'Commission', 'Swap', 'Net P&L'],
    rows: trades.map((t) => [
      t.account_name, t.ticket, t.symbol, t.order_type, t.lots, t.open_price, t.close_price,
      stamp(t.open_time), stamp(t.close_time), round(t.profit || 0), round(t.commission || 0), round(t.swap || 0), round(netOf(t)),
    ]),
  };

  downloadWorkbook(fileName, [summary, tradeSheet, fundingSheet(ops)]);
}

function fundingSheet(ops: BalanceOperation[]): Sheet {
  return {
    name: 'Deposits & Withdrawals',
    header: ['Account', 'Time', 'Type', 'Ticket', 'Comment', 'Amount'],
    rows: ops.map((o) => [o.account_name, stamp(o.op_time), OP_LABEL[o.op_type], o.ticket, o.comment, round(o.amount)]),
  };
}

export function exportFundingWorkbook(fileName: string, ops: BalanceOperation[], filterLabel: string) {
  const sum = (rows: BalanceOperation[], type: BalanceOperation['op_type']) => rows.filter((o) => o.op_type === type).reduce((s, o) => s + o.amount, 0);
  const accounts = [...new Set(ops.map((o) => o.account_name))].sort();

  const summary: Sheet = {
    name: 'Summary',
    header: ['Item', 'Value'],
    rows: [
      ['Exported at', stamp(new Date().toISOString())],
      ['Filter', filterLabel],
      ['Records', ops.length],
      ['Deposits', round(sum(ops, 'deposit'))],
      ['Withdrawals', round(sum(ops, 'withdrawal'))],
      ['Credit', round(sum(ops, 'credit'))],
      ['Net funding', round(sum(ops, 'deposit') + sum(ops, 'withdrawal'))],
    ],
  };

  const byAccount: Sheet = {
    name: 'By Account',
    header: ['Account', 'Deposits', 'Withdrawals', 'Credit', 'Net funding', 'Records'],
    rows: accounts.map((name) => {
      const rows = ops.filter((o) => o.account_name === name);
      const dep = sum(rows, 'deposit');
      const wd = sum(rows, 'withdrawal');
      return [name, round(dep), round(wd), round(sum(rows, 'credit')), round(dep + wd), rows.length];
    }),
  };

  downloadWorkbook(fileName, [summary, byAccount, fundingSheet(ops)]);
}

export function exportPositionsWorkbook(fileName: string, positions: LivePosition[], delays: Map<string, number | null>, filterLabel: string) {
  const floating = positions.reduce((s, p) => s + (p.profit || 0), 0);
  const lotsOf = (side: (p: LivePosition) => boolean) => round(positions.filter(side).reduce((s, p) => s + (p.lots || 0), 0));

  const summary: Sheet = {
    name: 'Summary',
    header: ['Item', 'Value'],
    rows: [
      ['Exported at', stamp(new Date().toISOString())],
      ['Filter', filterLabel],
      ['Open positions', positions.length],
      ['Floating P&L', round(floating)],
      ['Buy lots', lotsOf((p) => p.order_type === 'BUY')],
      ['Sell lots', lotsOf((p) => p.order_type !== 'BUY')],
    ],
  };

  const positionSheet: Sheet = {
    name: 'Open Positions',
    header: ['Account', 'Ticket', 'Symbol', 'Type', 'Lots', 'Open Price', 'SL', 'TP', 'Profit', 'Swap', 'Open Time', 'Copy Delay (s)'],
    rows: positions.map((p) => {
      const delay = delays.get(p.id);
      return [
        p.account_name, p.ticket, p.symbol, p.order_type, p.lots, p.open_price, p.sl || '', p.tp || '',
        round(p.profit || 0), round(p.swap || 0), stamp(p.open_time), delay == null ? '' : Number((delay / 1000).toFixed(3)),
      ];
    }),
  };

  downloadWorkbook(fileName, [summary, positionSheet]);
}
