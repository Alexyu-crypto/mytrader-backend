import type { BalanceOperation, TradeHistory } from '@/lib/types';

const WEEKDAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const pad = (n: number) => String(n).padStart(2, '0');

function dateTerms(iso: string | null): string[] {
  if (!iso) return [];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return [];
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return [
    `${y}-${pad(m)}-${pad(day)}`,
    `${y}/${m}/${day}`,
    `${m}/${day}`,
    `${pad(m)}/${pad(day)}`,
    `${day}/${m}`,
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
    d.toLocaleDateString('en-US', { weekday: 'long' }),
    `${m}月${day}日`,
    WEEKDAYS_ZH[d.getDay()],
    hm,
    `${hm}:${pad(d.getSeconds())}`,
  ];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s,]+/g, ' ').trim();
}

function compact(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, '');
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}

export function buildTradeHaystack(t: TradeHistory): string {
  const net = t.profit + t.commission + t.swap;
  const side = t.order_type.toLowerCase().includes('buy') ? 'buy long 買 做多' : t.order_type.toLowerCase().includes('sell') ? 'sell short 賣 做空' : '';
  return normalize(
    [
      t.account_name,
      t.symbol,
      t.order_type,
      side,
      `#${t.ticket}`,
      String(t.ticket),
      String(t.lots),
      `${t.lots} lot`,
      String(t.open_price),
      String(t.close_price),
      net.toFixed(2),
      net >= 0 ? 'win profit 盈利 賺' : 'loss 虧損 蝕',
      t.account_name.startsWith('M-') ? 'master 主帳戶' : t.account_name.startsWith('F-') ? 'follower 跟單' : '',
      ...dateTerms(t.open_time),
      ...dateTerms(t.close_time),
    ].join(' '),
  );
}

export function buildOpHaystack(op: BalanceOperation): string {
  const zh = op.op_type === 'deposit' ? '入金 存款' : op.op_type === 'withdrawal' ? '出金 提款' : '信用 贈金';
  return normalize(
    [op.account_name, op.op_type, zh, op.comment, `#${op.ticket}`, String(op.ticket), op.amount.toFixed(2), ...dateTerms(op.op_time)].join(' '),
  );
}

export function fuzzyMatch(haystack: string, query: string): boolean {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const flat = compact(haystack);
  return tokens.every((token) => {
    if (haystack.includes(token)) return true;
    const t = compact(token);
    if (!t) return true;
    if (flat.includes(t)) return true;
    return t.length >= 3 && words.some((w) => w.length >= t.length && w[0] === t[0] && isSubsequence(t, compact(w)));
  });
}
