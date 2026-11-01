import type { Account, CopySettings } from '@/lib/types';
import { cleanCell, parseCsv } from '@/lib/csv';
import { downloadWorkbook, readFirstSheet } from '@/lib/xlsx';

export const MAX_PAIR_ROWS = 1000;
export const MAX_GROUP_NAME = 60;

const COLUMNS = [
  'group_name',
  'master_account',
  'follower_account',
  'enabled',
  'mode',
  'lot_multiplier',
  'fixed_lot',
  'max_lot',
  'min_lot',
  'reverse',
  'copy_sl',
  'copy_tp',
  'copy_pending_orders',
  'max_open_trades',
  'allowed_symbols',
  'blocked_symbols',
] as const;

const ALIASES: Record<string, string> = {
  group: 'group_name',
  master: 'master_account',
  follower: 'follower_account',
  multiplier: 'lot_multiplier',
  status: 'enabled',
};

export interface PairValues {
  enabled: boolean;
  mode: CopySettings['mode'];
  lot_multiplier: number;
  fixed_lot: number;
  max_lot: number;
  min_lot: number;
  reverse: boolean;
  copy_sl: boolean;
  copy_tp: boolean;
  copy_pending_orders: boolean;
  max_open_trades: number;
  allowed_symbols: string[];
  blocked_symbols: string[];
}

export interface PairRow {
  line: number;
  group_name: string;
  master_account: string;
  follower_account: string;
  values: PairValues;
  isUpdate: boolean;
  error: string | null;
}

export const DEFAULT_PAIR_VALUES: PairValues = {
  enabled: true,
  mode: 'multiplier',
  lot_multiplier: 1,
  fixed_lot: 0.01,
  max_lot: 10,
  min_lot: 0.01,
  reverse: false,
  copy_sl: true,
  copy_tp: true,
  copy_pending_orders: false,
  max_open_trades: 0,
  allowed_symbols: [],
  blocked_symbols: [],
};

function parseBool(value: string): boolean | null | undefined {
  const v = value.toLowerCase();
  if (!v) return undefined;
  if (['yes', 'y', 'true', '1', 'on', 'enabled', '是', '開', '啟用'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'off', 'disabled', '否', '關', '停用'].includes(v)) return false;
  return null;
}

function parseMode(value: string): CopySettings['mode'] | null | undefined {
  const v = value.toLowerCase();
  if (!v) return undefined;
  if (v === 'multiplier' || v === 'x' || v === '倍數') return 'multiplier';
  if (v === 'fixed' || v === '固定') return 'fixed';
  if (v === 'ratio' || v === '比例') return 'ratio';
  return null;
}

export function parseSymbols(value: string): string[] {
  return [...new Set(value.split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
}

const ALL_WORDS = new Set(['ALL', '*', '全部', '所有']);

export function isAllSymbols(value: string): boolean {
  return ALL_WORDS.has(value.trim().toUpperCase());
}

export function parseAllowedSymbols(value: string): string[] {
  return isAllSymbols(value) ? [] : parseSymbols(value);
}

export function pairValuesError(v: PairValues): string | null {
  const lots = [v.lot_multiplier, v.fixed_lot, v.max_lot];
  if (lots.some((n) => !Number.isFinite(n) || n <= 0 || n > 1000) || !Number.isFinite(v.min_lot) || v.min_lot < 0) {
    return 'Lot values must be positive numbers. 手數必須為正數。';
  }
  if (v.min_lot > v.max_lot) return 'Min lot cannot be larger than max lot. 最小手數不可大於最大手數。';
  return null;
}

export function parsePairValues(get: (name: string) => string, has: (name: string) => boolean, base: PairValues): { values: PairValues; error: string | null } {
  let error: string | null = null;
  const fail = (msg: string) => {
    if (!error) error = msg;
  };
  const values = { ...base };
  for (const field of ['enabled', 'reverse', 'copy_sl', 'copy_tp', 'copy_pending_orders'] as const) {
    const b = parseBool(get(field));
    if (b === null) fail(`${field} must be yes or no`);
    else if (b !== undefined) values[field] = b;
  }
  const mode = parseMode(get('mode'));
  if (mode === null) fail('Mode must be multiplier, fixed or ratio');
  else if (mode) values.mode = mode;

  for (const field of ['lot_multiplier', 'fixed_lot', 'max_lot', 'min_lot'] as const) {
    const raw = get(field);
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || (field !== 'min_lot' && n === 0) || n > 1000) fail(`${field} must be a positive number`);
    else values[field] = n;
  }
  const maxTrades = get('max_open_trades');
  if (maxTrades) {
    const n = Number(maxTrades);
    if (!Number.isInteger(n) || n < 0 || n > 10000) fail('max_open_trades must be a whole number (0 = no limit)');
    else values.max_open_trades = n;
  }
  if (values.min_lot > values.max_lot) fail('min_lot is larger than max_lot');
  if (has('allowed_symbols')) values.allowed_symbols = parseAllowedSymbols(get('allowed_symbols'));
  if (has('blocked_symbols')) values.blocked_symbols = parseSymbols(get('blocked_symbols'));
  return { values, error };
}

export async function readPairFile(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  return readFirstSheet(await file.arrayBuffer());
}

export function parsePairTable(table: string[][], accounts: Account[], existing: CopySettings[]): { rows: PairRow[]; error: string | null } {
  if (table.length < 2) return { rows: [], error: 'The file has no rows. 檔案沒有資料。' };
  const header = table[0].map((h) => {
    const key = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ALIASES[key] ?? key;
  });
  const col = (name: string) => header.indexOf(name);
  if (col('master_account') < 0 || col('follower_account') < 0) {
    return { rows: [], error: 'Missing master_account / follower_account columns. Please use the template. 欄位不正確，請使用範本。' };
  }
  if (table.length - 1 > MAX_PAIR_ROWS) return { rows: [], error: `Up to ${MAX_PAIR_ROWS} rows per file. 每個檔案最多 ${MAX_PAIR_ROWS} 行。` };

  const typeOf = new Map(accounts.map((a) => [a.account_name, a.type]));
  const current = new Map(existing.map((s) => [`${s.master_account}|${s.follower_account}`, s]));
  const seen = new Set<string>();

  const rows = table.slice(1).map((cells, i): PairRow => {
    const get = (name: string) => cleanCell(col(name) >= 0 ? cells[col(name)] : '');
    const master = get('master_account');
    const follower = get('follower_account');
    const key = `${master}|${follower}`;
    const prev = current.get(key);
    const base: PairValues = prev
      ? {
          enabled: prev.enabled,
          mode: prev.mode,
          lot_multiplier: prev.lot_multiplier,
          fixed_lot: prev.fixed_lot,
          max_lot: prev.max_lot,
          min_lot: prev.min_lot,
          reverse: prev.reverse,
          copy_sl: prev.copy_sl,
          copy_tp: prev.copy_tp,
          copy_pending_orders: prev.copy_pending_orders,
          max_open_trades: prev.max_open_trades,
          allowed_symbols: prev.allowed_symbols,
          blocked_symbols: prev.blocked_symbols,
        }
      : { ...DEFAULT_PAIR_VALUES };

    let error: string | null = null;
    const fail = (msg: string) => {
      if (!error) error = msg;
    };

    if (!master) fail('Master account is required');
    else if (!typeOf.has(master)) fail('Master account not found');
    else if (typeOf.get(master) !== 'master') fail('Master column has a follower account');
    if (!follower) fail('Follower account is required');
    else if (!typeOf.has(follower)) fail('Follower account not found');
    else if (typeOf.get(follower) !== 'follower') fail('Follower column has a master account');
    if (!error && seen.has(key)) fail('Same pair appears twice in file');

    const parsed = parsePairValues(get, (name) => col(name) >= 0, base);
    if (parsed.error) fail(parsed.error);
    const values = parsed.values;

    const groupName = get('group_name').slice(0, MAX_GROUP_NAME);
    if (!error) seen.add(key);
    return { line: i + 2, group_name: groupName, master_account: master, follower_account: follower, values, isUpdate: !!prev, error };
  });
  return { rows, error: null };
}

const yesNo = (b: boolean) => (b ? 'yes' : 'no');

export function downloadPairWorkbook(settings: CopySettings[], groupNames: Map<string, string>, accounts: Account[]) {
  const sorted = [...settings].sort((a, b) => a.master_account.localeCompare(b.master_account) || a.follower_account.localeCompare(b.follower_account));
  const rows = sorted.length
    ? sorted.map((s) => [
        groupNames.get(s.master_account) ?? '',
        s.master_account,
        s.follower_account,
        yesNo(s.enabled),
        s.mode,
        s.lot_multiplier,
        s.fixed_lot,
        s.max_lot,
        s.min_lot,
        yesNo(s.reverse),
        yesNo(s.copy_sl),
        yesNo(s.copy_tp),
        yesNo(s.copy_pending_orders),
        s.max_open_trades,
        s.allowed_symbols.length ? s.allowed_symbols.join(', ') : 'all',
        s.blocked_symbols.join(', '),
      ])
    : (() => {
        const master = accounts.find((a) => a.type === 'master')?.account_name ?? 'M-CTM-12345678-ICMarkets';
        const followers = accounts.filter((a) => a.type === 'follower').map((a) => a.account_name);
        const f1 = followers[0] ?? 'F-WSM-87654321-ICMarkets';
        const f2 = followers[1] ?? 'F-LTM-11223344-ICMarkets';
        return [
          ['Flying Tigers', master, f1, 'yes', 'multiplier', 1, 0.01, 10, 0.01, 'no', 'yes', 'yes', 'no', 0, 'all', ''],
          ['Flying Tigers', master, f2, 'yes', 'fixed', 1, 0.1, 5, 0.01, 'no', 'yes', 'yes', 'no', 0, 'XAUUSD, EURUSD', ''],
        ];
      })();

  const stamp = new Date().toISOString().slice(0, 10);
  downloadWorkbook(`copy-groups-${stamp}`, [
    { name: 'Copy Pairs', header: [...COLUMNS], rows },
    {
      name: 'Guide 說明',
      header: ['Column 欄位', 'What to enter 填寫方法'],
      rows: [
        ['group_name', 'Optional group name, e.g. Flying Tigers 組別名稱（可留空）'],
        ['master_account', 'Exact master account name (required) 主帳戶名稱（必填）'],
        ['follower_account', 'Exact follower account name (required) 跟單帳戶名稱（必填）'],
        ['enabled', 'yes / no'],
        ['mode', 'multiplier / fixed / ratio'],
        ['lot_multiplier', 'Used by multiplier and ratio, e.g. 1.5 倍數'],
        ['fixed_lot', 'Used by fixed mode, e.g. 0.1 固定手數'],
        ['max_lot / min_lot', 'Lot limits 手數上下限'],
        ['reverse', 'yes = copy in the opposite direction 反向跟單'],
        ['copy_sl / copy_tp', 'yes / no 是否複製止損 / 止盈'],
        ['copy_pending_orders', 'yes / no 是否複製掛單'],
        ['max_open_trades', '0 = no limit 最多持倉數（0 = 不限）'],
        ['allowed_symbols / blocked_symbols', 'Comma separated, e.g. XAUUSD, EURUSD. Empty = all. allowed_symbols also accepts "all" 以逗號分隔，留空 = 全部；allowed_symbols 可填 all 跟全部商品'],
        ['', 'Blank cells keep the current setting (or the default for new pairs). Blank symbol lists mean all symbols. 空白 = 保留現有設定（新配對用預設值）；商品欄留空 = 全部商品'],
        ['', 'Existing pairs are updated, new pairs are added. Nothing is deleted. 已有配對會更新，新配對會新增，不會刪除任何配對。'],
      ],
    },
  ]);
}
