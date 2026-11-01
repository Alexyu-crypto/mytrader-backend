import { ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import type { Lang, Localized } from '@/hooks/useLandingLang';

const COPY: Localized<{ tagline: string; strategies: string; risk: string }> = {
  en: {
    tagline: 'MyTrader Tools · MT4/MT5 Multi-Broker Bridge',
    strategies: 'Strategies & Signals',
    risk: 'Trading involves risk. Does not hold client funds.',
  },
  zh: {
    tagline: 'MyTrader Tools · MT4/MT5 多經紀商橋接',
    strategies: '策略與信號',
    risk: '交易涉及風險。本平台不持有客戶資金。',
  },
};

export function LandingFooter({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-500 sm:px-6 md:flex-row">
        <div className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          <span>{c.tagline}</span>
        </div>
        <a href="#/strategies" className="text-xs transition-colors hover:text-cyan-400">
          {c.strategies}
        </a>
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-500" />
          {c.risk}
        </p>
      </div>
    </footer>
  );
}
