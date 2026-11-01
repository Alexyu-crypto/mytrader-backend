const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string | null;
}

const INSTRUMENTS: Array<{ keys: string[]; en: string; zh: string }> = [
  { keys: ["XAU", "GOLD"], en: "gold price", zh: "金價" },
  { keys: ["XAG", "SILVER"], en: "silver price", zh: "銀價" },
  { keys: ["BTC"], en: "Bitcoin price", zh: "比特幣" },
  { keys: ["ETH"], en: "Ethereum price", zh: "以太幣" },
  { keys: ["US30", "DJ30", "DJI", "WS30"], en: "Dow Jones", zh: "道指" },
  { keys: ["NAS100", "US100", "USTEC", "NDX"], en: "Nasdaq", zh: "納指" },
  { keys: ["SPX500", "US500", "SP500"], en: "S&P 500", zh: "標普500" },
  { keys: ["GER40", "DE40", "GER30", "DAX"], en: "DAX index", zh: "德國DAX指數" },
  { keys: ["UK100", "FTSE"], en: "FTSE 100", zh: "富時100" },
  { keys: ["JP225", "JPN225", "NIKKEI"], en: "Nikkei 225", zh: "日經指數" },
  { keys: ["HK50", "HSI", "HK33"], en: "Hang Seng index", zh: "恒生指數" },
  { keys: ["UKOIL", "BRENT", "XBR"], en: "Brent crude oil", zh: "布蘭特原油" },
  { keys: ["USOIL", "WTI", "XTI", "CL"], en: "crude oil price", zh: "原油價格" },
  { keys: ["XNG", "NGAS", "NATGAS"], en: "natural gas price", zh: "天然氣價格" },
];

const CURRENCIES: Record<string, string> = {
  USD: "美元", EUR: "歐元", GBP: "英鎊", JPY: "日圓", AUD: "澳元", NZD: "紐元",
  CAD: "加元", CHF: "瑞士法郎", CNH: "人民幣", CNY: "人民幣", HKD: "港元", SGD: "新加坡元",
};

function queriesFor(symbol: string): { en: string; zh: string } | null {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const inst of INSTRUMENTS) {
    if (inst.keys.some((k) => s.startsWith(k))) return { en: inst.en, zh: inst.zh };
  }
  const base = s.slice(0, 3);
  const quote = s.slice(3, 6);
  if (CURRENCIES[base] && CURRENCIES[quote]) {
    return { en: `${base}/${quote} forex`, zh: `${CURRENCIES[base]} ${CURRENCIES[quote]} 匯率` };
  }
  return null;
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

async function fetchNews(query: string, lang: "en" | "zh", limit: number): Promise<NewsItem[]> {
  const locale = lang === "en" ? "hl=en-US&gl=US&ceid=US:en" : "hl=zh-HK&gl=HK&ceid=HK:zh-Hant";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&${locale}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketNews/1.0)" } });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, limit * 2).flatMap((item) => {
    const link = tag(item, "link");
    if (!/^https:\/\//.test(link)) return [];
    const source = tag(item, "source");
    let title = tag(item, "title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const pub = tag(item, "pubDate");
    const date = pub ? new Date(pub) : null;
    return title ? [{ title, link, source, published: date && !isNaN(date.getTime()) ? date.toISOString() : null }] : [];
  }).slice(0, limit);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.symbols) ? body.symbols : [];
    const symbols = [...new Set(raw.filter((s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9._#-]{1,20}$/.test(s)))].slice(0, 5);

    const results = await Promise.all(symbols.map(async (symbol) => {
      const q = queriesFor(symbol);
      if (!q) return { symbol, en: [], zh: [] };
      const [en, zh] = await Promise.all([
        fetchNews(q.en, "en", 4).catch(() => []),
        fetchNews(q.zh, "zh", 4).catch(() => []),
      ]);
      return { symbol, en, zh };
    }));

    return new Response(JSON.stringify({ news: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Could not load news" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
