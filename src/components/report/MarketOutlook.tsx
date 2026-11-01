import { useState } from 'react';
import { ExternalLink, Minus, Newspaper, TrendingDown, TrendingUp } from 'lucide-react';
import { digitsFor, type Bias, type MarketView, type PricePoint } from '@/lib/marketOutlook';
import { formatCurrency, timeAgo } from '@/lib/format';
import { useMarketNews, type NewsItem, type SymbolNews } from '@/hooks/useMarketNews';

const BIAS: Record<Bias, { en: string; zh: string; icon: typeof TrendingUp; badge: string; stroke: string }> = {
  bullish: { en: 'Bullish', zh: '偏好', icon: TrendingUp, badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', stroke: '#34d399' },
  bearish: { en: 'Bearish', zh: '偏淡', icon: TrendingDown, badge: 'bg-red-500/15 text-red-300 border-red-500/30', stroke: '#f87171' },
  neutral: { en: 'Range-bound', zh: '區間震盪', icon: Minus, badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', stroke: '#fbbf24' },
};

const CONFIDENCE = { high: 'High · 高', medium: 'Medium · 中', low: 'Low · 低' };

const price = (n: number) => n.toFixed(digitsFor(n));

function Sparkline({ points, stroke }: { points: PricePoint[]; stroke: string }) {
  const W = 300;
  const H = 72;
  const xs = points.map((p) => p.time);
  const ys = points.map((p) => p.price);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const x = (t: number) => (x1 > x0 ? ((t - x0) / (x1 - x0)) * W : W / 2);
  const y = (v: number) => (y1 > y0 ? H - 6 - ((v - y0) / (y1 - y0)) * (H - 12) : H / 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[72px]" preserveAspectRatio="none">
      <line x1="0" x2={W} y1={y(y1)} y2={y(y1)} stroke="#475569" strokeDasharray="3 4" strokeWidth="1" />
      <line x1="0" x2={W} y1={y(y0)} y2={y(y0)} stroke="#475569" strokeDasharray="3 4" strokeWidth="1" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last.time)} cy={y(last.price)} r="3.5" fill={stroke} />
    </svg>
  );
}

function RangeBar({ view }: { view: MarketView }) {
  const span = view.resistance - view.support;
  const pos = span > 0 ? ((view.latest - view.support) / span) * 100 : 50;
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-emerald-500/40 via-slate-600 to-red-500/40">
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white ring-2 ring-slate-900" style={{ left: `${Math.min(100, Math.max(0, pos))}%` }} />
      </div>
      <div className="flex justify-between text-[11px] mt-1.5 tabular-nums">
        <span className="text-emerald-300">Support · 支持 {price(view.support)}</span>
        <span className="text-red-300">Resistance · 阻力 {price(view.resistance)}</span>
      </div>
    </div>
  );
}

function NewsList({ items }: { items: NewsItem[] }) {
  if (!items.length) return <p className="text-slate-500 text-xs py-2">No recent headlines · 暫無最新新聞</p>;
  return (
    <ul className="divide-y divide-slate-700/50">
      {items.map((n) => (
        <li key={n.link}>
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="group flex gap-2 py-2.5 hover:bg-slate-800/50 -mx-2 px-2 rounded-md transition-colors">
            <div className="min-w-0 flex-1">
              <p className="text-slate-200 text-sm leading-snug group-hover:text-cyan-300 transition-colors line-clamp-2">{n.title}</p>
              <p className="text-slate-500 text-[11px] mt-1 truncate">
                {n.source || 'News'}{n.published ? ` · ${timeAgo(n.published)}` : ''}
              </p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 shrink-0 mt-0.5 print:hidden" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function NewsPanel({ news, loading, error }: { news: SymbolNews | undefined; loading: boolean; error: string }) {
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  return (
    <div className="border-t border-slate-700/60 pt-3">
      <div className="flex items-center justify-between mb-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-slate-500">
          <Newspaper className="w-3.5 h-3.5" /> LATEST NEWS · 最新新聞
        </p>
        <div className="flex bg-slate-800/80 rounded-md p-0.5 print:hidden">
          {(['en', 'zh'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${lang === l ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
            >
              {l === 'en' ? 'EN' : '中文'}
            </button>
          ))}
        </div>
      </div>
      {loading && !news ? (
        <div className="space-y-2 py-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-8 rounded bg-slate-800/80 animate-pulse" />)}
        </div>
      ) : error && !news ? (
        <p className="text-slate-500 text-xs py-2">{error} · 暫未能載入新聞</p>
      ) : (
        <NewsList items={news?.[lang] ?? []} />
      )}
    </div>
  );
}

function MarketCard({ view, news, loading, error }: { view: MarketView; news: SymbolNews | undefined; loading: boolean; error: string }) {
  const b = BIAS[view.bias];
  const Icon = b.icon;
  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-5 flex flex-col gap-4 transition-colors hover:border-cyan-500/40 break-inside-avoid">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-white text-lg font-semibold leading-tight">{view.symbol}</h3>
          <p className="text-slate-500 text-xs mt-0.5">{view.share.toFixed(0)}% of activity · 佔交易量</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${b.badge}`}>
          <Icon className="w-3.5 h-3.5" />
          {b.en} · {b.zh}
        </span>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-slate-500 text-[11px] uppercase tracking-wide">Last traded · 最近成交</p>
          <p className="text-white text-2xl font-semibold tabular-nums">{price(view.latest)}</p>
        </div>
        <p className={`text-sm font-medium tabular-nums ${view.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {view.changePct >= 0 ? '+' : ''}{view.changePct.toFixed(2)}%
        </p>
      </div>

      <Sparkline points={view.points} stroke={b.stroke} />
      <RangeBar view={view} />

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Long win · 多勝', view.longWinRate === null ? '—' : `${view.longWinRate.toFixed(0)}%`],
          ['Short win · 空勝', view.shortWinRate === null ? '—' : `${view.shortWinRate.toFixed(0)}%`],
          ['Net P&L · 盈虧', formatCurrency(view.netProfit)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-800/70 px-2 py-2">
            <dt className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</dt>
            <dd className="text-slate-200 text-sm font-medium tabular-nums mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3 text-sm leading-relaxed">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-slate-500 mb-1">ANALYSIS · 分析</p>
          <p className="text-slate-300">{view.analysis.en}</p>
          <p className="text-slate-400 mt-1">{view.analysis.zh}</p>
        </div>
        <div className="border-t border-slate-700/60 pt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold tracking-widest text-slate-500">FORECAST · 預估</p>
            <p className="text-[11px] text-slate-500">Confidence · 信心 <span className="text-slate-300">{CONFIDENCE[view.confidence]}</span></p>
          </div>
          <p className="text-slate-300">{view.forecast.en}</p>
          <p className="text-slate-400 mt-1">{view.forecast.zh}</p>
        </div>
        <NewsPanel news={news} loading={loading} error={error} />
      </div>
    </article>
  );
}

export function MarketOutlook({ views }: { views: MarketView[] }) {
  const { news, loading, error } = useMarketNews(views.map((v) => v.symbol));
  if (!views.length) {
    return <p className="text-center text-slate-500 py-10 text-sm">Not enough trading activity yet to analyse the main products · 交易數據不足，暫未能分析</p>;
  }
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className={`grid gap-4 ${views.length === 1 ? 'max-w-xl' : views.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        {views.map((v) => <MarketCard key={v.symbol} view={v} news={news[v.symbol]} loading={loading} error={error} />)}
      </div>
      <p className="text-slate-500 text-xs leading-relaxed">
        Analysis is based on prices from this account's own trades and open positions, not a live market feed, and is an opinion rather than investment advice. Headlines are from Google News (past 7 days) and link to the original publishers.
        以上分析根據本戶口的成交及持倉價格得出，並非實時市場報價，僅屬觀點，不構成投資建議。新聞來自 Google 新聞（過去 7 天），連結至原文出處。
      </p>
    </div>
  );
}
