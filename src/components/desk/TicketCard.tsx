import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, ChevronDown, Loader2, Minus, Pencil, Plus, X, XCircle } from 'lucide-react';
import { closeDeskPosition, fmtPrice, guessDigits, isBuy, quoteStaleMs, type DeskOrder, type MarketSide, type Quote } from '@/lib/desk';
import { formatSigned } from '@/lib/format';
import { logActivity } from '@/lib/activityLog';
import type { DeskTicket } from '@/hooks/useTraderManager';
import { SymbolPicker } from '@/components/desk/SymbolPicker';
import { ModifyDialog } from '@/components/desk/ModifyDialog';
import type { Account, LivePosition } from '@/lib/types';
import { ReadOnlyBadge } from '@/components/ReadOnlyBadge';

const labelCls = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500';

const fieldCls =
  'w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm font-mono text-white placeholder:font-sans placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none';

function NumField({ value, onCommit, placeholder, className = '' }: { value: number; onCommit: (v: number) => void; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value ? String(value) : '');
  }, [value, focused]);
  return (
    <input
      value={text}
      inputMode="decimal"
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        onCommit(Number.isFinite(v) && v > 0 ? v : 0);
      }}
      className={`${fieldCls} ${className}`}
    />
  );
}

export function TicketCard({
  ticket,
  masters,
  symbols,
  online,
  quote,
  now,
  blockReason,
  positions,
  closing,
  onCloseAll,
  onClosing,
  lastOrder,
  deadline,
  sending,
  onChange,
  onRemove,
  onSend,
}: {
  ticket: DeskTicket;
  masters: Account[];
  symbols: string[];
  online: boolean;
  quote: Quote | undefined;
  now: number;
  blockReason: string;
  positions: LivePosition[];
  closing: Set<number>;
  onCloseAll: () => void;
  onClosing: (tickets: number[]) => void;
  lastOrder: DeskOrder | undefined;
  deadline: number | undefined;
  sending: boolean;
  onChange: (patch: Partial<DeskTicket>) => void;
  onRemove: () => void;
  onSend: (side: MarketSide) => void;
}) {
  const digits = quote?.digits ?? 2;
  const cloud = masters.find((m) => m.account_name === ticket.account_name)?.connection_method === 'metaapi';
  const stale = !quote || now - new Date(quote.quoted_at).getTime() > quoteStaleMs(cloud);
  const spread = quote ? Math.round((quote.ask - quote.bid) * Math.pow(10, digits)) : null;
  const step = quote?.vol_step && quote.vol_step > 0 ? quote.vol_step : 0.01;
  const stepLots = (dir: 1 | -1) => {
    const next = Math.max(step, Math.round((ticket.lots + dir * step) / step) * step);
    onChange({ lots: Number(next.toFixed(3)) });
  };

  const armedTone = !ticket.armed ? 'border-slate-800' : ticket.side === 'BUY' ? 'border-blue-500/60 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]' : 'border-red-500/60 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]';
  const setArm = (side: MarketSide | null) => onChange(side ? { armed: true, side } : { armed: false });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LivePosition | null>(null);
  const [closeError, setCloseError] = useState('');
  const pl = positions.reduce((s, p) => s + (p.profit || 0) + (p.swap || 0), 0);

  const closeOne = async (p: LivePosition) => {
    setCloseError('');
    onClosing([p.ticket]);
    const ok = await closeDeskPosition(p.account_name, p.ticket);
    if (!ok) {
      setCloseError(`Could not close #${p.ticket}. 無法平倉，請再試。`);
      return;
    }
    logActivity('close_position', 'positions', p.account_name, { ticket: p.ticket, symbol: p.symbol, lots: p.lots, source: 'trader_manager' });
  };

  return (
    <article className={`flex flex-col rounded-xl border bg-slate-900/80 p-3 transition-all ${armedTone}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-slate-600'}`} />
        <select
          value={ticket.account_name ?? ''}
          onChange={(e) => onChange({ account_name: e.target.value || null })}
          className="min-w-0 flex-1 truncate rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-white focus:border-cyan-500 focus:outline-none"
        >
          <option value="">Choose master 揀帳戶</option>
          {masters.map((m) => (
            <option key={m.account_name} value={m.account_name}>
              {m.account_name}
              {m.mt_trade_allowed === false ? ' (Investor 唯讀)' : ''}
            </option>
          ))}
        </select>
        <ReadOnlyBadge account={masters.find((m) => m.account_name === ticket.account_name)} compact />
        <button onClick={onRemove} className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-red-300" aria-label="Remove window">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <label className="mt-2 block">
        <span className={labelCls}>Symbol 產品</span>
        <SymbolPicker value={ticket.symbol} options={symbols} onChange={(s) => s !== ticket.symbol && onChange({ symbol: s })} />
      </label>

      <div className="mt-2">
        <span className={labelCls}>Volume 手數</span>
        <div className="flex h-[34px] items-stretch">
          <button onClick={() => stepLots(-1)} className="h-full rounded-l-md border border-r-0 border-slate-700 bg-slate-800 px-2 text-slate-400 hover:text-white" aria-label="Decrease volume">
            <Minus className="h-3 w-3" />
          </button>
          <NumField value={ticket.lots} onCommit={(v) => onChange({ lots: v })} placeholder="0.01" className="min-w-0 flex-1 rounded-none text-center" />
          <button onClick={() => stepLots(1)} className="h-full rounded-r-md border border-l-0 border-slate-700 bg-slate-800 px-2 text-slate-400 hover:text-white" aria-label="Increase volume">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className={labelCls}>SL 止損</span>
          <NumField value={ticket.sl} onCommit={(v) => onChange({ sl: v })} placeholder="0" />
        </label>
        <label className="block min-w-0">
          <span className={labelCls}>TP 止賺</span>
          <NumField value={ticket.tp} onCommit={(v) => onChange({ tp: v })} placeholder="0" />
        </label>
      </div>

      <div className="mt-3 flex items-baseline justify-center gap-2 font-mono tabular-nums">
        <span className={`text-2xl font-bold ${stale ? 'text-slate-600' : 'text-red-400'}`}>{quote ? fmtPrice(quote.bid, digits) : '—'}</span>
        <span className="text-[10px] text-slate-500">{spread ?? '–'}</span>
        <span className={`text-2xl font-bold ${stale ? 'text-slate-600' : 'text-blue-400'}`}>{quote ? fmtPrice(quote.ask, digits) : '—'}</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => onSend('SELL')}
          disabled={!!blockReason || sending}
          className="rounded-md bg-red-600 py-2 text-xs font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Sell 賣出
        </button>
        <button
          onClick={() => onSend('BUY')}
          disabled={!!blockReason || sending}
          className="rounded-md bg-blue-600 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Buy 買入
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-md border border-slate-700 text-[11px] font-semibold">
        {([
          [null, 'Off 不發', 'bg-slate-700 text-white'],
          ['SELL', 'Sell ●', 'bg-red-500/25 text-red-200'],
          ['BUY', 'Buy ●', 'bg-blue-500/25 text-blue-200'],
        ] as const).map(([side, label, active]) => {
          const on = side === null ? !ticket.armed : ticket.armed && ticket.side === side;
          return (
            <button key={label} onClick={() => setArm(side)} className={`py-1 transition-colors ${on ? active : 'text-slate-500 hover:text-slate-300'}`}>
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex min-h-[16px] items-center gap-2 text-[11px]">
        {sending ? (
          <span className="flex items-center gap-1 text-cyan-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            Sending 發送中
            {deadline && <Countdown deadline={deadline} />}
          </span>
        ) : lastOrder ? (
          <OrderStatus order={lastOrder} deadline={deadline} />
        ) : blockReason ? (
          <span className="truncate text-slate-500">{blockReason}</span>
        ) : null}
      </div>

      {positions.length > 0 && (
        <div className="mt-2 border-t border-slate-800 pt-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-800">
              <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              <span>{positions.length} pos 持倉</span>
              <span className={`ml-auto font-semibold tabular-nums ${pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSigned(pl)}</span>
            </button>
            <button
              onClick={onCloseAll}
              disabled={positions.every((p) => closing.has(p.ticket))}
              className="flex shrink-0 items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-40"
            >
              <XCircle className="h-3 w-3" />
              Close 平倉
            </button>
          </div>
          {closeError && <p className="mt-1 text-[11px] text-red-300">{closeError}</p>}
          {open && (
            <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto animate-fade-in">
              {positions.map((p) => {
                const v = (p.profit || 0) + (p.swap || 0);
                const busy = closing.has(p.ticket);
                return (
                  <li key={p.ticket} className={`flex items-center gap-1.5 rounded-md bg-slate-950/60 px-2 py-1 text-[11px] ${busy ? 'opacity-50' : ''}`}>
                    <span className={`w-7 font-bold ${isBuy(p.order_type) ? 'text-blue-400' : 'text-red-400'}`}>{isBuy(p.order_type) ? 'Buy' : 'Sell'}</span>
                    <span className="font-mono text-slate-200">{p.lots}</span>
                    <span className="truncate font-mono text-slate-500">@{p.open_price.toFixed(guessDigits(p.open_price))}</span>
                    <span className={`ml-auto shrink-0 font-semibold tabular-nums ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSigned(v)}</span>
                    <button onClick={() => setEditing(p)} disabled={busy} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-amber-300 disabled:opacity-40" aria-label="Modify SL/TP" title="SL/TP 修改止損止賺">
                      <Pencil className="h-3 w-3" />
                    </button>
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin p-1 text-red-300" />
                    ) : (
                      <button onClick={() => closeOne(p)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-red-300" aria-label={`Close #${p.ticket}`} title="Close 平倉">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {editing && <ModifyDialog position={editing} onClose={() => setEditing(null)} onQueued={() => undefined} />}
    </article>
  );
}

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, deadline - now) / 1000;
  return <span className="ml-1 font-mono tabular-nums text-amber-300">{left.toFixed(1)}s</span>;
}

function OrderStatus({ order, deadline }: { order: DeskOrder; deadline: number | undefined }) {
  const side = order.order_type === 'BUY' ? 'Buy' : 'Sell';
  if (order.status === 'filled')
    return (
      <span className="flex min-w-0 items-center gap-1 text-emerald-300" title={order.error ?? undefined}>
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {side} {order.lots} filled #{order.ticket}
        </span>
      </span>
    );
  if (order.status === 'cancelled')
    return (
      <span className="flex min-w-0 items-center gap-1 text-amber-300" title={order.error ?? undefined}>
        <Ban className="h-3 w-3 shrink-0" />
        <span className="truncate">Timed out, cancelled 逾時已取消</span>
      </span>
    );
  if (order.status === 'failed' || order.status === 'expired')
    return (
      <span className="flex min-w-0 items-center gap-1 text-red-300" title={order.error ?? undefined}>
        <XCircle className="h-3 w-3 shrink-0" />
        <span className="truncate">{order.status === 'expired' ? 'Expired 逾時' : order.error || 'Failed 失敗'}</span>
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-cyan-300">
      <Loader2 className="h-3 w-3 animate-spin" />
      {order.status === 'processing' ? 'Executing 執行中' : 'Sent 已發送'}
      {deadline && <Countdown deadline={deadline} />}
    </span>
  );
}
