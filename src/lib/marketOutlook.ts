import type { LivePosition, TradeHistory } from '@/lib/types';
import { netOf } from '@/lib/accountData';
import type { Bilingual } from '@/lib/reportNarrative';

export type Bias = 'bullish' | 'bearish' | 'neutral';

export interface PricePoint {
  time: number;
  price: number;
}

export interface MarketView {
  symbol: string;
  share: number;
  latest: number;
  changePct: number;
  support: number;
  resistance: number;
  bias: Bias;
  confidence: 'high' | 'medium' | 'low';
  points: PricePoint[];
  longWinRate: number | null;
  shortWinRate: number | null;
  netProfit: number;
  openLongLots: number;
  openShortLots: number;
  analysis: Bilingual;
  forecast: Bilingual;
}

const WINDOW_MS = 30 * 24 * 3600 * 1000;
const MIN_SHARE = 0.1;
const MAX_PRODUCTS = 3;

const isBuy = (type: string) => type.toUpperCase().startsWith('BUY');
const ts = (v: string | null) => (v ? new Date(v).getTime() : NaN);
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const rate = (wins: number, total: number) => (total ? (wins / total) * 100 : null);

export function digitsFor(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 20) return 3;
  return 5;
}

const fmt = (n: number) => n.toFixed(digitsFor(n));

function pricePoints(trades: TradeHistory[], positions: LivePosition[]): PricePoint[] {
  const pts: PricePoint[] = [];
  for (const t of trades) {
    if (t.open_price > 0 && Number.isFinite(ts(t.open_time))) pts.push({ time: ts(t.open_time), price: t.open_price });
    if (t.close_price > 0 && Number.isFinite(ts(t.close_time))) pts.push({ time: ts(t.close_time), price: t.close_price });
  }
  for (const p of positions) {
    if (p.open_price > 0 && Number.isFinite(ts(p.open_time))) pts.push({ time: ts(p.open_time), price: p.open_price });
  }
  return pts.sort((a, b) => a.time - b.time);
}

function trendBias(points: PricePoint[], support: number, resistance: number): { bias: Bias; strength: number } {
  if (points.length < 4 || resistance <= support) return { bias: 'neutral', strength: 0 };
  const third = Math.max(1, Math.floor(points.length / 3));
  const early = avg(points.slice(0, third).map((p) => p.price));
  const late = avg(points.slice(-third).map((p) => p.price));
  const strength = (late - early) / (resistance - support);
  if (strength > 0.15) return { bias: 'bullish', strength };
  if (strength < -0.15) return { bias: 'bearish', strength };
  return { bias: 'neutral', strength };
}

function narrate(v: Omit<MarketView, 'analysis' | 'forecast'>): { analysis: Bilingual; forecast: Bilingual } {
  const s = v.symbol;
  const chg = `${v.changePct >= 0 ? '+' : ''}${v.changePct.toFixed(2)}%`;
  const position = (v.latest - v.support) / Math.max(v.resistance - v.support, 1e-9);
  const zoneEn = position > 0.7 ? 'near the top of its recent range' : position < 0.3 ? 'near the bottom of its recent range' : 'in the middle of its recent range';
  const zoneZh = position > 0.7 ? '接近近期區間頂部' : position < 0.3 ? '接近近期區間底部' : '處於近期區間中段';

  const edgeEn: string[] = [];
  const edgeZh: string[] = [];
  if (v.longWinRate !== null) {
    edgeEn.push(`long trades have won ${v.longWinRate.toFixed(0)}% of the time`);
    edgeZh.push(`做多勝率 ${v.longWinRate.toFixed(0)}%`);
  }
  if (v.shortWinRate !== null) {
    edgeEn.push(`short trades ${v.shortWinRate.toFixed(0)}%`);
    edgeZh.push(`做空勝率 ${v.shortWinRate.toFixed(0)}%`);
  }

  const analysis: Bilingual = {
    en: `${s} moved ${chg} over the observed period and now trades ${zoneEn} (support ${fmt(v.support)}, resistance ${fmt(v.resistance)}).${edgeEn.length ? ` On this account, ${edgeEn.join(' and ')}.` : ''}`,
    zh: `${s} 於觀察期內變動 ${chg}，目前${zoneZh}（支持位 ${fmt(v.support)}，阻力位 ${fmt(v.resistance)}）。${edgeZh.length ? `本戶口在此品種${edgeZh.join('、')}。` : ''}`,
  };

  const exposureEn = v.openLongLots || v.openShortLots
    ? ` Current exposure: ${v.openLongLots.toFixed(2)} lots long / ${v.openShortLots.toFixed(2)} lots short.`
    : '';
  const exposureZh = v.openLongLots || v.openShortLots
    ? ` 現時持倉：多單 ${v.openLongLots.toFixed(2)} 手 / 空單 ${v.openShortLots.toFixed(2)} 手。`
    : '';

  let forecast: Bilingual;
  if (v.bias === 'bullish') {
    forecast = {
      en: `Bias: bullish. While price holds above ${fmt(v.support)}, we expect buyers to retest ${fmt(v.resistance)}; a clean break above it would open the way to further gains. We favour buying pullbacks rather than chasing strength.${exposureEn}`,
      zh: `預估：偏好。只要價格守穩 ${fmt(v.support)} 之上，預期買盤將再次挑戰 ${fmt(v.resistance)}；若有效突破，升勢有望延續。我們傾向於回調時買入，而非追高。${exposureZh}`,
    };
  } else if (v.bias === 'bearish') {
    forecast = {
      en: `Bias: bearish. While price stays below ${fmt(v.resistance)}, we expect sellers to press toward ${fmt(v.support)}; a break below it could extend the decline. We favour selling rallies with tight protection.${exposureEn}`,
      zh: `預估：偏淡。只要價格未能重上 ${fmt(v.resistance)}，預期沽壓將推向 ${fmt(v.support)}；若跌穿，跌勢或會擴大。我們傾向於反彈時沽出，並嚴設止損。${exposureZh}`,
    };
  } else {
    forecast = {
      en: `Bias: range-bound. We expect ${s} to oscillate between ${fmt(v.support)} and ${fmt(v.resistance)} until a decisive break. We will trade the edges of the range and wait for confirmation before committing to a direction.${exposureEn}`,
      zh: `預估：區間震盪。預期 ${s} 將在 ${fmt(v.support)} 至 ${fmt(v.resistance)} 之間上落，直至出現明確突破。我們會在區間兩端操作，待方向確認後才加大部署。${exposureZh}`,
    };
  }
  return { analysis, forecast };
}

export function buildMarketViews(trades: TradeHistory[], positions: LivePosition[]): MarketView[] {
  const counts = new Map<string, number>();
  for (const t of trades) counts.set(t.symbol, (counts.get(t.symbol) ?? 0) + 1);
  for (const p of positions) counts.set(p.symbol, (counts.get(p.symbol) ?? 0) + 1);
  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  if (!total) return [];

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const main = ranked.filter(([, n]) => n / total >= MIN_SHARE).slice(0, MAX_PRODUCTS);
  const chosen = main.length ? main : ranked.slice(0, 1);

  return chosen.flatMap(([symbol, n]) => {
    const symTrades = trades.filter((t) => t.symbol === symbol);
    const symPositions = positions.filter((p) => p.symbol === symbol);
    const all = pricePoints(symTrades, symPositions);
    if (!all.length) return [];
    const lastTime = all[all.length - 1].time;
    const recent = all.filter((p) => p.time >= lastTime - WINDOW_MS);
    const points = recent.length >= 4 ? recent : all;
    const prices = points.map((p) => p.price);
    const support = Math.min(...prices);
    const resistance = Math.max(...prices);
    const latest = points[points.length - 1].price;
    const first = points[0].price;
    const { bias, strength } = trendBias(points, support, resistance);

    const longs = symTrades.filter((t) => isBuy(t.order_type));
    const shorts = symTrades.filter((t) => !isBuy(t.order_type));
    const longWinRate = rate(longs.filter((t) => netOf(t) > 0).length, longs.length);
    const shortWinRate = rate(shorts.filter((t) => netOf(t) > 0).length, shorts.length);
    const aligned = (bias === 'bullish' && (longWinRate ?? 0) >= 50) || (bias === 'bearish' && (shortWinRate ?? 0) >= 50);
    const confidence: MarketView['confidence'] =
      points.length < 6 || bias === 'neutral' ? 'low' : aligned && Math.abs(strength) > 0.3 ? 'high' : 'medium';

    const base = {
      symbol,
      share: (n / total) * 100,
      latest,
      changePct: first > 0 ? ((latest - first) / first) * 100 : 0,
      support,
      resistance,
      bias,
      confidence,
      points,
      longWinRate,
      shortWinRate,
      netProfit: symTrades.reduce((s, t) => s + netOf(t), 0),
      openLongLots: symPositions.filter((p) => isBuy(p.order_type)).reduce((s, p) => s + p.lots, 0),
      openShortLots: symPositions.filter((p) => !isBuy(p.order_type)).reduce((s, p) => s + p.lots, 0),
    };
    return [{ ...base, ...narrate(base) }];
  });
}
