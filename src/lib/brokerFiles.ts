import { supabase } from '@/lib/supabase';

export type Platform = 'MT4' | 'MT5';
export type FileKind = 'server' | 'setup';

export interface LibraryFile {
  kind: FileKind;
  platform: Platform;
  name: string;
  path: string;
  broker: string;
  tag: string;
  sizeKb: number;
  updatedAt: string;
  isDefault: boolean;
}

export interface QueueItem {
  id: string;
  file: File;
  kind: FileKind;
  platform: Platform | '';
  broker: string;
  tag: string;
  status: 'ready' | 'uploading' | 'done' | 'failed';
  message: string;
}

export interface Need {
  platform: Platform;
  broker: string;
  server: string;
  accounts: number;
  plannedId?: string;
  note?: string;
}

export interface PlannedBroker {
  id: string;
  platform: Platform;
  broker: string;
  server: string;
  note: string;
}

export interface Coverage extends Need {
  serverFile: string | null;
  setupFile: string | null;
}

export interface InstallerLinks {
  mt4_installer_url: string;
  mt5_installer_url: string;
}

const TAG_SEP = '__';
const SERVERS = 'terminal-servers';
const SETUPS = 'terminal-setups';
export const MAX_SERVER_MB = 5;
export const MAX_SETUP_MB = 100;

export const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
const sizeKbOf = (meta: unknown) => Math.round(Number((meta as { size?: number } | null)?.size ?? 0) / 1024);

export function fileLabel(broker: string) {
  return broker.trim().replace(/[^A-Za-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// Newer MT4 keeps found servers in one shared servers.ini, stored as Server__servers.ini so it can be matched to an account.
const SHARED_MT4 = 'servers.ini';
export const isSharedMt4 = (item: QueueItem) => item.kind === 'server' && item.platform === 'MT4' && item.file.name.toLowerCase() === SHARED_MT4;
const mt4Label = (name: string) => norm(baseName(name).split(TAG_SEP)[0]);

const labelMatches = (label: string, server: string, broker: string) =>
  !!label && label !== 'servers' && (server.includes(label) || (!!broker && (broker.includes(label) || label.includes(broker))));

function splitServerLabel(name: string) {
  const [broker, tag = ''] = baseName(name).split(TAG_SEP);
  return { broker, tag };
}

// 3 = broker + tag both fit the server, 2 = broker fits and file has no tag, 1 = broker fits but tag does not, 0 = other broker
export function mt5FileScore(fileName: string, server: string, broker: string) {
  const parts = splitServerLabel(fileName);
  if (!labelMatches(norm(parts.broker), norm(server), norm(broker))) return 0;
  if (!parts.tag) return 2;
  return norm(server).includes(norm(parts.tag)) ? 3 : 1;
}

function bestMt5File(names: string[], server: string, broker: string) {
  let best: string | null = null;
  let bestScore = 0;
  for (const n of names) {
    const s = mt5FileScore(n, server, broker);
    if (s > bestScore) [best, bestScore] = [n, s];
  }
  return best;
}

async function listAll(bucket: string, prefix: string) {
  const out: { name: string; size: number; updatedAt: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const fetchPage = () => supabase.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    let { data, error } = await fetchPage();
    for (let attempt = 1; error && attempt <= 2; attempt++) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
      ({ data, error } = await fetchPage());
    }
    if (error) throw new Error('Could not load the file library. 未能載入檔案庫。');
    for (const f of data ?? []) {
      if (f.id) out.push({ name: f.name, size: sizeKbOf(f.metadata), updatedAt: f.updated_at ?? f.created_at ?? '' });
    }
    if (!data || data.length < 1000) return out;
  }
}

function serverBroker(platform: Platform, name: string) {
  const base = baseName(name);
  if (platform === 'MT5') return splitServerLabel(name).broker;
  if (base.includes(TAG_SEP)) return base.split(TAG_SEP)[0];
  return base.split('-')[0] || base;
}

export async function loadLibrary(): Promise<LibraryFile[]> {
  const [mt4, mt5, mt4Setups, mt5Setups, mt4Default, mt5Default] = await Promise.all([
    listAll(SERVERS, 'mt4'),
    listAll(SERVERS, 'mt5'),
    listAll(SETUPS, 'mt4/brokers'),
    listAll(SETUPS, 'mt5/brokers'),
    listAll(SETUPS, 'mt4'),
    listAll(SETUPS, 'mt5'),
  ]);
  const servers = ([['MT4', mt4], ['MT5', mt5]] as const).flatMap(([platform, files]) =>
    files.map((f) => ({
      kind: 'server' as const,
      platform,
      name: f.name,
      path: `${platform.toLowerCase()}/${f.name}`,
      broker: serverBroker(platform, f.name),
      tag: platform === 'MT5' ? splitServerLabel(f.name).tag : f.name.includes(TAG_SEP) ? 'Shared 共用' : '',
      sizeKb: f.size,
      updatedAt: f.updatedAt,
      isDefault: false,
    })),
  );
  const setups = ([['MT4', mt4Setups], ['MT5', mt5Setups]] as const).flatMap(([platform, files]) =>
    files.map((f) => ({
      kind: 'setup' as const,
      platform,
      name: f.name,
      path: `${platform.toLowerCase()}/brokers/${f.name}`,
      broker: baseName(f.name),
      tag: '',
      sizeKb: f.size,
      updatedAt: f.updatedAt,
      isDefault: false,
    })),
  );
  const defaults = ([['MT4', mt4Default], ['MT5', mt5Default]] as const).flatMap(([platform, files]) =>
    files.filter((f) => f.name === 'setup.exe').map((f) => ({
      kind: 'setup' as const,
      platform,
      name: f.name,
      path: `${platform.toLowerCase()}/setup.exe`,
      broker: 'Default 預設',
      tag: '',
      sizeKb: f.size,
      updatedAt: f.updatedAt,
      isDefault: true,
    })),
  );
  return [...defaults, ...setups, ...servers];
}

function guessExePlatform(name: string): Platform | '' {
  const n = name.toLowerCase();
  if (/mt5|metatrader ?5|5setup|terminal64/.test(n)) return 'MT5';
  if (/mt4|metatrader ?4|4setup/.test(n)) return 'MT4';
  return '';
}

function brokerWords(text: string) {
  return text
    .replace(/metatrader|setup|installer|install|terminal|x64|mt4|mt5|mt|\d+/gi, ' ')
    .replace(/[^A-Za-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const guessExeBroker = (name: string) => brokerWords(baseName(name));

const SKIP_FOLDERS = /^(config|bases|profiles|templates|logs|history|mql[45]|servers?|files?|new folder|desktop|downloads?|documents|backup|broker ?files?|mt[45]|metatrader ?[45]?)$/i;
const DATA_FOLDER = /^([0-9a-f]{32}|appdata|roaming|local|metaquotes|terminal|users|program files( \(x86\))?)$/i;

// Only trust the folder right above the file (or above "config"); a hidden MT data folder never contains the broker name
function guessFolderBroker(file: File) {
  const parts = (file.webkitRelativePath || '').split('/').slice(0, -1);
  if (parts.some((p) => DATA_FOLDER.test(p))) return '';
  const near = parts.reverse().slice(0, 2).find((p) => !SKIP_FOLDERS.test(p.trim()));
  return near ? brokerWords(near) : '';
}

export function classifyFiles(files: File[]): { items: QueueItem[]; skipped: number } {
  const items: QueueItem[] = [];
  let skipped = 0;
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const base: Omit<QueueItem, 'kind' | 'platform' | 'broker'> = { id: crypto.randomUUID(), file, tag: '', status: 'ready', message: '' };
    if (lower === SHARED_MT4) {
      items.push({ ...base, kind: 'server', platform: 'MT4', broker: '' });
    } else if (lower.endsWith('.srv')) {
      items.push({ ...base, kind: 'server', platform: 'MT4', broker: serverBroker('MT4', file.name) });
    } else if (lower.endsWith('.dat')) {
      const own = splitServerLabel(file.name);
      const generic = own.broker.toLowerCase() === 'servers';
      items.push({ ...base, kind: 'server', platform: 'MT5', broker: generic ? guessFolderBroker(file) : own.broker, tag: generic ? '' : own.tag });
    } else if (lower.endsWith('.exe')) {
      items.push({ ...base, kind: 'setup', platform: guessExePlatform(file.name), broker: guessExeBroker(file.name) || guessFolderBroker(file) });
    } else {
      skipped++;
    }
  }
  return { items, skipped };
}

export function targetPath(item: QueueItem) {
  const p = item.platform.toLowerCase();
  if (item.kind === 'setup') return `${p}/brokers/${fileLabel(item.broker)}.exe`;
  if (item.platform === 'MT5') {
    const tag = fileLabel(item.tag);
    return `${p}/${fileLabel(item.broker)}${tag ? TAG_SEP + tag : ''}.dat`;
  }
  if (isSharedMt4(item)) return `${p}/${fileLabel(item.broker)}${TAG_SEP}${SHARED_MT4}`;
  return `${p}/${item.file.name}`;
}

export function itemProblem(item: QueueItem) {
  if (!item.platform) return 'Choose MT4 or MT5 · 請揀平台';
  if (item.kind === 'server' && item.file.size > MAX_SERVER_MB * 1048576) return `Over ${MAX_SERVER_MB} MB`;
  if (item.kind === 'setup' && item.file.size > MAX_SETUP_MB * 1048576) return `Over ${MAX_SETUP_MB} MB`;
  if (isSharedMt4(item)) return fileLabel(item.broker) ? null : 'Enter the exact server name e.g. EquitiBrokerageSC-Demo · 請輸入完整伺服器名稱';
  if (item.kind === 'server' && item.platform === 'MT4' && !/^[A-Za-z0-9 ._()-]+\.srv$/i.test(item.file.name)) return 'Rename using English letters only · 檔名只可用英文';
  if (item.kind === 'server' && item.platform === 'MT4') return null;
  const label = fileLabel(item.broker);
  if (!label) return 'Enter broker name in English · 請輸入英文券商名';
  if (label.toLowerCase() === 'servers' || label.toLowerCase() === 'setup') return 'Use the broker name · 請輸入券商名稱';
  if (item.tag.trim() && !fileLabel(item.tag)) return 'Tag must use English letters · 標籤只可用英文';
  return null;
}

export function duplicateIds(queue: QueueItem[]) {
  const byPath = new Map<string, string[]>();
  for (const item of queue) {
    if (item.status === 'done' || !item.platform || itemProblem(item)) continue;
    const key = `${item.kind}:${targetPath(item).toLowerCase()}`;
    byPath.set(key, [...(byPath.get(key) ?? []), item.id]);
  }
  return new Set([...byPath.values()].filter((ids) => ids.length > 1).flat());
}

export async function uploadItem(item: QueueItem) {
  const bucket = item.kind === 'setup' ? SETUPS : SERVERS;
  const { error } = await supabase.storage.from(bucket).upload(targetPath(item), item.file, { upsert: true, contentType: 'application/octet-stream' });
  if (error) throw new Error(item.kind === 'setup' ? 'Upload failed, file may be too large · 上載失敗' : 'Upload failed · 上載失敗');
}

export async function deleteLibraryFile(f: LibraryFile) {
  const { error } = await supabase.storage.from(f.kind === 'setup' ? SETUPS : SERVERS).remove([f.path]);
  if (error) throw new Error('Could not delete the file. 未能刪除。');
}

export async function makeDefaultSetup(f: LibraryFile) {
  const target = `${f.platform.toLowerCase()}/setup.exe`;
  await supabase.storage.from(SETUPS).remove([target]);
  const { error } = await supabase.storage.from(SETUPS).copy(f.path, target);
  if (error) throw new Error('Could not set the default setup. 未能設為預設。');
}

export async function loadNeeds(): Promise<Need[]> {
  const { data, error } = await supabase.rpc('terminal_file_needs');
  if (error) throw new Error('Could not load the accounts report. 未能載入戶口需求。');
  return ((data ?? []) as Need[]).filter((n) => n.platform === 'MT4' || n.platform === 'MT5');
}

export interface HarvestEntry {
  id: string;
  platform: Platform;
  file_name: string;
  stored_path: string | null;
  broker: string | null;
  server: string | null;
  status: 'added' | 'exists' | 'replaced' | 'skipped';
  machine_name: string | null;
  sender_ip: string | null;
  source: 'pc' | 'collector';
  created_at: string;
}

export async function loadHarvest(): Promise<HarvestEntry[]> {
  const { data, error } = await supabase
    .from('broker_file_harvest')
    .select('id, platform, file_name, stored_path, broker, server, status, machine_name, sender_ip, source, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new Error('Could not load the collection log. 未能載入收集紀錄。');
  return (data ?? []) as HarvestEntry[];
}

export interface ServerChoice {
  platform: Platform;
  broker: string;
  server: string;
}

export async function loadServerChoices(): Promise<ServerChoice[]> {
  const { data, error } = await supabase.rpc('broker_server_choices');
  if (error) throw new Error('Could not load the broker server list. 未能載入伺服器清單。');
  return ((data ?? []) as ServerChoice[]).filter((s) => (s.platform === 'MT4' || s.platform === 'MT5') && !!s.server);
}

export async function loadPlanned(): Promise<PlannedBroker[]> {
  const { data, error } = await supabase.from('broker_file_targets').select('id, platform, broker, server, note').order('broker');
  if (error) throw new Error('Could not load the planned brokers. 未能載入預計券商。');
  return (data ?? []) as PlannedBroker[];
}

export async function addPlanned(p: Omit<PlannedBroker, 'id'>) {
  const { error } = await supabase.from('broker_file_targets').insert({ platform: p.platform, broker: p.broker.trim(), server: p.server.trim(), note: p.note.trim() });
  if (error) throw new Error(error.code === '23505' ? 'Already on the list · 已在清單內' : 'Could not add · 未能加入');
}

export async function deletePlanned(id: string) {
  const { error } = await supabase.from('broker_file_targets').delete().eq('id', id);
  if (error) throw new Error('Could not remove · 未能移除');
}

export function mergeNeeds(needs: Need[], planned: PlannedBroker[]): Need[] {
  const extra = planned
    .filter((p) => !needs.some((n) => n.platform === p.platform && (p.server ? norm(n.server) === norm(p.server) : norm(n.broker) === norm(p.broker))))
    .map((p) => ({ platform: p.platform, broker: p.broker, server: p.server, accounts: 0, plannedId: p.id, note: p.note }));
  return [...needs, ...extra];
}

export function coverageOf(needs: Need[], library: LibraryFile[]): Coverage[] {
  const servers = { MT4: library.filter((f) => f.kind === 'server' && f.platform === 'MT4'), MT5: library.filter((f) => f.kind === 'server' && f.platform === 'MT5') };
  const setups = library.filter((f) => f.kind === 'setup' && !f.isDefault);
  return needs.map((n) => {
    const server = norm(n.server);
    const broker = norm(n.broker);
    const serverFile = n.platform === 'MT4'
      ? servers.MT4.find((f) => (server ? mt4Label(f.name) === server : !!broker && mt4Label(f.name).startsWith(broker)))?.name ?? null
      : bestMt5File(servers.MT5.map((f) => f.name), n.server, n.broker);
    const setupFile = setups.find((f) => f.platform === n.platform && labelMatches(norm(f.broker), server, broker))?.name ?? null;
    return { ...n, serverFile, setupFile };
  });
}

export async function loadInstallerLinks(): Promise<InstallerLinks> {
  const { data, error } = await supabase.from('terminal_installer_settings').select('mt4_installer_url, mt5_installer_url').eq('id', 1).maybeSingle();
  if (error) throw new Error('Could not load settings. 未能載入設定。');
  return { mt4_installer_url: data?.mt4_installer_url ?? '', mt5_installer_url: data?.mt5_installer_url ?? '' };
}

export async function saveInstallerLinks(s: InstallerLinks) {
  const { error } = await supabase
    .from('terminal_installer_settings')
    .upsert({ id: 1, mt4_installer_url: s.mt4_installer_url.trim(), mt5_installer_url: s.mt5_installer_url.trim(), updated_at: new Date().toISOString() });
  if (error) throw new Error('Could not save settings. 未能儲存設定。');
}
