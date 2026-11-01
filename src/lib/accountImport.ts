import type { Account, ConnectionMethod } from '@/lib/types';
import { cleanCell as clean, downloadCsv, parseCsv } from '@/lib/csv';
import { MAX_PASSWORD_LENGTH } from '@/lib/accountCredentials';
import { DEFAULT_PAIR_VALUES, parsePairValues, type PairValues } from '@/lib/copyGroupImport';

export const MAX_ACCOUNT_NAME_LENGTH = 28;
export const ACCOUNT_NAME_PATTERN = /^[MF]-[A-Z]{1,4}-[0-9]{3,12}-[A-Za-z0-9]{1,16}$/;

// EA matching is byte-exact and URL-encoded, so names are restricted to ASCII letters/digits.
export function toInitials(name: string): string {
  return name
    .trim()
    .split(/[\s\-_.]+/)
    .map((w) => w.replace(/[^A-Za-z]/g, '')[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 4);
}

export function toBrokerShort(broker: string): string {
  return broker.replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
}

export function buildAccountName(type: 'master' | 'follower', holderName: string, accountNumber: string, broker: string): string {
  return [type === 'master' ? 'M' : 'F', toInitials(holderName), accountNumber, toBrokerShort(broker)].filter(Boolean).join('-');
}

const HEADER = ['account_name', 'holder_name', 'account_number', 'broker', 'broker_server', 'platform', 'type', 'connection'];
const PAIR_SETTING_COLUMNS = [
  'enabled',
  'mode',
  'lot_multiplier',
  'fixed_lot',
  'min_lot',
  'max_lot',
  'reverse',
  'copy_sl',
  'copy_tp',
  'copy_pending_orders',
  'max_open_trades',
  'allowed_symbols',
  'blocked_symbols',
];
const IMPORT_HEADER = [...HEADER, 'password', 'master_account', ...PAIR_SETTING_COLUMNS];

export interface ImportRow {
  line: number;
  account_name: string;
  broker: string;
  broker_server: string | null;
  platform: 'MT4' | 'MT5';
  type: 'master' | 'follower';
  connection_method: ConnectionMethod;
  holder_name: string | null;
  password: string | null;
  master_account: string | null;
  pair_values: PairValues;
  error: string | null;
}


function parseType(value: string): 'master' | 'follower' | null {
  const v = value.toLowerCase();
  if (v === 'master' || v === 'm') return 'master';
  if (v === 'follower' || v === 'f') return 'follower';
  return null;
}

function parseConnection(value: string): ConnectionMethod | null {
  const v = value.toLowerCase().replace(/[\s_\-.]/g, '');
  if (!v || v === 'ea' || v === 'eainstaller' || v === 'vds') return 'ea';
  if (v === 'metaapi' || v === 'cloud' || v === 'metaapicloud' || v === 'meta') return 'metaapi';
  return null;
}

export const MAX_IMPORT_ROWS = 500;

export function parseAccountsCsv(text: string, existingNames: Set<string>, existingMasters: Set<string>): { rows: ImportRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: 'The file has no account rows. 檔案沒有帳戶資料。' };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (name: string) => header.indexOf(name);
  if (col('broker') < 0 || (col('account_name') < 0 && (col('holder_name') < 0 || col('account_number') < 0))) {
    return { rows: [], error: 'Missing columns. Please use the template. 欄位不正確，請使用範本。' };
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], error: `Up to ${MAX_IMPORT_ROWS} accounts per file. 每個檔案最多 ${MAX_IMPORT_ROWS} 個帳戶。` };
  }

  const seen = new Set<string>();
  const rows = table.slice(1).map((cells, i): ImportRow => {
    const get = (name: string) => clean(col(name) >= 0 ? cells[col(name)] : '');
    const broker = get('broker');
    const platformRaw = get('platform').toUpperCase() || 'MT4';
    const type = parseType(get('type') || 'follower');
    const holder = get('holder_name');
    const number = get('account_number');
    let name = get('account_name');
    const password = get('password');
    const connection = parseConnection(get('connection') || get('connection_method'));
    const server = get('broker_server');
    let error: string | null = null;

    if (!type) error = 'Type must be master or follower';
    else if (!connection) error = 'Connection must be ea or metaapi';
    else if (platformRaw !== 'MT4' && platformRaw !== 'MT5') error = 'Platform must be MT4 or MT5';
    else if (!broker) error = 'Broker is required';
    else if (!name) {
      if (!holder || !toInitials(holder)) error = 'Holder name needs English letters';
      else if (!/^[0-9]{3,12}$/.test(number)) error = 'Account number must be 3-12 digits';
      else if (!toBrokerShort(broker)) error = 'Broker must contain English letters or digits';
      else name = buildAccountName(type, holder, number, broker);
    }
    if (!error && name.length > MAX_ACCOUNT_NAME_LENGTH) error = `Name longer than ${MAX_ACCOUNT_NAME_LENGTH} characters`;
    else if (!error && !ACCOUNT_NAME_PATTERN.test(name)) error = 'Invalid account name format';
    else if (!error && type && name[0] !== (type === 'master' ? 'M' : 'F')) error = 'Name prefix (M/F) does not match type';
    else if (!error && existingNames.has(name)) error = 'Already exists';
    else if (!error && seen.has(name)) error = 'Duplicate in file';
    else if (!error && password.length > MAX_PASSWORD_LENGTH) error = `Password longer than ${MAX_PASSWORD_LENGTH} characters`;
    else if (!error && connection === 'metaapi' && !server) error = 'MetaApi needs broker_server';
    else if (!error && connection === 'metaapi' && !password) error = 'MetaApi needs password';
    if (!error) seen.add(name);

    const masterAccount = get('master_account') || null;
    let pairValues: PairValues = { ...DEFAULT_PAIR_VALUES };
    if (masterAccount) {
      const parsed = parsePairValues(get, (c) => col(c) >= 0, DEFAULT_PAIR_VALUES);
      pairValues = parsed.values;
      if (!error && parsed.error) error = parsed.error;
    }

    return {
      line: i + 2,
      account_name: name,
      broker,
      broker_server: server || null,
      platform: platformRaw === 'MT5' ? 'MT5' : 'MT4',
      type: type ?? 'follower',
      connection_method: connection ?? 'ea',
      holder_name: holder.slice(0, 100) || null,
      password: password || null,
      master_account: masterAccount,
      pair_values: pairValues,
      error,
    };
  });

  const fileMasters = new Set(rows.filter((r) => !r.error && r.type === 'master').map((r) => r.account_name));
  for (const r of rows) {
    if (r.error || !r.master_account) continue;
    if (r.type === 'master') r.error = 'Only follower accounts can follow a master';
    else if (!existingMasters.has(r.master_account) && !fileMasters.has(r.master_account)) r.error = 'Master account not found';
  }
  return { rows, error: null };
}

export function downloadImportTemplate() {
  downloadCsv('accounts-import-template.csv', IMPORT_HEADER, [
    ['', 'Chan Tai Man', '12345678', 'ICMarkets', 'ICMarketsSC-Live07', 'MT4', 'master', 'ea', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Wong Siu Ming', '87654321', 'ICMarkets', 'ICMarketsSC-MT5-2', 'MT5', 'follower', 'metaapi', 'trading-password', 'M-CTM-12345678-ICMarkets', 'yes', 'multiplier', '1.5', '', '0.01', '10', 'no', 'yes', 'yes', 'no', '0', 'all', ''],
    ['', 'Lee Tai Ming', '11223344', 'ICMarkets', 'ICMarketsSC-Live07', 'MT4', 'follower', 'ea', '', 'M-CTM-12345678-ICMarkets', 'yes', 'fixed', '', '0.1', '0.01', '5', 'no', 'yes', 'yes', 'no', '3', 'XAUUSD; EURUSD', ''],
  ]);
}

export function exportAccountsCsv(accounts: Account[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const hasArchived = accounts.some((a) => a.frozen);
  const baseHeader = [...HEADER, 'balance', 'equity', 'report_public', 'created_at'];
  const archiveHeader = hasArchived ? ['archive_status', 'case_note', 'frozen_at'] : [];
  downloadCsv(
    `accounts-${stamp}.csv`,
    [...baseHeader, ...archiveHeader],
    accounts.map((a) => {
      const base: (string | number | boolean)[] = [a.account_name, a.holder_name ?? '', '', a.broker, a.broker_server ?? '', a.platform, a.type, a.connection_method, a.balance, a.equity, a.report_public ? 'yes' : 'no', a.created_at];
      if (hasArchived) base.push(a.archive_status, a.frozen_reason ?? '', a.frozen_at ?? '');
      return base;
    }),
  );
}
