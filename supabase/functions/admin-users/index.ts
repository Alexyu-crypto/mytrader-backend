import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ROLES = ["admin", "trader", "client", "finance", "ib_manager", "account_opening", "broker_files"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: caller, error: callerErr } = await service.auth.getUser(token);
    if (callerErr || !caller.user) return json({ error: "unauthorized" }, 401);

    const { data: me } = await service
      .from("app_members")
      .select("role, status")
      .eq("user_id", caller.user.id)
      .maybeSingle();
    if (!me || me.role !== "admin" || me.status !== "active") return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const action = body?.action;

    if (action === "create") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const role = ROLES.includes(body.role) ? body.role : "client";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "invalid_email" }, 400);
      if (password.length < 6 || password.length > 72) return json({ error: "weak_password" }, 400);

      const { data: created, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) {
        const exists = (error?.message ?? "").toLowerCase().includes("already");
        return json({ error: exists ? "user_exists" : "create_failed" }, exists ? 409 : 500);
      }
      const { error: upErr } = await service
        .from("app_members")
        .upsert({ user_id: created.user.id, email, role, status: "active", approved_by: caller.user.id });
      if (upErr) return json({ error: "create_failed" }, 500);
      await service.from("activity_log").insert({
        actor_id: caller.user.id, actor_email: caller.user.email, action: "user_created", category: "app_members", target: email, meta: { role },
      });
      return json({ ok: true, user_id: created.user.id });
    }

    if (action === "delete") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      if (!userId) return json({ error: "invalid_user" }, 400);
      if (userId === caller.user.id) return json({ error: "cannot_remove_self" }, 400);

      const { data: target } = await service
        .from("app_members")
        .select("role, status, email")
        .eq("user_id", userId)
        .maybeSingle();
      if (target?.role === "admin" && target.status === "active") {
        const { count } = await service
          .from("app_members")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("status", "active")
          .neq("user_id", userId);
        if (!count) return json({ error: "last_admin" }, 400);
      }

      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) return json({ error: "delete_failed" }, 500);
      await service.from("activity_log").insert({
        actor_id: caller.user.id, actor_email: caller.user.email, action: "user_deleted", category: "app_members", target: target?.email ?? userId, meta: { role: target?.role ?? null },
      });
      return json({ ok: true });
    }

    if (action === "set_password") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!userId) return json({ error: "invalid_user" }, 400);
      if (password.length < 6 || password.length > 72) return json({ error: "weak_password" }, 400);

      const { data: target } = await service.from("app_members").select("email").eq("user_id", userId).maybeSingle();
      if (!target) return json({ error: "invalid_user" }, 404);

      const { error } = await service.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: "password_failed" }, 500);
      if (body.sign_out === true && userId !== caller.user.id) {
        await service.rpc("admin_end_user_sessions", { p_user: userId });
      }
      await service.from("activity_log").insert({
        actor_id: caller.user.id, actor_email: caller.user.email, action: "password_reset", category: "app_members", target: target.email, meta: { signed_out: body.sign_out === true },
      });
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (_err) {
    return json({ error: "server_error" }, 500);
  }
});
