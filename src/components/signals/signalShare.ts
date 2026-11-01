import type { ShareProps } from '@/components/share/ShareMenu';
import { reportUrl } from '@/lib/accountData';
import { renderSignalImage } from '@/lib/shareImage';
import { pct, weeksRunning, type Signal } from '@/components/signals/SignalCard';

export function signalShare(signal: Signal, agentSlug?: string | null): ShareProps {
  const { account, perf } = signal;
  const weeks = weeksRunning(perf, account);
  const headline = perf.pnlPct !== null ? `${pct(perf.pnlPct)} P&L` : `${pct(perf.growthPct)} growth`;
  const headlineZh = perf.pnlPct !== null ? `盈虧率 ${pct(perf.pnlPct)}` : `增長 ${pct(perf.growthPct)}`;
  return {
    heading: 'Share this signal 分享信號',
    content: {
      url: reportUrl(account.account_name, agentSlug),
      campaign: 'signal_share',
      title: `${account.account_name} · ${headline}`,
      text: `${account.account_name} trading signal: ${headline}, ${perf.maxDrawdownPct.toFixed(1)}% max drawdown, ${perf.winRate.toFixed(0)}% win rate over ${weeks} weeks. 交易信號：${headlineZh}，最大回撤 ${perf.maxDrawdownPct.toFixed(1)}%，勝率 ${perf.winRate.toFixed(0)}%。`,
    },
    note: account.report_public
      ? undefined
      : 'This report is members-only, so visitors will be asked to sign up for free first. 此報告只限成員，訪客需先免費註冊。',
    image: {
      filename: `${account.account_name}-signal.png`,
      render: () =>
        renderSignalImage({
          name: account.account_name,
          subtitle: `${account.broker} · ${account.platform}`,
          growthPct: perf.growthPct,
          curve: perf.curve.map((p) => p.growth),
          stats: [
            ['Max DD 回撤', `${perf.maxDrawdownPct.toFixed(1)}%`],
            ['Win rate 勝率', `${perf.winRate.toFixed(0)}%`],
            ['Weeks 週數', String(weeks)],
            ['Trades 交易', perf.totalTrades.toLocaleString('en-US')],
          ],
          footer: 'Past performance is not indicative of future results. 過往表現不代表將來回報。',
        }),
    },
  };
}
