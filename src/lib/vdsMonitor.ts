import { isOnline, timeAgo } from '@/lib/format';
import { loginNumber } from '@/lib/accountCredentials';
import type { Installation, TerminalState } from '@/lib/terminalInstaller';
import type { Account } from '@/lib/types';
import { serverNow } from '@/lib/serverClock';

const VDS_CONTACT_MS = 10 * 60_000;

export type Level = 'ok' | 'warn' | 'error';

export interface VdsAccount {
  name: string;
  login: string;
  account: Account | undefined;
  state: TerminalState | undefined;
  eaCode: string | null;
  online: boolean;
  level: Level;
  reason: string;
}

export interface VdsInstall {
  install: Installation;
  accounts: VdsAccount[];
  superseded: boolean;
}

export interface VdsManualGroup {
  name: string;
  accounts: VdsAccount[];
}

export interface Vds {
  key: string;
  ip: string | null;
  ipAuto: boolean;
  machine: string | null;
  hardware: Installation['hardware'];
  lastContact: string | null;
  online: boolean;
  installs: VdsInstall[];
  manual: VdsManualGroup[];
  total: number;
  onlineCount: number;
  eaCodes: string[];
  detailed: boolean;
}

const latest = (...values: (string | null | undefined)[]) =>
  values.filter((v): v is string => !!v).sort().pop() ?? null;

function describe(acc: Account | undefined, state: TerminalState | undefined, vdsOnline: boolean, lastContact: string | null): { level: Level; reason: string } {
  const siteLogin = state?.account_name.split('-')[2];
  if (state?.mt_login && siteLogin && state.mt_login !== siteLogin) {
    return { level: 'warn', reason: `MT 實際登入帳號 ${state.mt_login}，與網站資料 ${siteLogin} 不同：請在網站更正帳號名稱 · Login differs from website` };
  }
  if (acc && isOnline(acc.last_seen)) {
    if (acc.mt_trade_allowed === false) return { level: 'warn', reason: 'AutoTrading 未開啟，EA 不能落單 · AutoTrading is off' };
    return { level: 'ok', reason: '已連線 · Connected' };
  }
  if (!vdsOnline) return { level: 'error', reason: `VDS 離線或關機（最後聯絡 ${timeAgo(lastContact)}）· VDS not reporting` };
  if (state?.login_error) return { level: 'error', reason: `登入失敗：${state.login_error}` };
  if (state?.ea_error) return { level: 'error', reason: `EA 錯誤：${state.ea_error}` };
  if (state && !state.running) return { level: 'warn', reason: 'MT 未運行，VDS 會在 2 分鐘內自動重開 · MT not running' };
  if (!acc) return { level: 'error', reason: '帳戶不在系統內，EA 無法回報 · Account not registered' };
  if (state && !state.login_ok) return { level: 'error', reason: 'MT 從未成功登入：請檢查帳號、密碼及伺服器 · Never logged in' };
  if (!acc.last_seen) return { level: 'error', reason: 'EA 從未連線：MT 未登入或 EA 未啟動 · EA never reported' };
  if (state && state.restarts > 0) return { level: 'error', reason: `已自動重啟 ${state.restarts} 次仍未連線（最後 ${timeAgo(acc.last_seen)}）` };
  return { level: 'warn', reason: `EA 停止回報（最後 ${timeAgo(acc.last_seen)}）· EA stopped reporting` };
}

export function buildVdsList(
  installs: Installation[],
  accounts: Account[],
  ipByAccountId: Record<string, { ip: string }>,
  groupOf: Map<string, string>,
): Vds[] {
  const byName = new Map(accounts.map((a) => [a.account_name, a]));
  const now = serverNow();
  const groups = new Map<string, Vds>();

  const shown = installs.filter((i) => i.status !== 'uninstalled' && !(i.status === 'pending' && !i.machine_name));
  const removed = new Set(installs.filter((i) => i.status === 'uninstalled').flatMap((i) => i.account_names));

  for (const inst of shown) {
    const contact = latest(inst.synced_at, inst.terminal_state_at, inst.status === 'installed' ? inst.updated_at : null);
    const vdsOnline = !!contact && now - new Date(contact).getTime() < VDS_CONTACT_MS;
    const fallbackIp = inst.account_names.map((n) => byName.get(n)).map((a) => (a ? ipByAccountId[a.id]?.ip : undefined)).find(Boolean) ?? null;
    const ip = inst.public_ip ?? fallbackIp;
    const key = ip ?? inst.machine_name ?? inst.id;

    const rows: VdsAccount[] = inst.account_names.map((name) => {
      const account = byName.get(name);
      const state = inst.terminal_state?.find((t) => t.account_name === name);
      const { level, reason } = describe(account, state, vdsOnline, contact);
      return { name, login: loginNumber(name) || name, account, state, eaCode: inst.ea_code, online: !!account && isOnline(account.last_seen), level, reason };
    });

    const vds = groups.get(key) ?? {
      key,
      ip,
      ipAuto: !inst.public_ip && !!fallbackIp,
      machine: inst.machine_name,
      hardware: inst.hardware,
      lastContact: null,
      online: false,
      installs: [],
      manual: [],
      total: 0,
      onlineCount: 0,
      eaCodes: [],
      detailed: false,
    };
    vds.installs.push({ install: inst, accounts: rows, superseded: false });
    if (inst.ea_code && !vds.eaCodes.includes(inst.ea_code)) vds.eaCodes.push(inst.ea_code);
    vds.lastContact = latest(vds.lastContact, contact);
    vds.online = vds.online || vdsOnline;
    vds.detailed = vds.detailed || !!inst.terminal_state_at;
    vds.machine = vds.machine ?? inst.machine_name;
    vds.hardware = vds.hardware ?? inst.hardware;
    groups.set(key, vds);
  }

  const covered = new Set(shown.flatMap((i) => i.account_names));
  for (const account of accounts) {
    const ip = ipByAccountId[account.id]?.ip;
    if (!ip || !account.last_seen || account.archive_status !== 'active' || covered.has(account.account_name)) continue;
    if (removed.has(account.account_name) && !isOnline(account.last_seen)) continue;
    const vds = groups.get(ip) ?? {
      key: ip,
      ip,
      ipAuto: true,
      machine: null,
      hardware: null,
      lastContact: null,
      online: false,
      installs: [],
      manual: [],
      total: 0,
      onlineCount: 0,
      eaCodes: [],
      detailed: true,
    };
    const online = isOnline(account.last_seen);
    const name = groupOf.get(account.account_name) ?? '未分組 · Ungrouped';
    const group = vds.manual.find((g) => g.name === name) ?? vds.manual[vds.manual.push({ name, accounts: [] }) - 1];
    const { level, reason } = online
      ? describe(account, undefined, true, null)
      : { level: 'error' as Level, reason: `EA 停止回報（最後 ${timeAgo(account.last_seen)}）· 手動安裝，請到該電腦檢查` };
    group.accounts.push({ name: account.account_name, login: loginNumber(account.account_name) || account.account_name, account, state: undefined, eaCode: null, online, level, reason });
    if (!vds.installs.length) {
      vds.lastContact = latest(vds.lastContact, account.last_seen);
      vds.online = vds.online || online;
    }
    groups.set(ip, vds);
  }

  for (const vds of groups.values()) {
    vds.manual.sort((a, b) => a.name.localeCompare(b.name));
    const active = vds.installs;
    for (const entry of active) {
      const names = entry.install.account_names;
      entry.superseded = active.some(
        (other) => other !== entry && other.install.created_at > entry.install.created_at && names.every((n) => other.install.account_names.includes(n)),
      );
    }
    const unique = new Map<string, VdsAccount>();
    for (const entry of active) for (const row of entry.accounts) if (!unique.has(row.name)) unique.set(row.name, row);
    for (const group of vds.manual) for (const row of group.accounts) unique.set(row.name, row);
    vds.total = unique.size;
    vds.onlineCount = [...unique.values()].filter((r) => r.online).length;
  }

  return [...groups.values()].sort((a, b) => Number(a.online) - Number(b.online) || b.total - b.onlineCount - (a.total - a.onlineCount) || (a.ip ?? '').localeCompare(b.ip ?? ''));
}

export type SortKey = 'login' | 'platform' | 'status' | 'ea' | 'reason';
export interface AccountSort {
  key: SortKey;
  dir: 1 | -1;
}

const LEVEL_RANK: Record<Level, number> = { error: 0, warn: 1, ok: 2 };
const seenMs = (r: VdsAccount) => (r.account?.last_seen ? new Date(r.account.last_seen).getTime() : 0);

const COMPARE: Record<SortKey, (a: VdsAccount, b: VdsAccount) => number> = {
  login: (a, b) => a.login.localeCompare(b.login, undefined, { numeric: true }),
  platform: (a, b) =>
    (a.account?.platform ?? '').localeCompare(b.account?.platform ?? '') ||
    (a.account?.broker_server ?? '').localeCompare(b.account?.broker_server ?? ''),
  status: (a, b) => Number(a.online) - Number(b.online) || seenMs(a) - seenMs(b),
  ea: (a, b) => (a.eaCode ?? '').localeCompare(b.eaCode ?? ''),
  reason: (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.reason.localeCompare(b.reason),
};

export function sortAccounts(rows: VdsAccount[], sort: AccountSort | null) {
  if (!sort) return rows;
  const cmp = COMPARE[sort.key];
  return [...rows].sort((a, b) => cmp(a, b) * sort.dir || a.login.localeCompare(b.login, undefined, { numeric: true }));
}
