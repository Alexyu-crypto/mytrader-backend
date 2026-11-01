import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string | null;
}

export interface SymbolNews {
  symbol: string;
  en: NewsItem[];
  zh: NewsItem[];
}

const isItem = (x: unknown): x is NewsItem => {
  const i = x as NewsItem;
  return !!i && typeof i.title === 'string' && typeof i.link === 'string' && /^https:\/\//.test(i.link);
};

const byDate = (a: NewsItem, b: NewsItem) => (b.published ? Date.parse(b.published) : 0) - (a.published ? Date.parse(a.published) : 0);

export function useMarketNews(symbols: string[]) {
  const key = symbols.join(',');
  const [news, setNews] = useState<Record<string, SymbolNews>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error: err } = await supabase.functions.invoke('market-news', { body: { symbols: key.split(',') } });
      if (cancelled) return;
      if (err || !Array.isArray(data?.news)) {
        setError('News is unavailable right now');
      } else {
        const map: Record<string, SymbolNews> = {};
        for (const n of data.news) {
          if (typeof n?.symbol !== 'string') continue;
          map[n.symbol] = {
            symbol: n.symbol,
            en: (Array.isArray(n.en) ? n.en.filter(isItem) : []).sort(byDate),
            zh: (Array.isArray(n.zh) ? n.zh.filter(isItem) : []).sort(byDate),
          };
        }
        setNews(map);
        setError('');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { news, loading, error };
}
