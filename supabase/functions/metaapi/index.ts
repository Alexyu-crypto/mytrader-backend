import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { PROVISIONING, clientApi, errorText, metaFetch } from "./client.ts";
import { runCopySignals } from "./copy.ts";
import { runDeskOrders, syncHistory, syncPositions, syncQuotes, syncSymbols, type Terminal } from "./trading.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = {
  id: string;
  account_name: string;
  platform: string;
  broker_server: string | null;
  metaapi_account_id: string | null;
  metaapi_pending_tx: string | null;
  metaapi_state?: string | null;
};

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

// MetaApi only reports an IP when a dedicated IP is allocated; the field name is not fixed, so scan for any IPv4 value.
function findIp(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return IPV4.test(value) ? value : null;
  if (depth > 3 || !value || typeof value !== "object") return null;
  for (const v of Array.isArray(value) ? value : Object.values(value)) {
    const ip = findIp(v, depth + 1);
    if (ip) return ip;
  }
  return null;
}

function zoneOf(body: Record<string, unknown>, region: string | null): string | null {
  const conns = Array.isArray(body.connections) ? (body.connections as Record<string, unknown>[]) : [];
  const hit = conns.find((c) => c.region === region) ?? conns[0];
  return typeof hit?.zone === "string" ? hit.zone : null;
}

type CloudRow = { account_name: string; type: string; metaapi_account_id: string; metaapi_region: string };

const cloudAccounts = (db: SupabaseClient) =>
  db
    .from("accounts")
    .select("account_name, type, metaapi_account_id, metaapi_region")
    .eq("connection_method", "metaapi")
    .eq("frozen", false)
    .eq("metaapi_state", "DEPLOYED")
    .not("metaapi_account_id", "is", null)
    .not("metaapi_region", "is", null);

async function refresh(db: SupabaseClient, token: string, t: Terminal, withQuotes: boolean) {
  const [live, quoteError] = await Promise.all([
    syncPositions(db, token, t).catch(() => null),
    withQuotes ? syncQuotes(db, token, t).catch((e) => `Quote error: ${String(e).slice(0, 200)}`) : null,
    withQuotes ? syncSymbols(db, token, t).catch(() => undefined) : undefined,
  ]);
  const update: Record<string, unknown> = {};
  if (live) Object.assign(update, { last_seen: new Date().toISOString(), metaapi_connection: "CONNECTED" });
  if (live?.closed) await syncHistory(db, token, t).catch(() => false);
  if (quoteError) update.metaapi_error = quoteError;
  if (Object.keys(update).length) await db.from("accounts").update(update).eq("account_name", t.account_name);
}

// Positions first so new master trades raise copy signals, then followers execute them in the same pass.
async function pump(db: SupabaseClient, token: string, rows: CloudRow[]): Promise<number> {
  const list = rows.map((r) => ({
    type: r.type,
    t: { account_name: r.account_name, metaapi_account_id: r.metaapi_account_id, region: r.metaapi_region } as Terminal,
  }));
  let executed = 0;
  for (let i = 0; i < list.length; i += 10) {
    await Promise.all(list.slice(i, i + 10).map(async ({ type, t }) => {
      if (type === "master") {
        await db.from("desk_terminals").upsert({ account_name: t.account_name, polled_at: new Date().toISOString() }, { onConflict: "account_name" });
        executed += await runDeskOrders(db, token, t).catch(() => 0);
      }
      await refresh(db, token, t, true);
    }));
  }
  for (let i = 0; i < list.length; i += 10) {
    await Promise.all(list.slice(i, i + 10).map(async ({ t }) => {
      const n = await runCopySignals(db, token, t).catch(() => 0);
      if (n) await refresh(db, token, t, false);
      executed += n;
    }));
  }
  return executed;
}

async function syncOne(db: SupabaseClient, token: string, row: Row) {
  const now = new Date().toISOString();
  if (!row.metaapi_account_id) return { id: row.id, ok: false };
  const acc = await metaFetch(token, `${PROVISIONING}/users/current/accounts/${encodeURIComponent(row.metaapi_account_id)}`);
  if (!acc.ok || !acc.body) {
    await db.from("accounts").update({ metaapi_error: errorText(acc.body, acc.status), metaapi_synced_at: now }).eq("id", row.id);
    return { id: row.id, ok: false };
  }
  const state = String(acc.body.state ?? "");
  const connection = String(acc.body.connectionStatus ?? "");
  const region = typeof acc.body.region === "string" ? acc.body.region : null;
  const ip = findIp(acc.body);
  if (ip) {
    await db.from("account_credentials").upsert(
      { account_id: row.id, detected_ip: ip, detected_ip_at: now },
      { onConflict: "account_id" },
    );
  }
  const update: Record<string, unknown> = {
    metaapi_state: state || null,
    metaapi_connection: connection || null,
    metaapi_region: region,
    metaapi_zone: zoneOf(acc.body as Record<string, unknown>, region),
    metaapi_ip: ip,
    metaapi_error: null,
    metaapi_synced_at: now,
  };
  // MetaApi only opens the broker session once a client requests data, so always ask while deployed.
  if (state === "DEPLOYED" && region) {
    const info = await metaFetch(token, `${clientApi(region)}/users/current/accounts/${encodeURIComponent(row.metaapi_account_id)}/account-information`);
    if (info.ok && info.body && typeof info.body.balance === "number" && typeof info.body.equity === "number") {
      update.balance = info.body.balance;
      update.equity = info.body.equity;
      update.last_seen = now;
      update.metaapi_connection = "CONNECTED";
      const terminal = { account_name: row.account_name, metaapi_account_id: row.metaapi_account_id, region };
      await syncPositions(db, token, terminal).catch(() => null);
      await syncSymbols(db, token, terminal).catch(() => undefined);
      await syncHistory(db, token, terminal).catch(() => false);
    } else if (!info.ok && info.status !== 504 && info.status !== 409) {
      update.metaapi_error = errorText(info.body, info.status);
    }
  }
  await db.from("accounts").update(update).eq("id", row.id);
  return { id: row.id, ok: true };
}

async function createCloudAccount(db: SupabaseClient, token: string, row: Row) {
  const login = row.account_name.split("-").find((p) => /^\d+$/.test(p));
  if (!login) return { error: "missing_login" };
  if (!row.broker_server) return { error: "missing_server" };
  const { data: cred } = await db.from("account_credentials").select("password").eq("account_id", row.id).maybeSingle();
  if (!cred?.password) return { error: "missing_password" };

  const existing = await metaFetch(token, `${PROVISIONING}/users/current/accounts?limit=1000`);
  if (!existing.ok) return { error: "metaapi_rejected", message: errorText(existing.body as Record<string, unknown> | null, existing.status) };
  const list = (Array.isArray(existing.body) ? existing.body : Array.isArray(existing.body?.items) ? existing.body.items : []) as Record<string, unknown>[];
  const match = list.find((a) => String(a.login ?? "") === login && String(a.server ?? "").toLowerCase() === row.broker_server!.toLowerCase());
  if (match) {
    const id = String(match._id ?? match.id ?? "");
    await db.from("accounts").update({
      metaapi_account_id: id,
      metaapi_state: typeof match.state === "string" ? match.state : null,
      metaapi_pending_tx: null,
      metaapi_error: null,
      metaapi_synced_at: new Date().toISOString(),
    }).eq("id", row.id).is("metaapi_account_id", null);
    return { id };
  }

  // Claim the transaction id atomically so concurrent requests reuse it instead of creating duplicates.
  let tx = row.metaapi_pending_tx;
  if (!tx) {
    const { data: claimed } = await db.from("accounts")
      .update({ metaapi_pending_tx: crypto.randomUUID().replace(/-/g, "") })
      .eq("id", row.id).is("metaapi_pending_tx", null)
      .select("metaapi_pending_tx").maybeSingle();
    tx = claimed?.metaapi_pending_tx ?? null;
    if (!tx) {
      const { data: current } = await db.from("accounts").select("metaapi_pending_tx").eq("id", row.id).maybeSingle();
      tx = current?.metaapi_pending_tx ?? null;
    }
    if (!tx) return { pending: true };
  }

  const created = await postAccount(token, tx, accountPayload(row, login, cred.password));
  if ("id" in created) {
    await db.from("accounts").update({
      metaapi_account_id: created.id,
      metaapi_state: created.state,
      metaapi_pending_tx: null,
      metaapi_error: null,
      metaapi_synced_at: new Date().toISOString(),
    }).eq("id", row.id);
    return { id: created.id };
  }
  if ("message" in created) {
    await db.from("accounts").update({ metaapi_pending_tx: null, metaapi_error: created.message, metaapi_synced_at: new Date().toISOString() }).eq("id", row.id);
    return { error: "metaapi_rejected", message: created.message };
  }
  return { pending: true };
}

// "backup-*" regions are failover-only (replicas) and cannot host a primary terminal.
async function primaryRegions(token: string): Promise<string[] | null> {
  const res = await metaFetch(token, `${PROVISIONING}/users/current/regions`);
  if (!res.ok || !Array.isArray(res.body)) return null;
  return (res.body as unknown[]).filter((r): r is string => typeof r === "string" && !r.startsWith("backup-"));
}

function accountPayload(row: Row, login: string, password: string, region?: string) {
  return JSON.stringify({
    name: row.account_name,
    login,
    password,
    server: row.broker_server,
    platform: row.platform === "MT5" ? "mt5" : "mt4",
    magic: 0,
    type: "cloud-g2",
    reliability: "regular",
    ...(region ? { region } : {}),
  });
}

async function postAccount(token: string, tx: string, payload: string): Promise<{ id: string; state: string | null } | { message: string } | { pending: true }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await metaFetch(token, `${PROVISIONING}/users/current/accounts`, {
      method: "POST",
      headers: { "transaction-id": tx },
      body: payload,
    });
    if (res.ok && res.status !== 202 && typeof res.body?.id === "string") {
      return { id: res.body.id, state: typeof res.body.state === "string" ? res.body.state : null };
    }
    if (res.status === 202) {
      const retryAt = Date.parse(res.headers.get("retry-after") ?? "");
      await sleep(Math.min(Math.max(Number.isNaN(retryAt) ? 5000 : retryAt - Date.now(), 2000), 10000));
      continue;
    }
    return { message: errorText(res.body, res.status) };
  }
  return { pending: true };
}

// Moving region = create a replacement terminal in the new region (same login), then remove the old one.
// The transaction id is stored with the target region so repeated clicks resume the same request.
async function moveRegion(db: SupabaseClient, token: string, row: Row & { metaapi_region: string | null; metaapi_moving_to: string | null }, region: string) {
  if (!row.metaapi_account_id) return { error: "not_connected" };
  if (row.metaapi_region === region) return { error: "same_region" };
  if (row.metaapi_moving_to && row.metaapi_moving_to !== region) return { error: "move_in_progress" };
  const login = row.account_name.split("-").find((p) => /^\d+$/.test(p));
  if (!login) return { error: "missing_login" };
  if (!row.broker_server) return { error: "missing_server" };
  const { data: cred } = await db.from("account_credentials").select("password").eq("account_id", row.id).maybeSingle();
  if (!cred?.password) return { error: "missing_password" };

  let tx = row.metaapi_moving_to ? row.metaapi_pending_tx : null;
  if (!tx) {
    const { data: claimed } = await db.from("accounts")
      .update({ metaapi_pending_tx: crypto.randomUUID().replace(/-/g, ""), metaapi_moving_to: region })
      .eq("id", row.id).is("metaapi_moving_to", null)
      .select("metaapi_pending_tx").maybeSingle();
    tx = claimed?.metaapi_pending_tx ?? null;
    if (!tx) return { error: "move_in_progress" };
  }

  const created = await postAccount(token, tx, accountPayload(row, login, cred.password, region));
  if ("pending" in created) return { pending: true };
  if ("message" in created) {
    await db.from("accounts").update({ metaapi_pending_tx: null, metaapi_moving_to: null, metaapi_error: created.message }).eq("id", row.id);
    return { error: "metaapi_rejected", message: created.message };
  }

  const oldId = row.metaapi_account_id;
  await db.from("accounts").update({
    metaapi_account_id: created.id,
    metaapi_state: created.state,
    metaapi_connection: null,
    metaapi_region: region,
    metaapi_zone: null,
    metaapi_pending_tx: null,
    metaapi_moving_to: null,
    metaapi_error: null,
    metaapi_synced_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (oldId !== created.id) {
    const del = await metaFetch(token, `${PROVISIONING}/users/current/accounts/${encodeURIComponent(oldId)}`, { method: "DELETE" });
    if (!del.ok && del.status !== 404) {
      const message = `Old ${row.metaapi_region ?? ""} terminal ${oldId} could not be removed: ${errorText(del.body, del.status)}`;
      await db.from("accounts").update({ metaapi_error: message }).eq("id", row.id);
    }
  }
  return { id: created.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const metaToken = Deno.env.get("METAAPI_TOKEN");
    if (!metaToken) return json({ error: "token_missing" }, 500);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const cronKey = req.headers.get("x-cron-key");
    if (cronKey) {
      const { data: expected } = await db.rpc("metaapi_cron_key");
      if (!expected || cronKey !== expected) return json({ error: "unauthorized" }, 401);
      const { data: rows, error } = await cloudAccounts(db).limit(200);
      if (error) return json({ error: "load_failed" }, 500);
      return json({ ok: true, accounts: rows?.length ?? 0, executed: await pump(db, metaToken, rows ?? []) });
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: caller, error: callerErr } = await db.auth.getUser(jwt);
    if (callerErr || !caller.user) return json({ error: "unauthorized" }, 401);
    const { data: me } = await db.from("app_members").select("role, status").eq("user_id", caller.user.id).maybeSingle();
    if (!me || !["admin", "trader"].includes(me.role) || me.status !== "active") return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const cols = "id, account_name, platform, broker_server, metaapi_account_id, metaapi_pending_tx, metaapi_state";

    if (action === "sync") {
      const { data: rows, error } = await db
        .from("accounts")
        .select(cols)
        .eq("connection_method", "metaapi")
        .eq("frozen", false)
        .not("metaapi_account_id", "is", null);
      if (error) return json({ error: "load_failed" }, 500);
      const list = (rows ?? []) as Row[];
      let synced = 0;
      for (let i = 0; i < list.length; i += 5) {
        const results = await Promise.all(list.slice(i, i + 5).map((r) => syncOne(db, metaToken, r).catch(() => ({ ok: false }))));
        synced += results.filter((r) => r.ok).length;
      }
      return json({ ok: true, total: list.length, synced });
    }

    if (action === "relay") {
      const names = Array.isArray(body.accounts)
        ? (body.accounts as unknown[]).filter((n): n is string => typeof n === "string").slice(0, 20)
        : [];
      if (!names.length) return json({ ok: true, accounts: 0 });
      const { data: rows, error } = await cloudAccounts(db).in("account_name", names);
      if (error) return json({ error: "load_failed" }, 500);
      return json({ ok: true, accounts: rows?.length ?? 0, executed: await pump(db, metaToken, rows ?? []) });
    }

    if (action === "list") {
      const res = await metaFetch(metaToken, `${PROVISIONING}/users/current/accounts?limit=1000`);
      if (!res.ok) return json({ error: "metaapi_rejected", message: errorText(res.body as Record<string, unknown> | null, res.status) }, 400);
      const raw = (Array.isArray(res.body) ? res.body : Array.isArray(res.body?.items) ? res.body.items : []) as Record<string, unknown>[];
      const { data: linked } = await db.from("accounts").select("account_name, metaapi_account_id").not("metaapi_account_id", "is", null);
      const byId = new Map((linked ?? []).map((l) => [l.metaapi_account_id as string, l.account_name as string]));
      const accounts = raw.map((a) => {
        const id = String(a._id ?? a.id ?? "");
        return {
          id,
          name: String(a.name ?? ""),
          login: String(a.login ?? ""),
          server: String(a.server ?? ""),
          platform: String(a.platform ?? "").toUpperCase(),
          state: String(a.state ?? ""),
          connection: String(a.connectionStatus ?? ""),
          linked_to: byId.get(id) ?? null,
        };
      }).filter((a) => a.id);
      return json({ ok: true, accounts });
    }

    if (action === "servers") {
      const query = typeof body.query === "string" ? body.query.trim().slice(0, 60) : "";
      const version = body.platform === "MT4" ? 4 : 5;
      if (query.length < 2) return json({ ok: true, brokers: [] });
      const qs = `query=${encodeURIComponent(query)}`;
      let res = await metaFetch(metaToken, `${PROVISIONING}/known-mt-servers/${version}/search?${qs}`);
      if (res.status === 404) res = await metaFetch(metaToken, `${PROVISIONING}/users/current/known-mt-servers/${version}/search?${qs}`);
      if (!res.ok) return json({ error: "metaapi_rejected", message: errorText(res.body, res.status) }, 400);
      const raw = res.body && typeof res.body === "object" && !Array.isArray(res.body) ? res.body : {};
      const brokers = Object.entries(raw)
        .map(([broker, list]) => ({
          broker,
          servers: Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [],
        }))
        .filter((b) => b.servers.length);
      return json({ ok: true, brokers });
    }

    if (action === "suspend") {
      const accountId = typeof body.account_id === "string" ? body.account_id : "";
      const { data: row } = await db.from("accounts").select(cols).eq("id", accountId).eq("connection_method", "metaapi").maybeSingle();
      if (!row?.metaapi_account_id) return json({ error: "not_found" }, 404);
      const res = await metaFetch(metaToken, `${PROVISIONING}/users/current/accounts/${encodeURIComponent(row.metaapi_account_id)}/undeploy`, { method: "POST" });
      if (!res.ok) return json({ error: "metaapi_rejected", message: errorText(res.body, res.status) }, 400);
      await db.from("accounts").update({
        metaapi_state: "UNDEPLOYING",
        metaapi_connection: "DISCONNECTED",
        metaapi_error: null,
        metaapi_synced_at: new Date().toISOString(),
      }).eq("id", row.id);
      await db.from("activity_log").insert({
        actor_id: caller.user.id, actor_email: caller.user.email, action: "metaapi_suspend", category: "accounts", target: row.account_name, meta: {},
      });
      return json({ ok: true });
    }

    if (action === "regions") {
      const allowed = await primaryRegions(metaToken);
      if (!allowed) return json({ error: "regions_unavailable" }, 502);
      return json({ ok: true, regions: allowed });
    }

    if (action === "move_region") {
      const accountId = typeof body?.account_id === "string" ? body.account_id : "";
      const region = typeof body?.region === "string" ? body.region : "";
      const allowed = await primaryRegions(metaToken);
      if (!allowed) return json({ error: "regions_unavailable" }, 502);
      if (!allowed.includes(region)) return json({ error: "bad_region" }, 400);
      const { data: row } = await db.from("accounts").select(`${cols}, metaapi_region, metaapi_moving_to`).eq("id", accountId).eq("connection_method", "metaapi").maybeSingle();
      if (!row) return json({ error: "not_found" }, 404);
      const moved = await moveRegion(db, metaToken, row as Row & { metaapi_region: string | null; metaapi_moving_to: string | null }, region);
      if ("error" in moved) return json(moved, 400);
      if ("pending" in moved) return json({ ok: true, pending: true });
      await db.from("activity_log").insert({
        actor_id: caller.user.id, actor_email: caller.user.email, action: "metaapi_move_region", category: "accounts", target: (row as Row).account_name, meta: { from: (row as { metaapi_region: string | null }).metaapi_region, to: region },
      });
      return json({ ok: true });
    }

    if (action === "connect") {
      const accountId = typeof body.account_id === "string" ? body.account_id : "";
      const { data: row } = await db.from("accounts").select(cols).eq("id", accountId).eq("connection_method", "metaapi").maybeSingle();
      if (!row) return json({ error: "not_found" }, 404);
      const account = row as Row;

      if (!account.metaapi_account_id) {
        const created = await createCloudAccount(db, metaToken, account);
        if ("error" in created) return json(created, 400);
        if ("pending" in created) return json({ ok: true, pending: true });
        account.metaapi_account_id = created.id;
      } else {
        const op = account.metaapi_state === "DEPLOYED" ? "redeploy" : "deploy";
        const res = await metaFetch(metaToken, `${PROVISIONING}/users/current/accounts/${encodeURIComponent(account.metaapi_account_id)}/${op}`, { method: "POST" });
        if (!res.ok) {
          const message = errorText(res.body, res.status);
          await db.from("accounts").update({ metaapi_error: message, metaapi_synced_at: new Date().toISOString() }).eq("id", account.id);
          return json({ error: "metaapi_rejected", message }, 400);
        }
      }
      await syncOne(db, metaToken, account);
      await db.from("activity_log").insert({
        actor_id: caller.user.id, actor_email: caller.user.email, action: "metaapi_connect", category: "accounts", target: account.account_name, meta: {},
      });
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("metaapi function failed", err);
    return json({ error: "server_error" }, 500);
  }
});
