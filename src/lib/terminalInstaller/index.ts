import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

export type InstallValidity = 'now' | 'later';
export type InstallStatus = 'pending' | 'checking' | 'blocked' | 'installing' | 'installed' | 'failed' | 'uninstalled';

export interface Installation {
  id: string;
  master_account: string;
  group_name: string;
  account_names: string[];
  status: InstallStatus;
  machine_name: string | null;
  capacity: number | null;
  hardware: { cores?: number; ram_gb?: number; free_disk_gb?: number; screen?: string; os?: string } | null;
  message: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  follow_group: boolean;
  ea_code: string | null;
  synced_at: string | null;
  sync_message: string | null;
  uninstall_requested_at: string | null;
  uninstall_picked_at: string | null;
  public_ip?: string | null;
  terminal_state?: TerminalState[] | null;
  terminal_state_at?: string | null;
  desktop_command?: DesktopCommand | null;
  desktop_command_at?: string | null;
  desktop_command_picked_at?: string | null;
  desktop_command_result?: string | null;
}

export type DesktopCommand = 'arrange' | 'nextpage';

export interface TerminalState {
  account_name: string;
  running: boolean;
  login_ok: boolean;
  restarts: number;
  login_error: string | null;
  ea_error?: string | null;
  mt_login?: string | null;
  mt_server?: string | null;
}


const FUNCTION_URL = `${supabaseUrl}/functions/v1/terminal-installer`;
export const MAX_PACKAGE_ACCOUNTS = 40;

const RAM_GB = { MT4: 0.2, MT5: 0.35 };
const RESERVE_RAM_GB = 2;
const RAM_SHARE = 0.7;
const TERMINALS_PER_THREAD = 3;

export function estimateNeeds(mt4: number, mt5: number) {
  const n = mt4 + mt5;
  return {
    ramGb: n === 0 ? 0 : Math.ceil(RESERVE_RAM_GB + (mt4 * RAM_GB.MT4 + mt5 * RAM_GB.MT5) / RAM_SHARE),
    threads: Math.ceil(n / TERMINALS_PER_THREAD),
    diskGb: Math.ceil(5 + n * 0.5),
  };
}

export async function createPackage(master: string, accounts: string[], validity: InstallValidity, build: string, label?: string) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
      body: JSON.stringify({ action: 'create', master, accounts, validity, label, build, origin: window.location.origin }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body.token !== 'string') {
    const problems: string[] = Array.isArray(body?.problems) ? body.problems : [];
    const err = new Error(typeof body?.error === 'string' ? body.error : 'Could not create the package.');
    (err as Error & { problems?: string[] }).problems = problems;
    throw err;
  }
  const noServerFile: string[] = Array.isArray(body.no_server_file) ? body.no_server_file.filter((s: unknown) => typeof s === 'string') : [];
  return { id: body.id as string, token: body.token as string, expiresAt: body.expires_at as string, noServerFile };
}

function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const psQuote = (v: string) => v.replace(/'/g, "''").replace(/[\r\n]/g, ' ');

export function groupSlug(master: string) {
  return master.replace(/[^A-Za-z0-9_-]/g, '_');
}

// Always read the newest published files from the server, so an open page never packs an outdated EA or installer.
async function fetchText(path: string) {
  let res: Response;
  try {
    res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  } catch {
    throw new Error('Could not reach the server. Check your connection.');
  }
  const text = res.ok ? await res.text() : '';
  if (!text || /^\s*<!doctype html/i.test(text)) throw new Error('Could not load the EA / installer files from the server. Please try again.');
  return text;
}

async function loadPackageFiles() {
  const [mt4, mt5, installer, control, pcSettings] = await Promise.all([
    fetchText('/downloads/MT4LiveBridge.mq4'),
    fetchText('/downloads/MT5LiveBridge.mq5'),
    fetchText('/downloads/installer/installer.ps1'),
    fetchText('/downloads/installer/control.ps1'),
    fetchText('/downloads/installer/pcSettings.ps1'),
  ]);
  return { mt4, mt5, installer, control, pcSettings };
}

export type PackageFiles = Awaited<ReturnType<typeof loadPackageFiles>>;

export interface BuildInfo {
  version: string;
  code: string;
  label: string;
}

async function buildInfoOf(f: PackageFiles): Promise<BuildInfo> {
  const version = f.mt5.match(/#property\s+version\s+"([^"]+)"/)?.[1] ?? '?';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([f.mt4, f.mt5, f.installer, f.control, f.pcSettings].join('\0')));
  const code = Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return { version, code, label: `EA v${version} · build ${code}` };
}

export async function loadLatestPackage() {
  const files = await loadPackageFiles();
  return { files, build: await buildInfoOf(files) };
}

export function buildInstallerFile(opts: { slug: string; label: string; token: string; files: PackageFiles; build: BuildInfo }) {
  const { files, build } = opts;
  const values: Record<string, string> = {
    __BUILD_CODE__: build.code,
    __BUILD__: build.label.replace(/[^\x20-\x7E]/g, '-'),
    __FUNCTION_URL__: FUNCTION_URL,
    __ANON_KEY__: supabaseAnonKey,
    __INSTALL_CODE__: opts.token,
    __GROUP_SLUG__: opts.slug,
    __GROUP_LABEL__: psQuote(opts.label.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim() || opts.slug),
    __MT4_EA_B64__: toBase64(files.mt4),
    __MT5_EA_B64__: toBase64(files.mt5),
    __CONTROL_B64__: toBase64(files.control),
    __PCSETTINGS_B64__: toBase64(files.pcSettings),
  };
  let script = files.installer;
  for (const [key, value] of Object.entries(values)) script = script.split(key).join(value);

  const header = [
    '@echo off',
    'title Copy Terminals Installer',
    'set "CT_INSTALLER=%~f0"',
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$t = [IO.File]::ReadAllText($env:CT_INSTALLER, [Text.Encoding]::UTF8); iex $t.Substring($t.IndexOf('#PS' + 'START'))\"",
    'exit /b',
    '#PSSTART',
  ].join('\n');
  const content = `${header}\n${script}`.replace(/\r?\n/g, '\r\n');
  return new Blob([content], { type: 'application/octet-stream' });
}

// A double-click file for any staff PC: scans it for MT server files and sends new ones to Broker Files.
export async function buildCollectorFile() {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  const script = await fetchText('/downloads/installer/collectServers.ps1');
  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
      body: JSON.stringify({ action: 'collector_key' }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body.key !== 'string') {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Could not create the collector.');
  }
  const header = [
    '@echo off',
    'title Broker server file collector',
    'set "CT_INSTALLER=%~f0"',
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$t = [IO.File]::ReadAllText($env:CT_INSTALLER, [Text.Encoding]::UTF8); iex $t.Substring($t.IndexOf('#PS' + 'START'))\"",
    'exit /b',
    '#PSSTART',
    `$BfcFunctionUrl = '${psQuote(FUNCTION_URL)}'`,
    `$BfcAnonKey = '${psQuote(supabaseAnonKey)}'`,
    `$BfcCollectKey = '${psQuote(body.key)}'`,
  ].join('\n');
  const content = `${header}\n${script}`.replace(/\r?\n/g, '\r\n');
  return { blob: new Blob([content], { type: 'application/octet-stream' }), expiresAt: typeof body.expires_at === 'string' ? body.expires_at : null };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const INSTALL_FIELDS =
  'id, master_account, group_name, account_names, status, machine_name, capacity, hardware, message, expires_at, created_at, updated_at, follow_group, ea_code, synced_at, sync_message, uninstall_requested_at, uninstall_picked_at';

export async function loadInstallations(master?: string) {
  let query = supabase
    .from('terminal_installations')
    .select(INSTALL_FIELDS);
  if (master) query = query.eq('master_account', master);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(master ? 10 : 20);
  if (error) throw new Error('Could not load install history.');
  return (data ?? []) as Installation[];
}

export async function loadVdsInstallations() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from('terminal_installations')
    .select(`${INSTALL_FIELDS}, public_ip, terminal_state, terminal_state_at, desktop_command, desktop_command_at, desktop_command_picked_at, desktop_command_result`)
    .or(`status.eq.installed,and(status.neq.uninstalled,synced_at.not.is.null),and(status.eq.uninstalled,uninstall_requested_at.gte.${since})`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error('Could not load VDS list. 無法載入 VDS 列表。');
  return (data ?? []) as Installation[];
}

export async function requestDesktopCommand(ids: string[], command: DesktopCommand) {
  const { error } = await supabase.rpc('request_desktop_command', { p_ids: ids, p_command: command });
  if (error) throw new Error('Could not send the command. 無法發送指令。');
}

export async function setRemoteUninstall(id: string, on: boolean) {
  const { data, error } = await supabase.rpc('set_remote_uninstall', { p_id: id, p_on: on });
  if (error) throw new Error(on ? 'Could not send the uninstall request. 無法發送解除安裝指令。' : 'Could not cancel: the PC already started removing. 無法取消：電腦已開始解除。');
  return (data as string | null) ?? null;
}

export async function countOpenPositions(accounts: string[]) {
  if (accounts.length === 0) return 0;
  const { count, error } = await supabase.from('live_positions').select('account_name', { count: 'exact', head: true }).in('account_name', accounts);
  if (error) throw new Error('Could not check open positions. 無法檢查持倉。');
  return count ?? 0;
}

export async function removeInstallation(id: string) {
  const { error } = await supabase.from('terminal_installations').delete().eq('id', id);
  if (error) throw new Error('Could not remove this record.');
}

