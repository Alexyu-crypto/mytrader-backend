export type WidgetLang = 'en' | 'zh' | 'zh-cn';
export type WidgetThemeKey = 'standard' | 'red' | 'green' | 'gray' | 'gray2' | 'dark' | 'custom';

export interface WidgetTheme {
  bg: string;
  text: string;
  muted: string;
  border: string;
  panel: string;
  accent: string;
  accentText: string;
  up: string;
  down: string;
}

export interface WidgetOptions {
  account: string;
  lang: WidgetLang;
  theme: WidgetThemeKey;
  color: string;
  frame: boolean;
  slug: string | null;
}

export const DEFAULT_CUSTOM_COLOR = '#0e7490';
export const WIDGET_SIZE = { width: 300, height: 400 };

const LIGHT = { bg: '#ffffff', text: '#0f172a', muted: '#64748b', border: '#e2e8f0', panel: '#f8fafc', up: '#047857', down: '#b91c1c' };

function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0f172a' : '#ffffff';
}

export const isHexColor = (v: string | null): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v);

export function widgetTheme(key: WidgetThemeKey, custom: string): WidgetTheme {
  switch (key) {
    case 'red':
      return { ...LIGHT, accent: '#b91c1c', accentText: '#ffffff' };
    case 'green':
      return { ...LIGHT, accent: '#047857', accentText: '#ffffff' };
    case 'gray':
      return { ...LIGHT, bg: '#f1f5f9', panel: '#ffffff', border: '#cbd5e1', accent: '#475569', accentText: '#ffffff' };
    case 'gray2':
      return { ...LIGHT, bg: '#e5e7eb', panel: '#f3f4f6', border: '#d1d5db', text: '#111827', muted: '#4b5563', accent: '#1f2937', accentText: '#ffffff' };
    case 'dark':
      return { bg: '#0f172a', text: '#f1f5f9', muted: '#94a3b8', border: '#1e293b', panel: '#1e293b', accent: '#1e293b', accentText: '#67e8f9', up: '#34d399', down: '#f87171' };
    case 'custom': {
      const accent = isHexColor(custom) ? custom : DEFAULT_CUSTOM_COLOR;
      return { ...LIGHT, accent, accentText: readableOn(accent) };
    }
    default:
      return { ...LIGHT, accent: '#1d4ed8', accentText: '#ffffff' };
  }
}

export const THEME_LABELS: [WidgetThemeKey, string][] = [
  ['standard', 'Standard 標準'],
  ['red', 'Red 紅色'],
  ['green', 'Green 綠色'],
  ['gray', 'Gray 灰色'],
  ['gray2', 'Gray 2 灰色 2'],
  ['dark', 'Dark 深色'],
  ['custom', 'Custom 自訂'],
];

export const LANG_LABELS: [WidgetLang, string][] = [
  ['en', 'English'],
  ['zh', '繁體中文'],
  ['zh-cn', '简体中文'],
];

const TEXT = {
  en: {
    pnl: 'P&L',
    profitFactor: 'Profit factor',
    todayOpens: 'Opened today',
    totalOpens: 'Total opened',
    weeks: 'Weeks',
    equity: 'Equity',
    totalFunds: 'Master + followers funds (USD)',
    followers: 'followers',
    online: 'Live',
    offline: 'Offline',
    view: 'View signal',
    loading: 'Loading signal…',
    notFound: 'Signal not available',
  },
  zh: {
    pnl: '盈虧率',
    profitFactor: '盈利因子',
    todayOpens: '今日開單',
    totalOpens: '總開單',
    weeks: '運行週數',
    equity: '淨值',
    totalFunds: '主賬戶+追隨者總資金 (USD)',
    followers: '位追隨者',
    online: '運行中',
    offline: '離線',
    view: '查看信號',
    loading: '載入信號中…',
    notFound: '找不到此信號',
  },
  'zh-cn': {
    pnl: '盈亏率',
    profitFactor: '盈利因子',
    todayOpens: '今日开单',
    totalOpens: '总开单',
    weeks: '运行周数',
    equity: '净值',
    totalFunds: '主账户+追随者总资金 (USD)',
    followers: '位追随者',
    online: '运行中',
    offline: '离线',
    view: '查看信号',
    loading: '载入信号中…',
    notFound: '找不到此信号',
  },
} as const;

export const widgetText = (lang: WidgetLang) => TEXT[lang];

const LANGS = LANG_LABELS.map(([k]) => k);
const THEMES = THEME_LABELS.map(([k]) => k);

export function parseWidgetOptions(search: string): WidgetOptions {
  const q = new URLSearchParams(search);
  const lang = q.get('lang') as WidgetLang;
  const theme = q.get('theme') as WidgetThemeKey;
  const color = q.get('c');
  const slug = q.get('s');
  return {
    account: q.get('a') ?? '',
    lang: LANGS.includes(lang) ? lang : 'zh',
    theme: THEMES.includes(theme) ? theme : 'standard',
    color: isHexColor(color) ? color : DEFAULT_CUSTOM_COLOR,
    frame: q.get('frame') !== '0',
    slug: slug && /^[a-z0-9-]{3,30}$/i.test(slug) ? slug : null,
  };
}

export function widgetUrl(origin: string, o: WidgetOptions): string {
  const q = new URLSearchParams({ a: o.account, lang: o.lang, theme: o.theme });
  if (o.theme === 'custom') q.set('c', o.color);
  if (!o.frame) q.set('frame', '0');
  if (o.slug) q.set('s', o.slug);
  return `${origin}/widget.html?${q.toString()}`;
}

export function signalPageUrl(origin: string, account: string, slug: string | null): string {
  return `${origin}${slug ? `/a/${slug}/report/` : '/report/'}${encodeURIComponent(account)}`;
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function widgetEmbedCode(origin: string, o: WidgetOptions): string {
  const src = escapeAttr(widgetUrl(origin, o));
  const title = escapeAttr(`${o.account} signal`);
  return `<iframe src="${src}" width="${WIDGET_SIZE.width}" height="${WIDGET_SIZE.height}" style="border:0;max-width:100%;" loading="lazy" title="${title}"></iframe>`;
}
