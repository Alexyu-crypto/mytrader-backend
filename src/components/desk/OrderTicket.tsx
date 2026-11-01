import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, WifiOff } from 'lucide-react';
import { useLiveQuote } from '@/hooks/useDesk';
import { TickChart } from '@/components/desk/TickChart';
import { ConfirmOrderDialog } from '@/components/desk/ConfirmOrderDialog';
import { PENDING_TYPES, quoteStaleMs, SYMBOL_PATTERN, fmtPrice, loadDeskSymbols, loadLastSymbol, matchBrokerSymbol, saveLastSymbol, type DeskOrderInput, type PendingType } from '@/lib/desk';

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white placeholder:font-sans placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none transition-colors';

const num = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function OrderTicket({ account, online, cloud, defaultSymbol, onSent }: { account: string; online: boolean; cloud?: boolean; defaultSymbol: string; onSent: () => void }) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbolInput, setSymbolInput] = useState(() => loadLastSymbol(account) ?? defaultSymbol);
  const [symbol, setSymbol] = useState(() => loadLastSymbol(account) ?? defaultSymbol);
  const [mode, setMode] = useState<'market' | 'pending'>('market');
  const [pendingType, setPendingType] = useState<PendingType>('BUY_LIMIT');
  const [lots, setLots] = useState('0.01');
  const [price, setPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [comment, setComment] = useState('');
  const [confirm, setConfirm] = useState<DeskOrderInput | null>(null);
  const [now, setNow] = useState(Date.now());

  const { quote, ticks } = useLiveQuote(account, symbol);

  useEffect(() => {
    let cancelled = false;
    loadDeskSymbols(account).then((list) => {
      if (cancelled) return;
      setSymbols(list);
      if (loadLastSymbol(account)) return;
      const resolved = matchBrokerSymbol(defaultSymbol, list);
      setSymbol((s) => (s === defaultSymbol ? resolved : s));
      setSymbolInput((s) => (s === defaultSymbol ? resolved : s));
    });
    return () => {
      cancelled = true;
    };
  }, [account, defaultSymbol]);

  useEffect(() => {
    const start = loadLastSymbol(account) ?? defaultSymbol;
    setSymbolInput(start);
    setSymbol(start);
  }, [account, defaultSymbol]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const digits = quote?.digits ?? 2;
  const step = quote?.vol_step && quote.vol_step > 0 ? quote.vol_step : 0.01;
  const stale = !quote || now - new Date(quote.quoted_at).getTime() > quoteStaleMs(!!cloud);
  const spread = quote ? Math.round((quote.ask - quote.bid) * Math.pow(10, digits)) : null;
  const lotValue = num(lots);
  const symbolValid = SYMBOL_PATTERN.test(symbol);

  const lastBid = ticks.length > 1 ? ticks[ticks.length - 2].bid : null;
  const dir = quote && lastBid != null ? (quote.bid > lastBid ? 'up' : quote.bid < lastBid ? 'down' : '') : '';

  const blockReason = useMemo(() => {
    if (!online) return 'Account offline 帳戶離線';
    if (!symbolValid) return 'Choose a symbol 請選擇產品';
    if (lotValue <= 0) return 'Enter a volume 請輸入手數';
    if (mode === 'pending' && num(price) <= 0) return 'Enter a price 請輸入價格';
    return '';
  }, [online, symbolValid, lotValue, mode, price]);

  const adjustLots = (dirn: 1 | -1) => {
    const next = Math.max(step, Math.round((lotValue + dirn * step) / step) * step);
    setLots(next.toFixed(Math.max(2, (String(step).split('.')[1] ?? '').length)));
  };

  const applySymbol = () => {
    const s = symbolInput.trim();
    if (!SYMBOL_PATTERN.test(s)) return;
    setSymbol(s);
    saveLastSymbol(account, s);
  };

  const ask = (type: DeskOrderInput['type']) =>
    setConfirm({ account, symbol, type, lots: lotValue, price: mode === 'pending' ? num(price) : 0, sl: num(sl), tp: num(tp), comment: comment.trim() });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Symbol 產品</span>
          <input
            list="desk-symbols"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            onBlur={applySymbol}
            onKeyDown={(e) => e.key === 'Enter' && applySymbol()}
            placeholder="e.g. XAUUSD"
            className={inputCls}
          />
          <datalist id="desk-symbols">
            {symbols.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Type 類型</span>
          <div className="grid grid-cols-2 rounded-lg border border-slate-700 bg-slate-800 p-0.5 text-sm">
            {(['market', 'pending'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md py-1.5 font-medium transition-colors ${mode === m ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {m === 'market' ? 'Market 市價' : 'Pending 掛單'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Volume 手數</span>
          <div className="flex">
            <button onClick={() => adjustLots(-1)} className="rounded-l-lg border border-r-0 border-slate-700 bg-slate-800 px-2.5 text-slate-400 hover:text-white" aria-label="Decrease">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input value={lots} onChange={(e) => setLots(e.target.value)} inputMode="decimal" className={`${inputCls} rounded-none text-center`} />
            <button onClick={() => adjustLots(1)} className="rounded-r-lg border border-l-0 border-slate-700 bg-slate-800 px-2.5 text-slate-400 hover:text-white" aria-label="Increase">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Stop Loss 止損</span>
          <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Take Profit 止賺</span>
          <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
        </label>
      </div>

      {mode === 'pending' && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 animate-fade-in">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Order type 掛單類型</span>
            <select value={pendingType} onChange={(e) => setPendingType(e.target.value as PendingType)} className={inputCls}>
              {PENDING_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Price 價格</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder={quote ? fmtPrice(quote.bid, digits) : '0'} className={inputCls} />
          </label>
        </div>
      )}

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-medium text-slate-400">Comment 備註</span>
        <input value={comment} onChange={(e) => setComment(e.target.value.slice(0, 24))} placeholder="Optional 選填" className={inputCls} />
      </label>

      <div className="mt-5 flex items-end justify-center gap-6 sm:gap-10">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Bid</p>
          <p className={`font-mono text-3xl font-bold tabular-nums transition-colors sm:text-4xl ${dir === 'down' ? 'text-red-400' : dir === 'up' ? 'text-blue-400' : 'text-red-400/90'}`}>
            {quote ? fmtPrice(quote.bid, digits) : '—'}
          </p>
        </div>
        <span className="mb-2 rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400">{spread != null ? spread : '–'}</span>
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Ask</p>
          <p className={`font-mono text-3xl font-bold tabular-nums transition-colors sm:text-4xl ${dir === 'down' ? 'text-red-400' : dir === 'up' ? 'text-blue-400' : 'text-blue-400/90'}`}>
            {quote ? fmtPrice(quote.ask, digits) : '—'}
          </p>
        </div>
      </div>
      {stale && online && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-amber-300/80">
          <WifiOff className="h-3.5 w-3.5" />
          {quote ? 'Price not updating — market may be closed 報價未更新' : 'Waiting for the terminal to send prices (needs EA v3.0) 等待終端報價'}
        </p>
      )}

      <div className="mt-4">
        <TickChart ticks={ticks} digits={digits} />
      </div>

      {mode === 'market' ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => ask('SELL')}
              disabled={!!blockReason}
              className="rounded-xl bg-red-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-900/30 transition-all hover:-translate-y-0.5 hover:bg-red-500 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sell by Market 市價賣出
            </button>
            <button
              onClick={() => ask('BUY')}
              disabled={!!blockReason}
              className="rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition-all hover:-translate-y-0.5 hover:bg-blue-500 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Buy by Market 市價買入
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
            Attention! The trade will be executed at market conditions, difference with requested price may be significant!
            <br />
            注意：以市場價成交，成交價可能與顯示價格有差異。
          </p>
        </>
      ) : (
        <button
          onClick={() => ask(pendingType)}
          disabled={!!blockReason}
          className="mt-5 w-full rounded-xl bg-cyan-600 py-3.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-cyan-500 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Place {PENDING_TYPES.find((t) => t.value === pendingType)?.label} 落掛單
        </button>
      )}
      {blockReason && <p className="mt-2 text-center text-xs text-slate-500">{blockReason}</p>}

      {confirm && <ConfirmOrderDialog order={confirm} digits={digits} onClose={() => setConfirm(null)} onSent={onSent} />}
    </section>
  );
}
