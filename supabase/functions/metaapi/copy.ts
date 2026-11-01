import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { metaFetch } from "./client.ts";
import { ACTION, base, num, trade, type Terminal, type TradeResult } from "./trading.ts";

type Signal = {
  id: string;
  action: "open" | "close" | "modify";
  copy_id: string;
  master_account: string;
  master_ticket: number;
  symbol: string;
  order_type: string;
  lots: number;
  open_price: number;
  sl: number;
  tp: number;
  magic: number;
  follower_ticket: number | null;
};

type Item = { id: string; symbol: string; comment: string; sl: number; tp: number };
type Book = { positions: Item[]; orders: Item[] };
type Spec = { digits: number; min: number; step: number; max: number };

const RETRY_CODES = new Set(["", "TRADE_RETCODE_MARKET_CLOSED", "TRADE_RETCODE_PRICE_OFF", "TRADE_RETCODE_REQUOTE", "TRADE_RETCODE_CONNECTION", "TRADE_RETCODE_TIMEOUT"]);

// Same tag the EA writes, so either side can recognise an existing copy.
function copyTag(masterAccount: string, masterTicket: number) {
  let h = 5381;
  for (let i = 0; i < masterAccount.length; i++) h = (h * 33 + masterAccount.charCodeAt(i)) >>> 0;
  return `CT${masterTicket}-${(h & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
}

function toItems(body: unknown): Item[] {
  if (!Array.isArray(body)) return [];
  return (body as Record<string, unknown>[]).map((p) => ({
    id: String(p.id ?? ""),
    symbol: String(p.symbol ?? ""),
    comment: `${p.comment ?? ""}|${p.clientId ?? ""}|${p.brokerComment ?? ""}`,
    sl: num(p.stopLoss),
    tp: num(p.takeProfit),
  }));
}

async function loadBook(token: string, t: Terminal): Promise<Book | null> {
  const [p, o] = await Promise.all([metaFetch(token, `${base(t)}/positions`), metaFetch(token, `${base(t)}/orders`)]);
  if (!p.ok || !o.ok || !Array.isArray(p.body) || !Array.isArray(o.body)) return null;
  return { positions: toItems(p.body), orders: toItems(o.body) };
}

const symbolCore = (s: string) => (s.match(/[A-Z0-9]+/g) ?? []).reduce((a, b) => (b.length > a.length ? b : a), "");
const isAffix = (x: string) => !x || (x.length <= 5 && (/[^A-Za-z0-9]/.test(x) || (x.match(/[A-Z]/g) ?? []).length < 3));

function resolveSymbol(wanted: string, broker: string[]): string | null {
  if (!broker.length || broker.includes(wanted)) return wanted;
  const core = symbolCore(wanted);
  if (core.length < 3) return null;
  let best: string | null = null;
  for (const s of broker) {
    const pos = s.indexOf(core);
    if (pos < 0 || (best && s.length >= best.length)) continue;
    if (isAffix(s.slice(0, pos)) && isAffix(s.slice(pos + core.length))) best = s;
  }
  return best;
}

async function loadSpec(db: SupabaseClient, token: string, t: Terminal, symbol: string): Promise<Spec | null> {
  const { data } = await db.from("account_quotes").select("digits, vol_min, vol_step, vol_max").eq("account_name", t.account_name).eq("symbol", symbol).maybeSingle();
  if (data?.vol_step && data?.vol_min) return { digits: data.digits ?? 5, min: data.vol_min, step: data.vol_step, max: data.vol_max || Infinity };
  const res = await metaFetch(token, `${base(t)}/symbols/${encodeURIComponent(symbol)}/specification`).catch(() => null);
  if (!res?.ok || !res.body) return null;
  const spec = { digits: typeof res.body.digits === "number" ? res.body.digits : 5, min: num(res.body.minVolume), step: num(res.body.volumeStep), max: num(res.body.maxVolume) || Infinity };
  if (spec.min <= 0 || spec.step <= 0) return null;
  await db.from("account_quotes").upsert(
    { account_name: t.account_name, symbol, digits: spec.digits, vol_min: spec.min, vol_step: spec.step, vol_max: Number.isFinite(spec.max) ? spec.max : null },
    { onConflict: "account_name,symbol" },
  );
  return spec;
}

function normalizeLots(lots: number, s: Spec) {
  let v = Math.floor(lots / s.step + 1e-9) * s.step;
  if (v < s.min) v = s.min;
  if (v > s.max) v = s.max;
  return Math.round(v * 100) / 100;
}

const round = (v: number, digits: number) => (v > 0 ? Number(v.toFixed(digits)) : 0);

async function setSignal(db: SupabaseClient, id: string, status: string) {
  await db.from("copy_signals").update({ status, processed_at: new Date().toISOString() }).eq("id", id).eq("status", "processing");
}

async function setCopy(db: SupabaseClient, copyId: string, status: "open" | "closed" | "cancelled", extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  await db.from("copy_trades").update({ status, ...(status === "open" ? { opened_at: now } : { closed_at: now }), ...extra }).eq("copy_id", copyId);
}

async function handleOpen(db: SupabaseClient, token: string, t: Terminal, s: Signal, book: Book) {
  const tag = copyTag(s.master_account, s.master_ticket);
  const existing = [...book.positions, ...book.orders].find((i) => i.comment.includes(tag));
  if (existing) {
    await setCopy(db, s.copy_id, "open", { follower_ticket: Number(existing.id) });
    return setSignal(db, s.id, "executed");
  }

  const { data: listed } = await db.from("account_symbols").select("symbols").eq("account_name", t.account_name).maybeSingle();
  const symbol = resolveSymbol(s.symbol, (listed?.symbols as string[] | null) ?? []);
  if (!symbol) {
    await setCopy(db, s.copy_id, "cancelled", { cancel_reason: `symbol not available on this broker: ${s.symbol}`.slice(0, 200) });
    return setSignal(db, s.id, "failed");
  }
  const spec = await loadSpec(db, token, t, symbol);
  if (!spec) return setSignal(db, s.id, "pending");
  const volume = normalizeLots(num(s.lots), spec);
  const actionType = ACTION[s.order_type];
  if (!actionType || volume <= 0) {
    await setCopy(db, s.copy_id, "cancelled", { cancel_reason: `open_failed: unsupported order ${s.order_type} ${s.lots}` });
    return setSignal(db, s.id, "failed");
  }

  const isMarket = s.order_type === "BUY" || s.order_type === "SELL";
  const sl = round(num(s.sl), spec.digits);
  const tp = round(num(s.tp), spec.digits);
  const payload: Record<string, unknown> = { actionType, symbol, volume, comment: tag };
  if (!isMarket) payload.openPrice = round(num(s.open_price), spec.digits);
  if (s.magic) payload.magic = s.magic;

  let r: TradeResult = await trade(token, t, { ...payload, ...(sl ? { stopLoss: sl } : {}), ...(tp ? { takeProfit: tp } : {}) });
  if (!r.ok && isMarket && (sl || tp) && r.code === "TRADE_RETCODE_INVALID_STOPS") {
    r = await trade(token, t, payload);
    if (r.ok && r.ticket) await trade(token, t, { actionType: "POSITION_MODIFY", positionId: String(r.ticket), stopLoss: sl, takeProfit: tp });
  }

  if (r.ok) {
    await setCopy(db, s.copy_id, "open", { follower_ticket: r.ticket, lots: volume });
    return setSignal(db, s.id, "executed");
  }
  if (RETRY_CODES.has(r.code)) return setSignal(db, s.id, "pending");
  await setCopy(db, s.copy_id, "cancelled", { cancel_reason: `open_failed: ${r.error}`.slice(0, 200) });
  return setSignal(db, s.id, "failed");
}

function findTarget(s: Signal, book: Book) {
  const id = s.follower_ticket ? String(s.follower_ticket) : null;
  const tag = s.master_account && s.master_ticket ? copyTag(s.master_account, s.master_ticket) : null;
  const match = (i: Item) => (id && i.id === id) || (!id && tag && i.comment.includes(tag));
  const position = book.positions.find(match);
  if (position) return { kind: "position" as const, item: position };
  const order = book.orders.find(match);
  return order ? { kind: "order" as const, item: order } : null;
}

async function handleClose(db: SupabaseClient, token: string, t: Terminal, s: Signal, book: Book) {
  const target = findTarget(s, book);
  if (!target) {
    if (!s.copy_id.startsWith("manual:")) await setCopy(db, s.copy_id, "closed");
    return setSignal(db, s.id, "executed");
  }
  const r = target.kind === "position"
    ? await trade(token, t, { actionType: "POSITION_CLOSE_ID", positionId: target.item.id })
    : await trade(token, t, { actionType: "ORDER_CANCEL", orderId: target.item.id });
  if (!r.ok) return setSignal(db, s.id, "pending");
  if (!s.copy_id.startsWith("manual:")) await setCopy(db, s.copy_id, "closed");
  return setSignal(db, s.id, "executed");
}

async function handleModify(db: SupabaseClient, token: string, t: Terminal, s: Signal, book: Book) {
  const target = findTarget(s, book);
  if (!target) return setSignal(db, s.id, "cancelled");
  const sl = num(s.sl);
  const tp = num(s.tp);
  if (Math.abs(target.item.sl - sl) < 1e-9 && Math.abs(target.item.tp - tp) < 1e-9) return setSignal(db, s.id, "executed");
  const send = (stopLoss: number, takeProfit: number) =>
    target.kind === "position"
      ? trade(token, t, { actionType: "POSITION_MODIFY", positionId: target.item.id, stopLoss, takeProfit })
      : trade(token, t, { actionType: "ORDER_MODIFY", orderId: target.item.id, stopLoss, takeProfit });
  let r = await send(sl, tp);
  if (!r.ok) {
    const a = await send(sl, target.item.tp);
    const b = await send(a.ok ? sl : target.item.sl, tp);
    r = a.ok || b.ok ? { ok: true, ticket: null } : r;
  }
  return setSignal(db, s.id, r.ok ? "executed" : "failed");
}

export async function runCopySignals(db: SupabaseClient, token: string, t: Terminal): Promise<number> {
  const { count } = await db
    .from("copy_signals")
    .select("id", { count: "exact", head: true })
    .eq("follower_account", t.account_name)
    .eq("status", "pending");
  if (!count) return 0;
  const { data, error } = await db.rpc("metaapi_take_signals", { p_follower: t.account_name, p_limit: 20 });
  if (error || !Array.isArray(data) || !data.length) return 0;
  const signals = data as Signal[];
  const book = await loadBook(token, t).catch(() => null);
  if (!book) {
    await Promise.all(signals.map((s) => setSignal(db, s.id, "pending")));
    return 0;
  }
  for (const s of signals) {
    try {
      if (s.action === "open") await handleOpen(db, token, t, s, book);
      else if (s.action === "close") await handleClose(db, token, t, s, book);
      else await handleModify(db, token, t, s, book);
    } catch {
      await setSignal(db, s.id, "pending");
    }
  }
  return signals.length;
}
