import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const REPORT_STATUSES = ["checking", "blocked", "installing", "installed", "failed", "uninstalled"];
const MAX_ACCOUNTS = 40;
const ONLINE_WINDOW_MS = 45_000;
const SETUP_LINK_SECONDS = 6 * 3600;
const LEARN_MAX_BYTES: Record<string, number> = { MT4: 2 * 1024 * 1024, MT5: 4 * 1024 * 1024 };
const LEARN_ONLINE_MS = 10 * 60_000;
const RELEASE_RECHECK_MS = 2 * 60_000;
const COLLECTOR_DAYS = 30;
const FILE_STAFF = ["admin", "trader", "broker_files"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const baseName = (file: string) => file.replace(/\.[^.]+$/, "");
// MT4 files are Server.srv, or Server__servers.ini for newer MT4 that keeps found servers in one shared file.
const mt4Label = (file: string) => norm(baseName(file).split("__")[0]);
const FALLBACK_FILE_CAP = 500;

async function listAll(service: SupabaseClient, bucket: string, prefix: string) {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await service.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const f of data ?? []) if (f.id) names.push(f.name);
    if (!data || data.length < 1000) return names;
  }
}

function brokerMatches(label: string, server: string, broker: string) {
  return !!label && label !== "servers" && (server.includes(label) || (!!broker && (broker.includes(label) || label.includes(broker))));
}

type PackageAccount = { platform: string; broker: string | null; server: string | null };

function pickServerFiles(accounts: PackageAccount[], mt4Names: string[], mt5Names: string[]) {
  const picked = { MT4: new Set<string>(), MT5: new Set<string>() };
  let mt4Fallback = false;
  let mt5Fallback = false;
  for (const a of accounts) {
    const server = norm(a.server);
    const broker = norm(a.broker);
    if (a.platform === "MT4") {
      const serverOnly = norm(String(a.server ?? "").split(" - ")[0]);
      let hits = mt4Names.filter((n) => server && (mt4Label(n) === server || mt4Label(n) === serverOnly));
      if (!hits.length && broker) hits = mt4Names.filter((n) => mt4Label(n).startsWith(broker));
      if (!hits.length) mt4Fallback = true;
      hits.forEach((n) => picked.MT4.add(n));
    } else {
      const hits = mt5Names.filter((n) => brokerMatches(norm(baseName(n).split("__")[0]), server, broker));
      if (!hits.length) mt5Fallback = true;
      hits.forEach((n) => picked.MT5.add(n));
    }
  }
  if (mt4Fallback) mt4Names.slice(0, FALLBACK_FILE_CAP).forEach((n) => picked.MT4.add(n));
  if (mt5Fallback) mt5Names.slice(0, FALLBACK_FILE_CAP).forEach((n) => picked.MT5.add(n));
  return picked;
}

function pickBrokerSetup(accounts: PackageAccount[], platform: string, setupNames: string[]) {
  for (const a of accounts.filter((x) => x.platform === platform)) {
    const hit = setupNames.find((n) => brokerMatches(norm(baseName(n)), norm(a.server), norm(a.broker)));
    if (hit) return `${platform.toLowerCase()}/brokers/${hit}`;
  }
  return `${platform.toLowerCase()}/setup.exe`;
}

function loginOf(accountName: string) {
  const login = accountName.split("-")[2] ?? "";
  return /^\d{3,15}$/.test(login) ? login : null;
}

type ChartHint = { symbol_map: Record<string, string> | null; add_prefix: string | null; add_suffix: string | null };

function pickEurusd(symbols: string[] | null | undefined, hint?: ChartHint) {
  const list = (symbols ?? []).filter((s) => /EURUSD/i.test(s) && s.length <= 16);
  const exact = list.find((s) => s.toUpperCase() === "EURUSD");
  if (exact) return exact;
  const known = list.sort((a, b) => a.length - b.length)[0];
  if (known) return known;
  const mapped = hint?.symbol_map ? Object.entries(hint.symbol_map).find(([from]) => /^EURUSD/i.test(from))?.[1] : undefined;
  if (mapped) return mapped;
  return `${hint?.add_prefix ?? ""}EURUSD${hint?.add_suffix ?? ""}`;
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function groupMembers(service: SupabaseClient, master: string) {
  const { data, error } = await service.from("copy_settings").select("follower_account").eq("master_account", master);
  if (error) throw error;
  return new Set([master, ...(data ?? []).map((r) => r.follower_account as string)]);
}

async function installableFor(service: SupabaseClient, jwt: string, userId: string, role: string) {
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await asUser.rpc("my_linked_accounts");
  if (error) throw error;
  const rows = (data ?? []) as { account_name: string; relation: string }[];
  let clientsAllowed = false;
  if (role === "agent") {
    const { data: agent } = await service.from("agents").select("perm_install_terminals, status").eq("user_id", userId).maybeSingle();
    clientsAllowed = !!agent?.perm_install_terminals && agent.status === "active";
  }
  return new Set(rows.filter((r) => r.relation === "own" || (r.relation === "client" && clientsAllowed)).map((r) => r.account_name));
}

async function createPackage(service: SupabaseClient, req: Request, body: Record<string, unknown>) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerErr } = await service.auth.getUser(jwt);
  if (callerErr || !caller.user) return json({ error: "unauthorized" }, 401);
  const { data: me } = await service.from("app_members").select("role, status").eq("user_id", caller.user.id).maybeSingle();
  if (!me || me.status !== "active") return json({ error: "forbidden" }, 403);
  const staff = ["admin", "trader"].includes(me.role);
  if (!staff && !["client", "agent"].includes(me.role)) return json({ error: "forbidden" }, 403);

  const wanted = Array.isArray(body.accounts) ? [...new Set(body.accounts.filter((a): a is string => typeof a === "string"))] : [];
  const hours = body.validity === "later" ? 24 * 7 : 1;
  if (wanted.length === 0) return json({ error: "Choose at least one account." }, 400);
  if (wanted.length > MAX_ACCOUNTS) return json({ error: `A package can hold at most ${MAX_ACCOUNTS} accounts.` }, 400);

  let master = cleanText(body.master, 120);
  let groupName = "";
  if (staff) {
    if (!master) return json({ error: "Choose a group." }, 400);
    const members = await groupMembers(service, master);
    if (wanted.some((a) => !members.has(a))) return json({ error: "Some accounts are not part of this group." }, 400);
    const { data: group } = await service.from("copy_groups").select("name").eq("master_account", master).maybeSingle();
    groupName = group?.name ?? "";
  } else {
    const allowed = await installableFor(service, jwt, caller.user.id, me.role);
    if (wanted.some((a) => !allowed.has(a))) return json({ error: "You can only install your own accounts." }, 403);
    master = wanted[0];
    groupName = cleanText(body.label, 60) || "My accounts";
  }

  const { data: rows, error: accErr } = await service
    .from("accounts")
    .select("id, account_name, platform, broker, broker_server, account_credentials(password)")
    .in("account_name", wanted);
  if (accErr) throw accErr;
  const problems: string[] = [];
  for (const name of wanted) {
    const row = rows?.find((r) => r.account_name === name);
    const cred = row?.account_credentials as { password: string } | { password: string }[] | null | undefined;
    const password = Array.isArray(cred) ? cred[0]?.password : cred?.password;
    if (!row) problems.push(`${name}: not found`);
    else if (!loginOf(name)) problems.push(`${name}: login number missing in name`);
    else if (!row.broker_server) problems.push(`${name}: no server`);
    else if (!password) problems.push(`${name}: no password`);
  }
  if (problems.length) return json({ error: "Some accounts are not ready.", problems }, 400);

  const [mt4Names, mt5Names] = await Promise.all([listAll(service, "terminal-servers", "mt4"), listAll(service, "terminal-servers", "mt5")]);
  const noServerFile = (rows ?? [])
    .filter((r) => {
      const server = norm(r.broker_server);
      if (r.platform === "MT5") return !mt5Names.some((n) => brokerMatches(norm(baseName(n).split("__")[0]), server, norm(r.broker)));
      return !mt4Names.some((n) => mt4Label(n) === server);
    })
    .map((r) => `${r.account_name} (${r.broker_server})`);

  const token = randomKey();
  const expires = new Date(Date.now() + hours * 3600_000).toISOString();
  if (staff) await rememberSiteOrigin(service, body.origin);

  const { data: inserted, error: insErr } = await service
    .from("terminal_installations")
    .insert({
      master_account: master,
      group_name: groupName,
      account_names: wanted,
      follow_group: staff,
      token_hash: await sha256(token),
      expires_at: expires,
      created_by: caller.user.id,
      build: cleanText(body.build, 20) || null,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return json({ id: inserted.id, token, expires_at: expires, no_server_file: noServerFile });
}

async function claimPackage(service: SupabaseClient, body: Record<string, unknown>) {
  const token = cleanText(body.token, 100);
  const machineId = cleanText(body.machine_id, 100);
  const machineName = cleanText(body.machine_name, 100);
  if (!token || !machineId) return json({ error: "Missing install code." }, 400);

  const { data: inst } = await service.from("terminal_installations").select("*").eq("token_hash", await sha256(token)).maybeSingle();
  if (!inst) return json({ error: "This install package is not valid. Download a new one from the website." }, 404);
  if (inst.status === "uninstalled") return json({ error: "This package was uninstalled. Download a new one from the website." }, 410);
  if (new Date(inst.expires_at).getTime() < Date.now()) return json({ error: "This install package has expired. Download a new one from the website." }, 410);
  if (inst.machine_id && inst.machine_id !== machineId) {
    return json({ error: `This package was already used on another PC (${inst.machine_name ?? "unknown"}). Download a new one for this PC.` }, 409);
  }

  const installKey = randomKey();
  const { error: upErr } = await service
    .from("terminal_installations")
    .update({
      install_key_hash: await sha256(installKey),
      machine_id: machineId,
      machine_name: machineName,
      claimed_at: inst.claimed_at ?? new Date().toISOString(),
      status: "checking",
      updated_at: new Date().toISOString(),
    })
    .eq("id", inst.id);
  if (upErr) throw upErr;

  const names = inst.account_names as string[];
  const [accounts, setRes, mt4Names, mt5Names, mt4Setups, mt5Setups, latestRes] = await Promise.all([
    packageAccounts(service, names),
    service.from("terminal_installer_settings").select("mt4_installer_url, mt5_installer_url").eq("id", 1).maybeSingle(),
    listAll(service, "terminal-servers", "mt4"),
    listAll(service, "terminal-servers", "mt5"),
    listAll(service, "terminal-setups", "mt4/brokers"),
    listAll(service, "terminal-setups", "mt5/brokers"),
    service.from("terminal_installations").select("build").not("build", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const setupPaths = [pickBrokerSetup(accounts, "MT4", mt4Setups), pickBrokerSetup(accounts, "MT5", mt5Setups)];
  const { data: setupSigned } = await service.storage.from("terminal-setups").createSignedUrls(setupPaths, SETUP_LINK_SECONDS);
  const uploadedSetup = (prefix: string) =>
    setupSigned?.find((s) => s.path?.startsWith(`${prefix}/`) && !s.error)?.signedUrl ?? "";

  const picked = pickServerFiles(accounts, mt4Names, mt5Names);
  const serverFiles: { platform: string; name: string; url: string }[] = [];
  for (const platform of ["MT4", "MT5"] as const) {
    const files = [...picked[platform]];
    if (!files.length) continue;
    const prefix = platform.toLowerCase();
    const { data: signed } = await service.storage.from("terminal-servers").createSignedUrls(files.map((f) => `${prefix}/${f}`), 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) serverFiles.push({ platform, name: s.path.split("/").pop()!, url: s.signedUrl });
    }
  }

  return json({
    installation_id: inst.id,
    install_key: installKey,
    group: { master: inst.master_account, name: inst.group_name || inst.master_account },
    accounts,
    installers: {
      MT4: uploadedSetup("mt4") || setRes.data?.mt4_installer_url || "",
      MT5: uploadedSetup("mt5") || setRes.data?.mt5_installer_url || "",
    },
    server_files: serverFiles,
    latest_build: latestRes.data?.build ?? "",
    bridge: { url: Deno.env.get("SUPABASE_URL"), key: Deno.env.get("SUPABASE_ANON_KEY") },
  });
}

async function packageAccounts(service: SupabaseClient, names: string[]) {
  if (!names.length) return [];
  const [accRes, symRes, hintRes] = await Promise.all([
    service.from("accounts").select("id, account_name, platform, type, broker, broker_server, account_credentials(password), account_bridge_keys(bridge_key)").in("account_name", names),
    service.from("account_symbols").select("account_name, symbols").in("account_name", names),
    service.from("copy_settings").select("follower_account, symbol_map, add_prefix, add_suffix").in("follower_account", names),
  ]);
  if (accRes.error) throw accRes.error;
  const symbols = new Map((symRes.data ?? []).map((r) => [r.account_name as string, r.symbols as string[]]));
  const hints = new Map((hintRes.data ?? []).map((r) => [r.follower_account as string, r as ChartHint]));
  return names
    .map((name) => accRes.data?.find((a) => a.account_name === name))
    .filter((a) => !!a)
    .map((a) => {
      const cred = a!.account_credentials as { password: string } | { password: string }[] | null;
      const bk = a!.account_bridge_keys as { bridge_key: string } | { bridge_key: string }[] | null;
      return {
        account_name: a!.account_name as string,
        platform: a!.platform as string,
        type: a!.type as string,
        broker: a!.broker as string | null,
        server: a!.broker_server as string | null,
        login: loginOf(a!.account_name),
        password: (Array.isArray(cred) ? cred[0]?.password : cred?.password) ?? "",
        chart_symbol: pickEurusd(symbols.get(a!.account_name), hints.get(a!.account_name)),
        bridge_key: (Array.isArray(bk) ? bk[0]?.bridge_key : bk?.bridge_key) ?? "",
      };
    })
    .sort((a, b) => (a.type === b.type ? a.account_name.localeCompare(b.account_name) : a.type === "master" ? -1 : 1));
}

async function findByKey(service: SupabaseClient, body: Record<string, unknown>) {
  const key = cleanText(body.install_key, 100);
  if (!key) return null;
  const { data } = await service
    .from("terminal_installations")
    .select("id, account_names, status, master_account, follow_group, uninstall_requested_at, uninstall_picked_at, desktop_command, desktop_command_at, desktop_command_picked_at")
    .eq("install_key_hash", await sha256(key))
    .maybeSingle();
  return data;
}

// Hands a pending remote-uninstall request to the PC once; a repeat needs a new request from the website.
// Older PC programs do not send can_uninstall and would silently drop the request, so they are skipped until they update.
// Window commands are only useful while the operator is watching, so old ones are dropped.
async function takeDesktopCommand(service: SupabaseClient, inst: Record<string, unknown>) {
  const at = inst.desktop_command_at as string | null;
  if (!inst.desktop_command || !at || inst.desktop_command_picked_at || Date.now() - new Date(at).getTime() > 3 * 60_000) return null;
  const { data, error } = await service.from("terminal_installations")
    .update({ desktop_command_picked_at: new Date().toISOString() })
    .eq("id", inst.id).eq("desktop_command_at", at).is("desktop_command_picked_at", null)
    .select("id");
  if (error) throw error;
  return data && data.length > 0 ? inst.desktop_command as string : null;
}

async function desktopPoll(service: SupabaseClient, body: Record<string, unknown>) {
  const inst = await findByKey(service, body);
  if (!inst) return json({ error: "unknown installation" }, 404);
  return json({ desktop_command: await takeDesktopCommand(service, inst) });
}

async function desktopDone(service: SupabaseClient, body: Record<string, unknown>) {
  const inst = await findByKey(service, body);
  if (!inst) return json({ error: "unknown installation" }, 404);
  const result = String(body.result ?? "").slice(0, 500);
  const { error } = await service.from("terminal_installations").update({ desktop_command_result: result }).eq("id", inst.id);
  if (error) throw error;
  return json({ ok: true });
}

async function takeUninstall(service: SupabaseClient, inst: Record<string, unknown>, body: Record<string, unknown>) {
  if (body.can_uninstall !== true || !inst.uninstall_requested_at || inst.uninstall_picked_at || inst.status === "uninstalled") return false;
  const { error } = await service.from("terminal_installations").update({ uninstall_picked_at: new Date().toISOString() }).eq("id", inst.id);
  if (error) throw error;
  return true;
}

async function rememberSiteOrigin(service: SupabaseClient, value: unknown) {
  let origin = "";
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol === "https:" && !/localhost|webcontainer|local-credentialless/i.test(url.hostname)) origin = url.origin;
  } catch {
    return;
  }
  if (!origin) return;
  const { data } = await service.from("terminal_release").select("site_origin").eq("id", 1).maybeSingle();
  if (data?.site_origin === origin) return;
  await service.from("terminal_release").upsert({ id: 1, site_origin: origin, checked_at: null });
}

async function shortCode(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function fetchSiteFile(origin: string, path: string) {
  const res = await fetch(`${origin}${path}?t=${Date.now()}`, { cache: "no-store" });
  const text = res.ok ? await res.text() : "";
  if (!text || /^\s*<!doctype html/i.test(text)) throw new Error(`could not read ${path}`);
  return text;
}

type Release = { ea_code: string; control_code: string; files: { mt4: string; mt5: string; control: string; collector?: string } };

// Reads the newest EA and control script from the published website, at most every few minutes.
async function latestRelease(service: SupabaseClient): Promise<Release | null> {
  const { data: row } = await service.from("terminal_release").select("*").eq("id", 1).maybeSingle();
  if (!row?.site_origin) return null;
  const cached = row.files && row.ea_code && row.control_code ? (row as Release) : null;
  if (cached && row.checked_at && Date.now() - new Date(row.checked_at).getTime() < RELEASE_RECHECK_MS) return cached;
  try {
    const [mt4, mt5, control, collector] = await Promise.all([
      fetchSiteFile(row.site_origin, "/downloads/MT4LiveBridge.mq4"),
      fetchSiteFile(row.site_origin, "/downloads/MT5LiveBridge.mq5"),
      fetchSiteFile(row.site_origin, "/downloads/installer/control.ps1"),
      fetchSiteFile(row.site_origin, "/downloads/installer/collectServers.ps1").catch(() => cached?.files.collector ?? ""),
    ]);
    const release = { ea_code: await shortCode(`${mt4}\0${mt5}`), control_code: await shortCode(control), files: { mt4, mt5, control, collector } };
    await service.from("terminal_release").update({ ...release, checked_at: new Date().toISOString() }).eq("id", 1);
    return release;
  } catch (err) {
    console.error(err);
    await service.from("terminal_release").update({ checked_at: new Date().toISOString() }).eq("id", 1);
    return cached;
  }
}


// Only matched files; the PC falls back to the server files it already keeps from installation.
async function accountServerFiles(service: SupabaseClient, acc: PackageAccount) {
  const platform = acc.platform === "MT5" ? "MT5" : "MT4";
  const prefix = platform.toLowerCase();
  const names = await listAll(service, "terminal-servers", prefix);
  const picked = pickServerFiles([acc], platform === "MT4" ? names : [], platform === "MT5" ? names : []);
  if (picked[platform].size > 40) return [];
  const files = [...picked[platform]];
  if (!files.length) return [];
  const { data: signed } = await service.storage.from("terminal-servers").createSignedUrls(files.map((f) => `${prefix}/${f}`), 3600);
  return (signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => ({ name: s.path!.split("/").pop()!, url: s.signedUrl }));
}

// The group a PC follows: its master plus every follower. If all followers moved to a new master, the PC follows them.
async function wantedAccounts(service: SupabaseClient, inst: { master_account: string; account_names: string[] }) {
  let master = inst.master_account;
  let members = await groupMembers(service, master);
  if (members.size === 1) {
    const previous = inst.account_names.filter((n) => n !== master);
    if (previous.length) {
      const { data } = await service.from("copy_settings").select("master_account").in("follower_account", previous);
      const masters = [...new Set((data ?? []).map((r) => r.master_account as string))];
      if (masters.length === 1 && masters[0] !== master) {
        master = masters[0];
        members = await groupMembers(service, master);
      }
    }
  }
  const { data: existing, error } = await service.from("accounts").select("account_name").in("account_name", [...members]);
  if (error) throw error;
  const known = new Set((existing ?? []).map((r) => r.account_name as string));
  const names = [master, ...[...members].filter((n) => n !== master).sort()].filter((n) => known.has(n)).slice(0, MAX_ACCOUNTS);
  return { master, names };
}

async function sync(service: SupabaseClient, req: Request, body: Record<string, unknown>) {
  const inst = await findByKey(service, body);
  if (!inst) return json({ error: "unknown installation" }, 404);
  if (inst.status === "uninstalled") return json({ error: "uninstalled" }, 410);
  if (await takeUninstall(service, inst, body)) return json({ uninstall: true });

  const current = inst.account_names as string[];
  let master = inst.master_account as string;
  let wanted = current;
  if (inst.follow_group) {
    const next = await wantedAccounts(service, { master_account: master, account_names: current });
    if (next.names.length) {
      master = next.master;
      wanted = next.names;
    }
  }

  const have = new Set(Array.isArray(body.have) ? body.have.filter((n): n is string => typeof n === "string") : []);
  const added = await packageAccounts(service, wanted.filter((n) => !have.has(n)));
  const add = await Promise.all(
    added.filter((a) => a.login && a.password && a.server).map(async (a) => ({ ...a, files: await accountServerFiles(service, a) })),
  );

  const release = await latestRelease(service);
  const eaCode = cleanText(body.ea_code, 20);
  const out: Record<string, string> = {};
  if (release) {
    out.control_code = release.control_code;
    out.ea_code = release.ea_code;
    if (cleanText(body.control_code, 20) !== release.control_code) out.control = release.files.control;
    if (eaCode !== release.ea_code) {
      out.mt4 = release.files.mt4;
      out.mt5 = release.files.mt5;
    }
    if (release.files.collector) {
      out.collector_code = await shortCode(release.files.collector);
      if (cleanText(body.collector_code, 20) !== out.collector_code) out.collector = release.files.collector;
    }
  }
  const patch: Record<string, unknown> = { synced_at: new Date().toISOString(), ea_code: eaCode || null };
  const ip = senderIp(req);
  if (ip) patch.public_ip = ip;
  const message = cleanText(body.message, 500);
  if (message) patch.sync_message = message;
  if (master !== inst.master_account) {
    patch.master_account = master;
    const { data: group } = await service.from("copy_groups").select("name").eq("master_account", master).maybeSingle();
    if (group?.name) patch.group_name = group.name;
  }
  if (wanted.join("\n") !== current.join("\n")) patch.account_names = wanted;
  const { error } = await service.from("terminal_installations").update(patch).eq("id", inst.id);
  if (error) throw error;

  // An EA update restarts MT, so the PC only updates accounts that hold no positions or orders right now.
  let busy: string[] = [];
  if (out.mt4) {
    const { data: pos, error: posErr } = await service.from("live_positions").select("account_name").in("account_name", wanted);
    if (posErr) throw posErr;
    busy = [...new Set((pos ?? []).map((p) => p.account_name as string))];
  }

  return json({
    wanted,
    add,
    busy,
    release: release ? out : null,
    bridge: { url: Deno.env.get("SUPABASE_URL"), key: Deno.env.get("SUPABASE_ANON_KEY") },
  });
}

async function report(service: SupabaseClient, body: Record<string, unknown>) {
  const inst = await findByKey(service, body);
  if (!inst) return json({ error: "unknown installation" }, 404);
  const status = cleanText(body.status, 20);
  if (!REPORT_STATUSES.includes(status)) return json({ error: "invalid status" }, 400);
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString(), message: cleanText(body.message, 1000) || null };
  if (Number.isInteger(body.capacity) && (body.capacity as number) >= 0 && (body.capacity as number) < 1000) update.capacity = body.capacity;
  if (body.hardware && typeof body.hardware === "object" && JSON.stringify(body.hardware).length < 4000) update.hardware = body.hardware;
  const { error } = await service.from("terminal_installations").update(update).eq("id", inst.id);
  if (error) throw error;
  return json({ ok: true });
}

function terminalState(raw: unknown, names: string[]) {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && names.includes(String(t.account_name)))
    .slice(0, 100)
    .map((t) => ({
      account_name: String(t.account_name),
      running: t.running === true,
      login_ok: t.login_ok === true,
      restarts: Number.isInteger(t.restarts) ? Math.min(Math.max(t.restarts as number, 0), 99) : 0,
      login_error: cleanText(t.login_error, 200) || null,
      ea_error: cleanText(t.ea_error, 200) || null,
      mt_login: /^\d{3,15}$/.test(String(t.mt_login ?? "")) ? String(t.mt_login) : null,
      mt_server: /^[A-Za-z0-9._ -]{2,80}$/.test(String(t.mt_server ?? "")) ? String(t.mt_server).trim() : null,
    }));
}

async function accountStatus(service: SupabaseClient, req: Request, body: Record<string, unknown>) {
  const inst = await findByKey(service, body);
  if (!inst) return json({ error: "unknown installation" }, 404);
  const names = inst.account_names as string[];
  const state = terminalState(body.terminals, names);
  if (state) {
    const { error } = await service.from("terminal_installations")
      .update({ terminal_state: state, terminal_state_at: new Date().toISOString(), public_ip: senderIp(req) ?? undefined })
      .eq("id", inst.id);
    if (error) throw error;
  }
  const uninstall = await takeUninstall(service, inst, body);
  const desktopCommand = await takeDesktopCommand(service, inst);
  const [acc, pos] = await Promise.all([
    service.from("accounts").select("id, account_name, broker_server, last_seen, reconnect_requested_at, reconnect_picked_at").in("account_name", names),
    service.from("live_positions").select("account_name").in("account_name", names),
  ]);
  if (acc.error || pos.error) throw acc.error ?? pos.error;
  const now = Date.now();
  // Requests older than 15 minutes are stale (the PC was off), so they are dropped instead of restarting much later.
  const reconnect = (acc.data ?? [])
    .filter((a) => a.reconnect_requested_at && !a.reconnect_picked_at && now - new Date(a.reconnect_requested_at).getTime() < 15 * 60_000)
    .map((a) => a.account_name as string);
  if (reconnect.length > 0) {
    const { error } = await service.from("accounts").update({ reconnect_picked_at: new Date().toISOString() }).in("account_name", reconnect);
    if (error) throw error;
  }
  // A server fixed by hand in MT on the VDS becomes the website's server, so the next install uses it.
  const serverFixed: { account_name: string; server: string }[] = [];
  for (const t of state ?? []) {
    const a = acc.data?.find((r) => r.account_name === t.account_name);
    if (!a || !t.mt_server || t.mt_login !== loginOf(t.account_name) || norm(t.mt_server) === norm(a.broker_server)) continue;
    const { error } = await service.from("accounts").update({ broker_server: t.mt_server }).eq("id", a.id);
    if (error) throw error;
    serverFixed.push({ account_name: t.account_name, server: t.mt_server });
  }
  return json({
    uninstall,
    desktop_command: desktopCommand,
    server_fixed: serverFixed,
    accounts: names.map((name) => {
      const seen = acc.data?.find((a) => a.account_name === name)?.last_seen;
      return {
        account_name: name,
        online: !!seen && now - new Date(seen).getTime() < ONLINE_WINDOW_MS,
        ever_online: !!seen,
        open_positions: (pos.data ?? []).filter((p) => p.account_name === name).length,
        reconnect: reconnect.includes(name),
      };
    }),
  });
}

async function reconnectDone(service: SupabaseClient, body: Record<string, unknown>) {
  const inst = await findByKey(service, body);
  if (!inst) return json({ error: "unknown installation" }, 404);
  const name = cleanText(body.account_name, 120);
  if (!(inst.account_names as string[]).includes(name)) return json({ error: "unknown account" }, 400);
  const { error } = await service.from("accounts").update({ reconnect_done_at: new Date().toISOString() })
    .eq("account_name", name).not("reconnect_picked_at", "is", null);
  if (error) throw error;
  return json({ ok: true });
}

const fileSafe = (v: string) => v.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");

// A terminal that has logged in sends its working server file, so the next install finds the broker by itself.
async function learnServer(service: SupabaseClient, body: Record<string, unknown>) {
  const inst = await findByKey(service, body);
  if (!inst) return json({ error: "unknown installation" }, 404);
  const name = cleanText(body.account_name, 120);
  if (!(inst.account_names as string[]).includes(name)) return json({ error: "unknown account" }, 400);
  const { data: acc, error } = await service.from("accounts").select("platform, broker, broker_server, last_seen").eq("account_name", name).maybeSingle();
  if (error) throw error;
  const server = fileSafe(acc?.broker_server ?? "");
  if (!acc || !server) return json({ error: "unknown account" }, 400);
  if (!acc.last_seen || Date.now() - new Date(acc.last_seen).getTime() > LEARN_ONLINE_MS) return json({ error: "account not online" }, 409);

  const platform = acc.platform === "MT5" ? "MT5" : "MT4";
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(typeof body.file === "string" ? body.file : ""), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: "invalid file" }, 400);
  }
  if (bytes.length < 64 || bytes.length > LEARN_MAX_BYTES[platform]) return json({ error: "invalid file" }, 400);

  const mt4Path = body.file_name === "servers.ini" ? `mt4/${server}__servers.ini` : `mt4/${server}.srv`;
  const path = platform === "MT4" ? mt4Path : `mt5/${fileSafe(acc.broker ?? "") || server}__${server}.dat`;
  const { error: upErr } = await service.storage.from("terminal-servers").upload(path, bytes, { upsert: body.replace === true, contentType: "application/octet-stream" });
  if (upErr && !/exist|duplicate/i.test(upErr.message)) throw upErr;
  return json({ ok: true, saved: !upErr });
}

async function createCollectorKey(service: SupabaseClient, req: Request, body: Record<string, unknown>) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerErr } = await service.auth.getUser(jwt);
  if (callerErr || !caller.user) return json({ error: "unauthorized" }, 401);
  const { data: me } = await service.from("app_members").select("role, status").eq("user_id", caller.user.id).maybeSingle();
  if (!me || me.status !== "active" || !FILE_STAFF.includes(me.role)) return json({ error: "forbidden" }, 403);
  const key = randomKey();
  const expires = new Date(Date.now() + COLLECTOR_DAYS * 86400_000).toISOString();
  const { error } = await service.from("broker_file_collectors").insert({
    key_hash: await sha256(key),
    label: cleanText(body.label, 60) || caller.user.email || "",
    created_by: caller.user.id,
    expires_at: expires,
  });
  if (error) throw error;
  return json({ key, expires_at: expires });
}

// Only staff-made install packages and staff-issued collector keys may add files to the shared library.
async function harvestSender(service: SupabaseClient, body: Record<string, unknown>) {
  const collectKey = cleanText(body.collect_key, 100);
  if (collectKey) {
    const { data } = await service.from("broker_file_collectors").select("id, expires_at").eq("key_hash", await sha256(collectKey)).maybeSingle();
    if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
    await service.from("broker_file_collectors").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
    return { source: "collector", collector_id: data.id as string, installation_id: null };
  }
  const inst = await findByKey(service, body);
  if (!inst || inst.status === "uninstalled" || !inst.follow_group) return null;
  return { source: "pc", collector_id: null, installation_id: inst.id as string };
}

async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SERVER_NAME = /[A-Za-z][A-Za-z0-9.]{2,30}-[A-Za-z0-9][A-Za-z0-9.-]{2,30}(?: \d{1,3})?/g;
// Encrypted files contain random letter runs like "ZO-a"; real server names end in a word such as Live, Demo or a number.
const REAL_SERVER = /-(?:[A-Za-z0-9.-]*(?:live|demo|real|server|trade|ecn|pro|main|prime|\d))/i;

function serversInside(bytes: Uint8Array) {
  const text = `${new TextDecoder("utf-16le").decode(bytes)}\n${new TextDecoder("latin1").decode(bytes)}`;
  const found = new Set<string>();
  for (const m of text.matchAll(SERVER_NAME)) {
    const name = m[0].trim();
    if (!REAL_SERVER.test(name) || !/[a-z]{2}/i.test(name.split("-")[0])) continue;
    found.add(name);
    if (found.size >= 50) break;
  }
  return [...found];
}

const brokerOfServer = (server: string) => fileSafe(server.split("-")[0]).slice(0, 40);
const DEFAULT_BROKER = /^(servers|metaquotes)$/i;

function harvestTarget(platform: string, fileName: string, server: string, brokerHint: string) {
  const lower = fileName.toLowerCase();
  if (platform === "MT4") {
    if (lower === "servers.ini") {
      const safe = fileSafe(server);
      const broker = (safe && brokerOfServer(safe)) || fileSafe(brokerHint).slice(0, 40);
      if (!broker || DEFAULT_BROKER.test(broker)) return null;
      return { path: `mt4/${safe || broker}__servers.ini`, server, broker };
    }
    const srv = lower.endsWith(".srv") ? baseName(fileName) : "";
    const safe = fileSafe(srv);
    const broker = brokerOfServer(safe);
    if (!safe || DEFAULT_BROKER.test(broker)) return null;
    return { path: `mt4/${safe}.srv`, server: srv, broker };
  }
  if (lower !== "servers.dat") return null;
  const safe = fileSafe(server);
  const broker = (safe && brokerOfServer(safe)) || fileSafe(brokerHint).slice(0, 40);
  if (!broker || DEFAULT_BROKER.test(broker)) return null;
  return { path: safe ? `mt5/${broker}__${safe}.dat` : `mt5/${broker}.dat`, server, broker };
}

function fileTime(v: unknown) {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t <= Date.now() + 86400_000 ? t : null;
}

// Age of the library copy: the PC file time of the last collected version, unless someone uploaded by hand after it.
async function storedVersionTime(service: SupabaseClient, path: string) {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const [{ data: last }, { data: files }] = await Promise.all([
    service.from("broker_file_harvest").select("file_modified_at, created_at").eq("stored_path", path)
      .in("status", ["added", "replaced"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.storage.from("terminal-servers").list(path.slice(0, slash), { search: name, limit: 20 }),
  ]);
  const obj = files?.find((f) => f.name === name);
  const uploadedAt = Date.parse(obj?.updated_at ?? obj?.created_at ?? "");
  if (!Number.isFinite(uploadedAt)) return Infinity;
  if (last?.file_modified_at && uploadedAt - Date.parse(last.created_at) < 5 * 60_000) return Date.parse(last.file_modified_at);
  return uploadedAt;
}

function senderIp(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || (req.headers.get("x-real-ip") ?? "").trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

// A server file found on a PC goes into the library under its own name; a newer version replaces the library copy.
async function harvest(service: SupabaseClient, req: Request, body: Record<string, unknown>) {
  const sender = await harvestSender(service, body);
  if (!sender) return json({ error: "not allowed" }, 403);
  const platform = body.platform === "MT5" ? "MT5" : body.platform === "MT4" ? "MT4" : "";
  if (!platform) return json({ error: "invalid platform" }, 400);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(typeof body.file === "string" ? body.file : ""), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: "invalid file" }, 400);
  }
  if (bytes.length < 64 || bytes.length > LEARN_MAX_BYTES[platform]) return json({ error: "invalid file" }, 400);

  const hash = await sha256Bytes(bytes);
  const { data: seen } = await service.from("broker_file_harvest").select("status").eq("sha256", hash).maybeSingle();
  if (seen) return json({ status: "seen" });

  const fileName = cleanText(body.file_name, 120);
  const sharedMt4 = platform === "MT4" && fileName.toLowerCase() === "servers.ini";
  const server = cleanText(body.server, 80) || (sharedMt4 ? serversInside(bytes)[0] ?? "" : "");
  const target = harvestTarget(platform, fileName, server, cleanText(body.broker_hint, 80));
  const modifiedAt = fileTime(body.modified_at);
  let status = "skipped";
  if (target) {
    const put = (upsert: boolean) => service.storage.from("terminal-servers").upload(target.path, bytes, { upsert, contentType: "application/octet-stream" });
    const { error } = await put(false);
    if (!error) status = "added";
    else if (!/exist|duplicate/i.test(error.message)) throw error;
    else if (modifiedAt !== null && modifiedAt > await storedVersionTime(service, target.path)) {
      const { error: replaceErr } = await put(true);
      if (replaceErr) throw replaceErr;
      status = "replaced";
    } else status = "exists";
  }
  const { error: logErr } = await service.from("broker_file_harvest").upsert({
    sha256: hash,
    platform,
    file_name: fileName,
    stored_path: target?.path ?? null,
    broker: target?.broker ?? "",
    server: target?.server ?? "",
    servers_found: platform === "MT5" ? serversInside(bytes) : target ? [target.server] : [],
    status,
    machine_name: cleanText(body.machine_name, 100),
    sender_ip: senderIp(req),
    source: sender.source,
    installation_id: sender.installation_id,
    collector_id: sender.collector_id,
    size_bytes: bytes.length,
    file_modified_at: modifiedAt === null ? null : new Date(modifiedAt).toISOString(),
  }, { onConflict: "sha256", ignoreDuplicates: true });
  if (logErr) throw logErr;
  return json({ status });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "invalid body" }, 400);

    switch (body.action) {
      case "create":
        return await createPackage(service, req, body);
      case "claim":
        return await claimPackage(service, body);
      case "report":
        return await report(service, body);
      case "status":
        return await accountStatus(service, req, body);
      case "reconnect_done":
        return await reconnectDone(service, body);
      case "desktop_poll":
        return await desktopPoll(service, body);
      case "desktop_done":
        return await desktopDone(service, body);
      case "learn_server":
        return await learnServer(service, body);
      case "sync":
        return await sync(service, req, body);
      case "collector_key":
        return await createCollectorKey(service, req, body);
      case "harvest":
        return await harvest(service, req, body);
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
