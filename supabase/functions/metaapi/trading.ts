import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { clientApi, errorText, metaFetch } from "./client.ts";

export type Terminal = { account_name: string; metaapi_account_id: string; region: string };

export const base = (t: Terminal) => `${clientApi(t.region)}/users/current/accounts/${encodeURIComponent(t.metaapi_account_id)}`;
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const SYMBOL_REFRESH_MS = 6 * 60 * 60 * 1000;
const PICKUP_LIMIT_MS = 30_000;

export async function syncPositions(db: SupabaseClient, token: string, t: Terminal): Promise<{ closed: number } | null> {
  const res = await metaFetch(token, `${base(t)}/positions`);
  if (!res.ok || !Array.isArray(res.body)) return null;
  const now = new Date().toISOString();
  const rows = (res.body as Record<string, unknown>[])
    .map((p) => ({
      account_name: t.account_name,
      ticket: Number(p.id),
      symbol: String(p.symbol ?? ""),
      order_type: p.type === "POSITION_TYPE_SELL" ? "SELL" : "BUY",
      lots: num(p.volume),
      open_price: num(p.openPrice),
      sl: num(p.stopLoss),
      tp: num(p.takeProfit),
      profit: num(p.profit),
      swap: num(p.swap),
      magic: Math.trunc(num(p.magic)),
      open_time: typeof p.time === "string" ? p.time : null,
      updated_at: now,
    }))
    .filter((r) => Number.isSafeInteger(r.ticket) && r.ticket > 0 && r.symbol);
  if (rows.length) {
    const { error } = await db.from("live_positions").upsert(rows, { onConflict: "account_name,ticket" });
    if (error) return null;
  }
  let prune = db.from("live_positions").delete().eq("account_name", t.account_name);
  if (rows.length) prune = prune.not("ticket", "in", `(${rows.map((r) => r.ticket).join(",")})`);
  const { data: removed } = await prune.select("ticket");
  return { closed: removed?.length ?? 0 };
}

const HISTORY_FIRST_DAYS = 30;
const HISTORY_OVERLAP_MS = 24 * 60 * 60 * 1000;

type Deal = Record<string, unknown>;

export async function syncHistory(db: SupabaseClient, token: string, t: Terminal): Promise<boolean> {
  const [{ data: lastTrade }, { data: lastOp }] = await Promise.all([
    db.from("trade_history").select("close_time").eq("account_name", t.account_name).order("close_time", { ascending: false }).limit(1).maybeSingle(),
    db.from("balance_operations").select("op_time").eq("account_name", t.account_name).order("op_time", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const latest = Math.min(
    lastTrade?.close_time ? Date.parse(lastTrade.close_time) : 0,
    lastOp?.op_time ? Date.parse(lastOp.op_time) : 0,
  );
  const from = latest > 0 ? latest - HISTORY_OVERLAP_MS : Date.now() - HISTORY_FIRST_DAYS * 86_400_000;
  const to = Date.now() + 60_000;
  const res = await metaFetch(token, `${base(t)}/history-deals/time/${new Date(from).toISOString()}/${new Date(to).toISOString()}`);
  if (!res.ok || !Array.isArray(res.body)) return false;
  const deals = res.body as Deal[];

  const ops = deals
    .filter((d) => d.type === "DEAL_TYPE_BALANCE" || d.type === "DEAL_TYPE_CREDIT")
    .map((d) => ({
      account_name: t.account_name,
      ticket: Number(d.id),
      op_type: d.type === "DEAL_TYPE_CREDIT" ? "credit" : num(d.profit) >= 0 ? "deposit" : "withdrawal",
      amount: num(d.profit),
      comment: String(d.comment ?? "").slice(0, 200),
      op_time: String(d.time),
    }))
    .filter((o) => Number.isSafeInteger(o.ticket) && o.ticket > 0);

  const byPosition = new Map<string, Deal[]>();
  for (const d of deals) {
    if (d.type !== "DEAL_TYPE_BUY" && d.type !== "DEAL_TYPE_SELL") continue;
    const key = String(d.positionId ?? "");
    if (!key) continue;
    byPosition.set(key, [...(byPosition.get(key) ?? []), d]);
  }

  const trades = [];
  for (const [positionId, list] of byPosition) {
    const outs = list.filter((d) => d.entryType === "DEAL_ENTRY_OUT" || d.entryType === "DEAL_ENTRY_OUT_BY" || d.entryType === "DEAL_ENTRY_INOUT");
    if (!outs.length) continue;
    let entry = list.find((d) => d.entryType === "DEAL_ENTRY_IN");
    if (!entry) {
      const full = await metaFetch(token, `${base(t)}/history-deals/position/${encodeURIComponent(positionId)}`).catch(() => null);
      if (full?.ok && Array.isArray(full.body)) entry = (full.body as Deal[]).find((d) => d.entryType === "DEAL_ENTRY_IN");
    }
    const last = outs.reduce((a, b) => (String(a.time) > String(b.time) ? a : b));
    const lots = outs.reduce((s, d) => s + num(d.volume), 0);
    const closePrice = lots > 0 ? outs.reduce((s, d) => s + num(d.price) * num(d.volume), 0) / lots : num(last.price);
    trades.push({
      account_name: t.account_name,
      ticket: Number(positionId),
      symbol: String(last.symbol ?? entry?.symbol ?? ""),
      order_type: entry ? (entry.type === "DEAL_TYPE_SELL" ? "SELL" : "BUY") : (last.type === "DEAL_TYPE_SELL" ? "BUY" : "SELL"),
      lots: Math.round(lots * 100) / 100,
      open_price: num(entry?.price),
      close_price: closePrice,
      profit: outs.reduce((s, d) => s + num(d.profit), 0),
      commission: list.reduce((s, d) => s + num(d.commission), 0),
      swap: list.reduce((s, d) => s + num(d.swap), 0),
      open_time: entry?.time ? String(entry.time) : null,
      close_time: String(last.time),
    });
  }
  const valid = trades.filter((r) => Number.isSafeInteger(r.ticket) && r.ticket > 0 && r.symbol);

  const [a, b] = await Promise.all([
    valid.length ? db.from("trade_history").upsert(valid, { onConflict: "account_name,ticket" }) : { error: null },
    ops.length ? db.from("balance_operations").upsert(ops, { onConflict: "account_name,ticket" }) : { error: null },
  ]);
  return !a.error && !b.error;
}

export async function syncSymbols(db: SupabaseClient, token: string, t: Terminal) {
  const { data } = await db.from("account_symbols").select("symbols, updated_at").eq("account_name", t.account_name).maybeSingle();
  if (data?.symbols?.length && Date.now() - Date.parse(data.updated_at) < SYMBOL_REFRESH_MS) return;
  const res = await metaFetch(token, `${base(t)}/symbols`);
  if (!res.ok || !Array.isArray(res.body)) return;
  const symbols = [...new Set((res.body as unknown[])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length >= 1 && s.length <= 64))].sort().slice(0, 10000);
  if (!symbols.length) return;
  await db.from("account_symbols").upsert(
    { account_name: t.account_name, symbols, updated_at: new Date().toISOString() },
    { onConflict: "account_name" },
  );
}

export async function syncQuotes(db: SupabaseClient, token: string, t: Terminal): Promise<string | null> {
  const { data: watch } = await db
    .from("desk_watch")
    .select("symbol")
    .eq("account_name", t.account_name)
    .gt("until", new Date().toISOString())
    .limit(20);
  const { data: listed } = await db.from("account_symbols").select("symbols").eq("account_name", t.account_name).maybeSingle();
  const brokerSymbols = new Set<string>(listed?.symbols ?? []);
  const symbols = (watch ?? []).map((w) => w.symbol as string).filter((s) => !brokerSymbols.size || brokerSymbols.has(s));
  if (!symbols.length) return null;
  const { data: known } = await db.from("account_quotes").select("symbol").eq("account_name", t.account_name).in("symbol", symbols);
  const haveSpec = new Set((known ?? []).map((k) => k.symbol as string));
  const failures: string[] = [];

  await Promise.all(symbols.map(async (symbol) => {
    const path = `${base(t)}/symbols/${encodeURIComponent(symbol)}`;
    let price = await metaFetch(token, `${path}/current-price?keepSubscription=true`).catch(() => null);
    // MetaApi drops its cached price when a market-data subscription lapses; the tick endpoint re-reads from the terminal.
    if (price && price.status === 404) {
      const tick = await metaFetch(token, `${path}/current-tick?keepSubscription=true`).catch(() => null);
      if (tick?.ok) price = tick;
    }
    if (!price || !price.ok || typeof price.body?.bid !== "number" || typeof price.body?.ask !== "number") {
      const detail = !price ? "no response" : !price.ok ? `${price.status} ${errorText(price.body, price.status)}` : `no bid/ask (${JSON.stringify(price.body).slice(0, 120)})`;
      failures.push(`Quote ${symbol}: ${detail}`);
      return;
    }
    const row: Record<string, unknown> = {
      account_name: t.account_name,
      symbol,
      bid: price.body.bid,
      ask: price.body.ask,
      quoted_at: new Date().toISOString(),
    };
    if (!haveSpec.has(symbol)) {
      const spec = await metaFetch(token, `${path}/specification`);
      if (spec.ok && spec.body) {
        row.digits = typeof spec.body.digits === "number" ? spec.body.digits : 5;
        row.vol_min = num(spec.body.minVolume) || 0.01;
        row.vol_step = num(spec.body.volumeStep) || 0.01;
        row.vol_max = num(spec.body.maxVolume);
      }
    }
    await db.from("account_quotes").upsert(row, { onConflict: "account_name,symbol" });
  }));
  return failures.length ? failures.join("; ").slice(0, 300) : null;
}

const SUCCESS = new Set(["ERR_NO_ERROR", "TRADE_RETCODE_DONE", "TRADE_RETCODE_PLACED", "TRADE_RETCODE_DONE_PARTIAL", "TRADE_RETCODE_NO_CHANGES"]);

export type TradeResult = { ok: true; ticket: number | null } | { ok: false; error: string; code: string };

export async function trade(token: string, t: Terminal, payload: Record<string, unknown>): Promise<TradeResult> {
  const res = await metaFetch(token, `${base(t)}/trade`, { method: "POST", body: JSON.stringify(payload) }).catch(() => null);
  if (!res) return { ok: false, error: "MetaApi did not respond", code: "" };
  const code = String(res.body?.stringCode ?? "");
  if (res.ok && SUCCESS.has(code)) {
    const ticket = Number(res.body?.positionId ?? res.body?.orderId);
    return { ok: true, ticket: Number.isSafeInteger(ticket) && ticket > 0 ? ticket : null };
  }
  const msg = typeof res.body?.message === "string" ? res.body.message : code || `MetaApi error ${res.status}`;
  return { ok: false, error: msg.slice(0, 300), code };
}

export const ACTION: Record<string, string> = {
  BUY: "ORDER_TYPE_BUY",
  SELL: "ORDER_TYPE_SELL",
  BUY_LIMIT: "ORDER_TYPE_BUY_LIMIT",
  SELL_LIMIT: "ORDER_TYPE_SELL_LIMIT",
  BUY_STOP: "ORDER_TYPE_BUY_STOP",
  SELL_STOP: "ORDER_TYPE_SELL_STOP",
};

export async function runDeskOrders(db: SupabaseClient, token: string, t: Terminal): Promise<number> {
  await db
    .from("desk_orders")
    .update({ status: "expired", processed_at: new Date().toISOString(), error: "MetaApi did not pick up the order within 30 seconds" })
    .eq("account_name", t.account_name)
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - PICKUP_LIMIT_MS).toISOString());

  const { data: queue } = await db
    .from("desk_orders")
    .select("id")
    .eq("account_name", t.account_name)
    .eq("status", "pending")
    .order("created_at")
    .limit(10);

  let done = 0;
  for (const { id } of queue ?? []) {
    const { data: o } = await db
      .from("desk_orders")
      .update({ status: "processing", processed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id, symbol, order_type, lots, price, sl, tp, comment")
      .maybeSingle();
    if (!o) continue;
    const actionType = ACTION[o.order_type as string];
    const payload: Record<string, unknown> = { actionType, symbol: o.symbol, volume: o.lots };
    if (o.order_type !== "BUY" && o.order_type !== "SELL") payload.openPrice = o.price;
    if (num(o.sl) > 0) payload.stopLoss = o.sl;
    if (num(o.tp) > 0) payload.takeProfit = o.tp;
    if (o.comment) payload.comment = o.comment;
    const r: TradeResult = actionType ? await trade(token, t, payload) : { ok: false, error: "Unsupported order type", code: "" };
    await db
      .from("desk_orders")
      .update(r.ok
        ? { status: "filled", ticket: r.ticket, error: null, processed_at: new Date().toISOString() }
        : { status: "failed", error: r.error, processed_at: new Date().toISOString() })
      .eq("id", o.id)
      .eq("status", "processing");
    done++;
  }
  return done;
}
