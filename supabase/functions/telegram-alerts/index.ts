import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

async function tg(token: string, method: string, payload?: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await res.json().catch(() => null);
  return body && body.ok ? body.result : null;
}

async function findChats(token: string): Promise<string[]> {
  const updates = await tg(token, "getUpdates", { allowed_updates: ["message", "my_chat_member"] });
  if (!Array.isArray(updates)) return [];
  const ids = new Set<string>();
  for (const u of updates) {
    const chat = u?.message?.chat ?? u?.my_chat_member?.chat;
    if (chat && (typeof chat.id === "number" || typeof chat.id === "string")) ids.add(String(chat.id));
  }
  return [...ids];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: caller, error: callerErr } = await service.auth.getUser(jwt);
    if (callerErr || !caller.user) return json({ error: "unauthorized" }, 401);

    const { data: me } = await service
      .from("app_members")
      .select("role, status")
      .eq("user_id", caller.user.id)
      .maybeSingle();
    if (!me || me.status !== "active" || !["admin", "trader"].includes(me.role)) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const action = body?.action;

    const { data: cfg, error: cfgErr } = await service.from("telegram_alert_config").select("*").eq("id", 1).maybeSingle();
    if (cfgErr) return json({ error: "server_error" }, 500);

    if (action === "status") {
      return json({
        ok: true,
        connected: !!cfg,
        enabled: cfg?.enabled ?? false,
        bot_username: cfg?.bot_username ?? "",
        chats: cfg?.chat_ids?.length ?? 0,
        is_admin: me.role === "admin",
      });
    }

    if (me.role !== "admin") return json({ error: "forbidden" }, 403);

    if (action === "connect") {
      const raw = typeof body.token === "string" ? body.token.trim() : "";
      const token = raw || cfg?.bot_token || "";
      if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) return json({ error: "invalid_token" }, 400);

      const bot = await tg(token, "getMe");
      if (!bot?.username) return json({ error: "invalid_token" }, 400);

      const found = await findChats(token);
      const chats = [...new Set([...(raw && raw !== cfg?.bot_token ? [] : cfg?.chat_ids ?? []), ...found])];
      if (chats.length === 0) return json({ error: "no_chat", bot_username: bot.username }, 400);

      const { error } = await service.from("telegram_alert_config").upsert({
        id: 1,
        bot_token: token,
        bot_username: bot.username,
        chat_ids: chats,
        enabled: true,
        enabled_at: cfg?.enabled ? cfg.enabled_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: "server_error" }, 500);

      for (const chat_id of chats) {
        await tg(token, "sendMessage", { chat_id, text: "MyTrader Tools 已連接。跟單失敗或卡住時，你會在這裡即時收到警報。" });
      }
      await service.from("activity_log").insert({
        actor_id: caller.user.id, actor_email: caller.user.email, action: "telegram_alerts_connected",
        category: "app_settings", target: `@${bot.username}`, meta: { chats: chats.length },
      });
      return json({ ok: true, bot_username: bot.username, chats: chats.length });
    }

    if (!cfg) return json({ error: "not_connected" }, 400);

    if (action === "test") {
      let sent = 0;
      for (const chat_id of cfg.chat_ids) {
        if (await tg(cfg.bot_token, "sendMessage", { chat_id, text: "MyTrader Tools 測試警報：Telegram 通知運作正常。" })) sent++;
      }
      if (sent === 0) return json({ error: "send_failed" }, 502);
      return json({ ok: true, sent });
    }

    if (action === "set_enabled") {
      const enabled = body.enabled === true;
      const { error } = await service.from("telegram_alert_config").update({
        enabled,
        enabled_at: enabled ? new Date().toISOString() : cfg.enabled_at,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      if (error) return json({ error: "server_error" }, 500);
      return json({ ok: true });
    }

    if (action === "disconnect") {
      const { error } = await service.from("telegram_alert_config").delete().eq("id", 1);
      if (error) return json({ error: "server_error" }, 500);
      await service.from("activity_log").insert({
        actor_id: caller.user.id, actor_email: caller.user.email, action: "telegram_alerts_disconnected",
        category: "app_settings", target: `@${cfg.bot_username}`, meta: {},
      });
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (_err) {
    return json({ error: "server_error" }, 500);
  }
});
