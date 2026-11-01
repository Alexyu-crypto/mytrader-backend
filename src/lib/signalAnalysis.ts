import { formatDuration, type Performance } from '@/lib/performance';
import type { Bilingual } from '@/lib/reportNarrative';

export type Verdict = 'strong' | 'steady' | 'caution' | 'early';

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedPct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;

export function signalVerdict(p: Performance): Verdict {
  if (p.totalTrades < 10) return 'early';
  const pf = p.profitFactor ?? (p.grossProfit > 0 ? 3 : 0);
  if (p.maxDrawdownPct > 35 || (p.pnlPct ?? 0) < 0 || pf < 1) return 'caution';
  if (pf >= 1.5 && p.maxDrawdownPct <= 20 && (p.pnlPct ?? 0) > 10) return 'strong';
  return 'steady';
}

export function buildSignalAnalysis(p: Performance, weeks: number, openCount: number): Bilingual[] {
  const verdict = signalVerdict(p);
  const pnl = p.pnlPct;
  const invested = p.deposits + p.estimatedOpening;
  const pf = p.profitFactor;
  const longShare = p.totalTrades ? (p.longs / p.totalTrades) * 100 : 0;
  const top = p.symbols.slice(0, 3);
  const topProfit = p.symbols.filter((s) => s.profit > 0).sort((a, b) => b.profit - a.profit)[0];
  const payoff = p.avgLoss < 0 ? p.avgWin / Math.abs(p.avgLoss) : null;
  const ddLevel = p.maxDrawdownPct <= 10 ? 'low' : p.maxDrawdownPct <= 25 ? 'moderate' : 'high';
  const ddZh = { low: '偏低', moderate: '中等', high: '偏高' }[ddLevel];

  const out: Bilingual[] = [];

  out.push({
    en: `Over ${weeks} week${weeks === 1 ? '' : 's'} of live trading, this account has ${pnl === null ? 'not yet recorded a capital base, so a P&L percentage cannot be measured' : `delivered a P&L of ${signedPct(pnl)} on ${money(invested)} invested`}, with closed-trade net profit of ${p.netProfit >= 0 ? '' : '-'}${money(p.netProfit)} and withdrawals to date of ${money(p.withdrawals)}. ${pnl !== null && pnl >= 0 ? 'Capital has grown, and the result is backed by real trade history rather than a short burst of luck.' : 'The account is currently below its invested capital, which investors should weigh carefully.'}`,
    zh: `本戶口實盤運行 ${weeks} 週，${pnl === null ? '暫未記錄本金，因此未能計算盈虧率' : `以 ${money(invested)} 投入資金計，盈虧率為 ${signedPct(pnl)}`}；已平倉淨利潤 ${p.netProfit >= 0 ? '' : '-'}${money(p.netProfit)}，累計出金 ${money(p.withdrawals)}。${pnl !== null && pnl >= 0 ? '資金錄得增長，成績建基於真實交易紀錄，而非短期運氣。' : '戶口目前低於投入本金，投資者應審慎考慮。'}`,
  });

  out.push({
    en: `Trade quality: ${p.totalTrades.toLocaleString('en-US')} closed trades at a ${p.winRate.toFixed(1)}% win rate${pf !== null ? ` and a profit factor of ${pf.toFixed(2)}` : ''}. The average winner is ${money(p.avgWin)} against an average loser of ${money(p.avgLoss)}${payoff !== null ? `, a reward-to-risk ratio of ${payoff.toFixed(2)}` : ''}. ${payoff !== null && payoff >= 1 ? 'Winners are larger than losers, so the strategy does not depend on a very high hit rate.' : p.winRate >= 60 ? 'The strategy relies on frequent small wins, so an occasional large loss can erase several gains.' : 'Both accuracy and payoff leave room for improvement.'} Expectancy is ${p.expectancy >= 0 ? '' : '-'}${money(p.expectancy)} per trade.`,
    zh: `交易質素：共 ${p.totalTrades.toLocaleString('en-US')} 筆平倉交易，勝率 ${p.winRate.toFixed(1)}%${pf !== null ? `，獲利因子 ${pf.toFixed(2)}` : ''}。平均盈利 ${money(p.avgWin)}，平均虧損 ${money(p.avgLoss)}${payoff !== null ? `，盈虧比 ${payoff.toFixed(2)}` : ''}。${payoff !== null && payoff >= 1 ? '盈利單大於虧損單，策略毋須依賴極高勝率。' : p.winRate >= 60 ? '策略以高頻小額盈利為主，偶發大額虧損可能抵銷多筆盈利。' : '準確度及盈虧比均有改善空間。'}每筆交易期望值為 ${p.expectancy >= 0 ? '' : '-'}${money(p.expectancy)}。`,
  });

  out.push({
    en: `Risk: the maximum drawdown is ${p.maxDrawdownPct.toFixed(2)}%, which we rate as ${ddLevel}. ${ddLevel === 'high' ? 'Followers should size conservatively and be prepared for deep temporary losses.' : 'Losses have been contained relative to the gains achieved.'} ${openCount > 0 ? `There ${openCount === 1 ? 'is' : 'are'} currently ${openCount} open position${openCount === 1 ? '' : 's'} with floating P&L of ${p.floating >= 0 ? '+' : '-'}${money(p.floating)}.` : 'No positions are open right now.'}`,
    zh: `風險：最大回撤為 ${p.maxDrawdownPct.toFixed(2)}%，屬${ddZh}水平。${ddLevel === 'high' ? '跟單者宜保守配置倉位，並預備承受較大短期虧損。' : '相對已取得的回報，虧損控制得宜。'}${openCount > 0 ? `目前持倉 ${openCount} 張，浮動盈虧 ${p.floating >= 0 ? '+' : '-'}${money(p.floating)}。` : '目前沒有持倉。'}`,
  });

  if (p.totalTrades > 0) {
    out.push({
      en: `Style: ${longShare.toFixed(0)}% of trades are long and ${(100 - longShare).toFixed(0)}% short, with an average holding time of ${formatDuration(p.avgHoldMs)}. ${top.length ? `Activity concentrates on ${top.map((s) => s.symbol).join(', ')}` : ''}${topProfit ? `, and ${topProfit.symbol} is the largest profit contributor at ${money(topProfit.profit)}.` : '.'}`,
      zh: `交易風格：好倉佔 ${longShare.toFixed(0)}%，淡倉佔 ${(100 - longShare).toFixed(0)}%，平均持倉時間 ${formatDuration(p.avgHoldMs)}。${top.length ? `主要交易品種為 ${top.map((s) => s.symbol).join('、')}` : ''}${topProfit ? `，其中 ${topProfit.symbol} 貢獻最多盈利，達 ${money(topProfit.profit)}。` : '。'}`,
    });
  }

  const verdicts: Record<Verdict, Bilingual> = {
    strong: {
      en: 'Overall comment: a strong, well-balanced signal. Returns are solid, drawdown is controlled and the profit factor shows a genuine edge. Suitable for followers seeking steady growth, ideally with a moderate allocation to start.',
      zh: '整體評論：表現強勁且平衡的信號。回報穩健、回撤受控，獲利因子顯示策略具備真實優勢。適合追求穩定增長的跟單者，建議先以適中資金開始。',
    },
    steady: {
      en: 'Overall comment: a steady signal with a positive track record. Results are acceptable but not exceptional; monitor drawdown and consistency over the coming weeks before increasing allocation.',
      zh: '整體評論：表現平穩、紀錄正面的信號。成績合格但未算突出，建議未來數週觀察回撤及穩定性，再考慮增加資金。',
    },
    caution: {
      en: 'Overall comment: proceed with caution. Either the drawdown is high or the account has not yet turned a sustained profit. Only allocate risk capital and keep position sizes small.',
      zh: '整體評論：需審慎跟單。此戶口回撤偏高或尚未錄得持續盈利，建議只投入可承受風險的資金，並控制倉位。',
    },
    early: {
      en: 'Overall comment: track record is still short. With fewer than ten closed trades, the statistics are not yet reliable; we recommend observing for longer before following.',
      zh: '整體評論：交易紀錄尚短。平倉交易少於十筆，統計數據未具參考價值，建議觀察更長時間再決定跟單。',
    },
  };
  out.push(verdicts[verdict]);
  return out;
}
