import type { ReactNode } from 'react';
import { Activity, Check, HeartPulse, History, LayoutGrid, Wallet, type LucideIcon } from 'lucide-react';
import type { Lang, Localized } from '@/hooks/useLandingLang';

interface ShowcaseCopy {
  title: string;
  badge?: string;
  pain?: string;
  text: string;
  points: string[];
}

export interface Showcase {
  icon: LucideIcon;
  copy: Localized<ShowcaseCopy>;
  stats?: { value: string; label: Localized<string>; tone?: string }[];
  image?: string;
  preview?: (lang: Lang) => ReactNode;
  alt: string;
}

export const SOLUTION_SHOWCASES: Showcase[] = [
  {
    icon: Wallet,
    copy: {
      en: {
        title: 'Funding Reconciliation',
        badge: 'Only here',
        pain: 'Deposits and withdrawals drag on, and the totals never match.',
        text: 'Pending, confirmed and rejected totals, overdue requests flagged red, and an export for your accountant. Tracked until the money lands.',
        points: ['Pending, confirmed and rejected totals', 'Overdue requests turn red automatically', 'Risk rules per broker', 'Export for your accountant'],
      },
      zh: {
        title: '出入金核對',
        badge: '市面獨有',
        pain: '出入金拖拖拉拉，數目永遠對唔上。',
        text: 'Pending / Confirmed / Rejected 總數 + 逾期自動標紅 + 匯出俾會計。追到到帳為止。',
        points: ['待處理、已到帳、已拒絕總數一目了然', '逾期申請自動標紅', '按經紀商設定風控規則', '一鍵匯出俾會計'],
      },
    },
    stats: [
      { value: 'Pending', label: { en: 'Awaiting', zh: '待處理' }, tone: 'text-amber-300' },
      { value: 'Confirmed', label: { en: 'Landed', zh: '已到帳' }, tone: 'text-emerald-400' },
      { value: 'Rejected', label: { en: 'Flagged', zh: '已拒絕' }, tone: 'text-red-400' },
    ],
    image: 'image copy 6.png',
    alt: 'Funding Reconciliation page with deposit and withdrawal summaries',
  },
  {
    icon: HeartPulse,
    copy: {
      en: {
        title: 'EA Health',
        pain: 'A terminal drops and nobody notices until the move is gone.',
        text: 'The moment a terminal drops, Telegram and a sound alarm go off. No more staring at your VPS all day.',
        points: ['Online, needs-attention and never-connected counts', 'Missed-copy alarm with sound and desktop alerts', 'Connection latency by broker or by VPS', 'Telegram alerts straight to your phone'],
      },
      zh: {
        title: 'EA 健康監察',
        pain: '終端甩咗都唔知，醒來已經錯過行情。',
        text: '終端一甩，Telegram + 聲音即時響，唔使成日睇住 VPS。',
        points: ['在線、需處理、從未連線一眼睇晒', '甩單即時聲音及桌面警報', '按券商或 VPS 睇連線延遲', 'Telegram 即時推送到手機'],
      },
    },
    stats: [
      { value: '42ms', label: { en: 'Fastest link', zh: '最快連線' }, tone: 'text-emerald-400' },
      { value: '89ms', label: { en: 'Healthy', zh: '正常' }, tone: 'text-cyan-300' },
      { value: '209ms', label: { en: 'Needs attention', zh: '需處理' }, tone: 'text-amber-300' },
    ],
    image: 'image copy 7.png',
    alt: 'EA Health page with online status, missed copy alarm and latency',
  },
  {
    icon: Activity,
    copy: {
      en: {
        title: 'Copy Groups + Live Positions',
        pain: 'Hundreds of accounts scattered across brokers, impossible to watch.',
        text: 'Every group, master and follower in one table: floating P&L, copy delay, buy and sell lots. Close a position, or a whole group, in one click.',
        points: ['Pause, resume or close a whole group', 'Copy delay on every follower trade', 'Import groups from Excel', 'Filter by master or follower'],
      },
      zh: {
        title: '跟單組別 + 實時持倉',
        pain: '幾百個戶口分散喺唔同券商，根本睇唔晒。',
        text: '300 個戶口一表睇晒浮動盈虧、跟單延遲、買賣手數，一鍵平倉。',
        points: ['整組暫停、恢復或平倉', '每張跟單都顯示延遲', '從 Excel 匯入組別', '按主帳戶或跟單帳戶篩選'],
      },
    },
    stats: [
      { value: '3', label: { en: 'Active groups', zh: '活躍組別' } },
      { value: '3', label: { en: 'Brokers', zh: '券商' } },
      { value: '5', label: { en: 'Open positions', zh: '持倉' } },
    ],
    image: 'image copy 3.png',
    alt: 'Live Positions table with open trades from several accounts',
  },
];

export const TOOL_SHOWCASES: Showcase[] = [
  {
    icon: LayoutGrid,
    copy: {
      en: {
        title: 'Trader Manager',
        text: 'Trade many master accounts at the same moment. Prepare every order in advance, then send when the timing is right.',
        points: ['Ten or more pre-set order windows at a glance', 'Send one by one or all at once', 'Fill time limit with retry or cancel', 'Close all, buys only or sells only'],
      },
      zh: {
        title: '交易經理',
        text: '預先設定多個帳戶嘅產品及手數，時機一到即一併下單。',
        points: ['十個以上預設下單視窗一眼睇晒', '逐張或一併下單', '成交時限，可重試或取消', '一併平倉、只平買單或賣單'],
      },
    },
    image: 'image copy.png',
    alt: 'Trader Manager screen with several pre-set order windows',
  },
  {
    icon: History,
    copy: {
      en: {
        title: 'Trade History',
        text: 'Closed trades, deposits and withdrawals from every account, with open and close delay recorded for each copied trade.',
        points: ['Commission and swap totals', 'Search by date, account, symbol, buy or sell', 'Open and close delay for each copied trade', 'Export to Excel'],
      },
      zh: {
        title: '交易記錄',
        text: '所有帳戶嘅平倉及出入金記錄，每張跟單都有開平倉延遲，證據在手。',
        points: ['佣金及隔夜利息總數', '按日期、帳戶、品種、買賣模糊搜尋', '每張跟單開平倉延遲', '匯出 Excel'],
      },
    },
    image: 'image copy 4.png',
    alt: 'Trade History page with closed trades and copy delays',
  },
];

export function ShowcaseList({ items, lang }: { items: Showcase[]; lang: Lang }) {
  return (
    <div className="space-y-24 md:space-y-32">
      {items.map((s, i) => (
        <ShowcaseRow key={s.alt} showcase={s} lang={lang} flip={i % 2 === 1} index={i} />
      ))}
    </div>
  );
}

function ShowcaseRow({ showcase: s, lang, flip, index }: { showcase: Showcase; lang: Lang; flip: boolean; index: number }) {
  const Icon = s.icon;
  const c = s.copy[lang];
  return (
    <div className={`grid items-center gap-10 lg:gap-14 ${flip ? 'lg:grid-cols-[7fr_5fr]' : 'lg:grid-cols-[5fr_7fr]'}`}>
      <div className={flip ? 'lg:order-2' : ''}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-slate-600">0{index + 1}</span>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
            <Icon className="h-5 w-5" />
          </div>
          {c.badge && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">{c.badge}</span>}
        </div>
        {c.pain && (
          <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-red-200/80">
            <span className="mt-0.5 shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
              {lang === 'zh' ? '痛點' : 'Pain'}
            </span>
            {c.pain}
          </p>
        )}
        <h3 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl">{c.title}</h3>
        <p className="mt-4 leading-relaxed text-slate-300">{c.text}</p>
        {s.stats && (
          <div className="mt-6 grid grid-cols-3 gap-2">
            {s.stats.map((st) => (
              <div key={st.label.en} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-cyan-500/20">
                <p className={`font-mono text-lg font-semibold ${st.tone ?? 'text-white'}`}>{st.value}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{st.label[lang]}</p>
              </div>
            ))}
          </div>
        )}
        <ul className="mt-6 space-y-3">
          {c.points.map((p) => (
            <li key={p} className="flex gap-3 text-sm leading-relaxed text-slate-300">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className={`group relative ${flip ? 'lg:order-1' : ''}`}>
        <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-cyan-500/10 opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0D0D0D] shadow-2xl shadow-black/60 transition-transform duration-500 group-hover:-translate-y-1">
          <div className="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.03] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-3 truncate font-mono text-[11px] text-slate-500">{c.title}</span>
          </div>
          {s.image ? <img src={encodeURI(`/images/features/${s.image}`)} alt={s.alt} loading="lazy" className="block w-full" /> : s.preview?.(lang)}
        </div>
      </div>
    </div>
  );
}
