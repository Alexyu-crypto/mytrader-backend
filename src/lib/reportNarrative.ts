import type { Performance } from '@/lib/performance';

export interface Bilingual {
  en: string;
  zh: string;
}

function topSymbols(p: Performance): string[] {
  return p.symbols.filter((s) => s.profit > 0).slice(0, 3).map((s) => s.symbol);
}

export function buildOutlook(p: Performance, openCount: number): Bilingual[] {
  const symbols = topSymbols(p);
  const focusEn = symbols.length ? symbols.join(', ') : 'our core instruments';
  const focusZh = symbols.length ? symbols.join('、') : '核心交易品種';
  const ddCap = Math.max(5, Math.ceil(p.maxDrawdownPct * 1.1));
  const strong = p.winRate >= 50 && (p.profitFactor === null || p.profitFactor >= 1.2);

  const items: Bilingual[] = [
    {
      en: `In the coming period we will continue to build on the account's proven edge in ${focusEn}, deploying capital where our analysis shows the clearest opportunity and the most favourable risk-to-reward.`,
      zh: `下一期我們將繼續發揮本戶口在 ${focusZh} 上已驗證的優勢，把資金集中投放於分析顯示機會最明確、風險回報比最理想的市場。`,
    },
    strong
      ? {
          en: `With a ${p.winRate.toFixed(1)}% win rate${p.profitFactor !== null ? ` and a profit factor of ${p.profitFactor.toFixed(2)}` : ''}, the strategy enters the new period from a position of strength. Our priority is to compound these results steadily rather than chase short-term gains.`,
          zh: `憑藉 ${p.winRate.toFixed(1)}% 的勝率${p.profitFactor !== null ? `及 ${p.profitFactor.toFixed(2)} 的盈利因子` : ''}，策略以穩健姿態踏入新一期。我們的首要目標是穩步累積複利回報，而非追逐短期收益。`,
        }
      : {
          en: `We will sharpen entry timing and trade selection to lift accuracy, while preserving the reward-to-risk discipline that protects capital. Every refinement is tested before it reaches the live account.`,
          zh: `我們將進一步優化入市時機及交易篩選以提升準確度，同時堅守保障本金的風險回報紀律。每項改進均經過驗證，方會應用於實盤戶口。`,
        },
    {
      en: `Risk management remains our first commitment: we aim to keep peak-to-trough drawdown within ${ddCap}%, with disciplined position sizing and protective stops on every trade.`,
      zh: `風險管理始終是我們的首要承諾：我們致力把最大回撤控制在 ${ddCap}% 以內，每筆交易均嚴格控制倉位並設置保護性止損。`,
    },
  ];
  if (openCount > 0) {
    items.push({
      en: `${openCount} open position${openCount === 1 ? ' is' : 's are'} carried into the new period and will be actively managed in line with the plan.`,
      zh: `目前有 ${openCount} 張持倉延續至新一期，我們將按既定計劃積極管理。`,
    });
  }
  return items;
}

const money = (n: number) => `${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctAbs = (n: number) => `${Math.abs(n).toFixed(2)}%`;

function finalPnl(p: Performance): number {
  return p.netProfit + p.floating;
}

function finalPnlPct(p: Performance): number {
  const capital = p.deposits - p.withdrawals + p.estimatedOpening;
  return capital > 0 ? (finalPnl(p) / capital) * 100 : 0;
}

const signedMoney = (n: number) => `${n >= 0 ? '+' : '-'}${money(n)}`;

function headline(p: Performance): Bilingual {
  const g = finalPnlPct(p);
  const net = signedMoney(finalPnl(p));
  if (p.totalTrades === 0) {
    return {
      en: 'This account is at the very start of its journey. Our vision is to build its track record patiently, one disciplined decision at a time, so that the first results rest on a solid foundation rather than on luck.',
      zh: '本戶口正處於起步階段。我們的願景是以耐性逐步建立往績，每一個決定都恪守紀律，讓首批成績建基於穩固的基礎，而非運氣。',
    };
  }
  if (g >= 20) {
    return {
      en: `A final P&L of ${net} (${pctAbs(g)} on net capital) is a result we are proud of — but we do not treat it as permission to take more risk. Our vision is to protect these gains first and compound them steadily, so that strong numbers today become durable wealth tomorrow.`,
      zh: `最終盈虧 ${net}（佔淨投入本金 ${pctAbs(g)}）是我們引以為傲的成果，但這並不代表我們會因此承擔更大風險。我們的願景是先守住成果，再穩步複利增長，讓今天亮麗的數字成為明天持久的財富。`,
    };
  }
  if (g >= 5) {
    return {
      en: `The account's final P&L stands at ${net}, ${pctAbs(g)} on net capital. This steady progress reflects the approach we believe in: consistent, measured gains that accumulate over time. Our vision is to extend this record period after period without departing from the discipline that produced it.`,
      zh: `戶口最終盈虧為 ${net}，佔淨投入本金 ${pctAbs(g)}。這份穩健的進展正體現了我們堅信的理念：持續而有節制的回報，隨時間累積。我們的願景是延續這份往績，期期如是，絕不偏離成就它的紀律。`,
    };
  }
  if (g > -5) {
    return {
      en: `The final P&L is close to break-even (${net}, ${g >= 0 ? '+' : '-'}${pctAbs(g)}), with capital essentially preserved. In a period like this, protecting the base is itself an achievement. Our vision is to turn this stable foundation into clear, consistent growth as higher-conviction opportunities emerge.`,
      zh: `最終盈虧大致持平（${net}，${g >= 0 ? '+' : '-'}${pctAbs(g)}），本金基本得以保全。在這樣的週期中，守住本金本身已是一種成就。我們的願景是在把握更高確定性機會的同時，把這穩固的基礎轉化為清晰而持續的增長。`,
    };
  }
  if (g > -15) {
    return {
      en: `We will be direct: the final P&L is ${net}, down ${pctAbs(g)} on net capital, and that is not the standard we hold ourselves to. Our vision is a disciplined recovery — reduced exposure, stricter trade selection and a clear path back to new highs, without chasing losses.`,
      zh: `我們必須坦白：戶口最終盈虧為 ${net}，佔淨投入本金下跌 ${pctAbs(g)}，這並非我們對自己的要求。我們的願景是有紀律地修復——降低風險敞口、更嚴格篩選交易，以清晰的步伐重返新高，絕不急於追回虧損。`,
    };
  }
  return {
    en: `The final P&L is ${net}, down ${pctAbs(g)} on net capital, and we take full responsibility for this result. Our immediate vision is capital protection: smaller positions, tighter risk limits and a full review of the strategy before exposure is increased again. Earning back trust comes before earning back returns.`,
    zh: `戶口最終盈虧為 ${net}，佔淨投入本金下跌 ${pctAbs(g)}，我們對此結果承擔全部責任。當前首要願景是保護本金：縮減倉位、收緊風險上限，並在重新加大投入前全面檢討策略。先重建信任，再追回回報。`,
  };
}

function riskLine(p: Performance): Bilingual | null {
  if (p.totalTrades === 0) return null;
  const dd = p.maxDrawdownPct;
  if (dd < 5) {
    return {
      en: `Risk has stayed tightly controlled, with a maximum drawdown of only ${pctAbs(dd)}. We intend to keep it that way — low volatility is part of the value we deliver.`,
      zh: `風險一直受到嚴格控制，最大回撤僅 ${pctAbs(dd)}。我們會繼續保持——低波動本身就是我們提供的價值之一。`,
    };
  }
  if (dd < 20) {
    return {
      en: `The maximum drawdown of ${pctAbs(dd)} sits within an acceptable range, but we are working to narrow it further so that returns arrive with a smoother ride.`,
      zh: `${pctAbs(dd)} 的最大回撤處於可接受範圍，但我們正致力進一步收窄，讓回報來得更平穩。`,
    };
  }
  return {
    en: `A maximum drawdown of ${pctAbs(dd)} is deeper than we want. Bringing volatility down through smaller sizing and firmer stop discipline is now a top priority.`,
    zh: `${pctAbs(dd)} 的最大回撤超出我們的期望。透過縮減倉位及更嚴格的止損紀律降低波動，現已成為首要任務。`,
  };
}

function momentumLine(p: Performance): Bilingual | null {
  if (p.totalTrades === 0) return null;
  const last = p.monthly[p.monthly.length - 1];
  const best = [...p.symbols].sort((a, b) => b.profit - a.profit)[0];
  const edgeEn = best && best.profit > 0 ? ` ${best.symbol} has been our strongest market, and it remains central to the plan.` : '';
  const edgeZh = best && best.profit > 0 ? ` ${best.symbol} 一直是我們表現最好的市場，並將繼續是計劃的核心。` : '';
  const winEn = `${p.winRate.toFixed(1)}% of trades closed in profit`;
  const winZh = `${p.winRate.toFixed(1)}% 的交易以盈利平倉`;
  if (!last) return { en: `${winEn}.${edgeEn}`, zh: `${winZh}。${edgeZh}` };
  if (last.value >= 0) {
    return {
      en: `${winEn}, and the latest month finished ${pctAbs(last.value)} higher — momentum we intend to build on carefully.${edgeEn}`,
      zh: `${winZh}，最近一個月上升 ${pctAbs(last.value)}——我們會審慎地延續這股動力。${edgeZh}`,
    };
  }
  return {
    en: `${winEn}, though the latest month closed ${pctAbs(last.value)} lower. We treat that as a signal to tighten, not to force trades.${edgeEn}`,
    zh: `${winZh}，但最近一個月下跌 ${pctAbs(last.value)}。我們視之為收緊操作的信號，而非勉強入市的理由。${edgeZh}`,
  };
}

function capitalLine(p: Performance): Bilingual {
  const g = finalPnlPct(p);
  const disclaimer = {
    en: ' As always, past performance does not guarantee future results, and any additional allocation should match your own risk appetite.',
    zh: '一如既往，過往表現並不保證未來回報，任何追加資金均應配合閣下自身的風險承受能力。',
  };
  let body: Bilingual;
  if (p.totalTrades === 0) {
    body = {
      en: 'Partners who join at the beginning share in the full compounding journey from day one. We welcome you to set the capital level that lets this strategy work at its intended scale.',
      zh: '在起步階段加入的合作夥伴，可由第一天起分享完整的複利增長旅程。我們誠意邀請您訂立合適的資金規模，讓策略以預期的規模運作。',
    };
  } else if (g >= 20) {
    body = {
      en: `With a final P&L of ${signedMoney(finalPnl(p))} (${pctAbs(g)}) already delivered, capital working in this account has been rewarded. Because growth compounds on the base it starts from, a larger allocation today lets future gains build on a bigger foundation — we warmly welcome partners who wish to increase their investment.`,
      zh: `本戶口最終盈虧已達 ${signedMoney(finalPnl(p))}（${pctAbs(g)}），投入的資金已獲得回饋。由於複利以本金為基礎增長，今天提高投入，未來的回報便能建立於更大的基礎上——我們熱切歡迎有意增加投資的合作夥伴。`,
    };
  } else if (g >= 5) {
    body = {
      en: 'Steady, repeatable growth is exactly where additional capital works hardest: the same discipline applied to a larger base produces proportionally larger results. Partners considering a top-up can do so knowing the process behind these numbers stays unchanged.',
      zh: '穩定而可複製的增長，正是追加資金最能發揮作用之處：同樣的紀律應用於更大的本金，成果亦按比例放大。考慮增加資金的合作夥伴，可放心這些成績背後的操作流程將維持不變。',
    };
  } else if (g > -5) {
    body = {
      en: 'A preserved capital base at a quiet point in the cycle is often the most considered moment to add funds, positioning the account to benefit fully when stronger trends return. We are happy to discuss a top-up plan that suits your goals.',
      zh: '在市場週期較平靜、本金得以保全之時，往往是最審慎的加資時機，讓戶口在趨勢轉強時能充分受惠。我們樂意與您商討切合目標的加資方案。',
    };
  } else {
    body = {
      en: 'For partners with a long-term view, a drawdown can be a lower-cost entry point, since new capital starts working from a reduced level. If you are considering adding funds, we suggest doing so gradually and will gladly walk you through our recovery plan first.',
      zh: '對具長遠目光的合作夥伴而言，回撤期可以是成本較低的入場時機，因為新資金由較低水平開始運作。如您考慮追加資金，我們建議分階段進行，並樂意先向您詳細講解修復計劃。',
    };
  }
  return { en: body.en + disclaimer.en, zh: body.zh + disclaimer.zh };
}

export interface VisionQuote {
  en: string;
  zh: string;
  author: string;
  authorZh: string;
}

export function buildVisionQuote(p: Performance): VisionQuote {
  const g = finalPnlPct(p);
  if (p.totalTrades === 0) {
    return { en: 'The journey of a thousand miles begins with a single step.', zh: '千里之行，始於足下。', author: 'Lao Tzu', authorZh: '老子' };
  }
  if (g >= 20) {
    return { en: 'Rule No. 1: Never lose money. Rule No. 2: Never forget Rule No. 1.', zh: '第一條規則：永遠不要虧錢。第二條規則：永遠不要忘記第一條。', author: 'Warren Buffett', authorZh: '巴菲特' };
  }
  if (g >= 5) {
    return { en: 'The first rule of compounding: never interrupt it unnecessarily.', zh: '複利的第一條規則：切勿無故中斷它。', author: 'Charlie Munger', authorZh: '查理・芒格' };
  }
  if (g > -5) {
    return { en: 'The stock market is a device for transferring money from the impatient to the patient.', zh: '市場是一個把金錢從缺乏耐性的人，轉移到有耐性的人手上的工具。', author: 'Warren Buffett', authorZh: '巴菲特' };
  }
  if (g > -15) {
    return { en: "Don't focus on making money; focus on protecting what you have.", zh: '不要只專注於賺錢，要專注於保護你已擁有的。', author: 'Paul Tudor Jones', authorZh: '保羅・都鐸・瓊斯' };
  }
  return { en: 'Be fearful when others are greedy, and greedy when others are fearful.', zh: '別人貪婪時我恐懼，別人恐懼時我貪婪。', author: 'Warren Buffett', authorZh: '巴菲特' };
}

export function buildVision(p: Performance): Bilingual[] {
  const closing: Bilingual = finalPnl(p) >= 0
    ? {
        en: 'Every position we take is measured against one question — does it protect and grow the trust our investors place in us? With transparent, real-time reporting, we look forward to the next chapter with confidence.',
        zh: '我們每一個倉位都以同一個問題衡量——它能否守護並增長投資者對我們的信任？憑藉透明及實時的報告，我們滿懷信心迎接下一個篇章。',
      }
    : {
        en: 'You will see every step of the recovery in this report, in real time. Transparency matters most when results are difficult, and we are committed to earning your confidence back trade by trade.',
        zh: '修復的每一步都會實時呈現在這份報告中。成績艱難之時，透明更顯重要，我們承諾以每一筆交易重新贏得您的信心。',
      };
  return [headline(p), riskLine(p), momentumLine(p), capitalLine(p), closing].filter((b): b is Bilingual => b !== null);
}
