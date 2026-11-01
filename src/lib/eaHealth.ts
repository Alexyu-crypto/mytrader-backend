import type { Account, CopySignal, LivePosition } from '@/lib/types';
import { isOnline, timeAgo } from '@/lib/format';
import { BROKER_LIMITS, CLOUD_LIMITS, latencyOf } from '@/lib/latency';

export type HealthLevel = 'ok' | 'warn' | 'error' | 'idle';

export interface HealthCheck {
  label: string;
  level: HealthLevel;
  summary: string;
  fixes?: string[];
  startedAt?: number;
  resumed?: boolean;
  paused?: boolean;
}

export interface AccountHealth {
  account: Account;
  level: HealthLevel;
  checks: HealthCheck[];
}

const LOST_CONTACT_MS = 5 * 60_000;
const POSITIONS_STALE_MS = 45_000;
const SIGNAL_STUCK_MS = 15_000;
const FAILED_WINDOW_MS = 24 * 3600_000;

const RANK: Record<HealthLevel, number> = { error: 3, warn: 2, ok: 0, idle: -1 };

export function worstLevel(levels: HealthLevel[]): HealthLevel {
  return levels.reduce<HealthLevel>((w, l) => (RANK[l] > RANK[w] ? l : w), 'ok');
}

function ageMs(ts: string | null, now: number): number {
  return ts ? now - new Date(ts).getTime() : Infinity;
}

function toMs(ts: string): number {
  return new Date(ts).getTime();
}

function minutesLabel(ms: number): string {
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec}s` : `${Math.round(sec / 60)}m`;
}

function heartbeatCheck(account: Account, now: number): HealthCheck {
  const label = 'EA heartbeat';
  if (!account.last_seen) {
    const fixes = [
      'Make sure the EA is attached to a chart and the chart shows a smiley (MT4) or blue cap (MT5).',
      'Turn on AutoTrading in the terminal toolbar.',
      `AccountLabel in the EA inputs must be exactly "${account.account_name}".`,
      'Add the website address to Tools > Options > Expert Advisors > Allow WebRequest.',
    ];
    fixes.push('If the Experts tab shows "error 4029 on PATCH", re-download the EA and install v2.7, then press Compile (F7) in MetaEditor.');
    return { label, level: 'error', summary: 'Never connected', fixes, startedAt: toMs(account.created_at) };
  }
  if (isOnline(account.last_seen)) return { label, level: 'ok', summary: `Reporting, last update ${timeAgo(account.last_seen)}` };

  const lost = ageMs(account.last_seen, now);
  return {
    label,
    level: lost < LOST_CONTACT_MS ? 'warn' : 'error',
    summary: `No update for ${timeAgo(account.last_seen).replace(' ago', '')}`,
    startedAt: toMs(account.last_seen),
    fixes: [
      'Check that the MT terminal is still open and connected to the broker.',
      'Check that AutoTrading is still on and the EA is still on the chart.',
      'Look for red error lines in the Experts tab.',
    ],
  };
}

function positionsCheck(account: Account, positions: LivePosition[], now: number): HealthCheck {
  const label = 'Position sync';
  if (!account.last_seen) return { label, level: 'idle', summary: 'Waiting for first connection' };
  if (positions.length === 0)
    return { label, level: isOnline(account.last_seen) ? 'ok' : 'idle', summary: 'No open positions reported' };

  const newest = Math.min(...positions.map((p) => ageMs(p.updated_at, now)));
  const count = `${positions.length} open position${positions.length === 1 ? '' : 's'}`;
  if (isOnline(account.last_seen) && newest > POSITIONS_STALE_MS)
    return {
      label,
      level: 'warn',
      summary: `${count}, not refreshed for ${minutesLabel(newest)}`,
      startedAt: now - newest,
      fixes: ['The EA is reporting but positions are not updating. Look for errors in the Experts tab.'],
    };
  return { label, level: isOnline(account.last_seen) ? 'ok' : 'idle', summary: `${count} synced` };
}

function signalsCheck(account: Account, signals: CopySignal[], now: number): HealthCheck {
  const label = 'Copy signals';
  if (account.type === 'master') return { label, level: 'idle', summary: 'Not used, master accounts send trades' };

  const waiting = signals.filter((s) => s.status === 'pending' || s.status === 'processing');
  if (waiting.length === 0) return { label, level: 'ok', summary: 'Nothing waiting' };

  const oldest = Math.max(...waiting.map((s) => ageMs(s.created_at, now)));
  const n = `${waiting.length} signal${waiting.length === 1 ? '' : 's'}`;
  if (oldest < SIGNAL_STUCK_MS) return { label, level: 'ok', summary: `${n} being processed` };
  const startedAt = Math.max(...waiting.filter((s) => ageMs(s.created_at, now) >= SIGNAL_STUCK_MS).map((s) => toMs(s.created_at)));
  if (!isOnline(account.last_seen))
    return { label, level: 'warn', summary: `${n} waiting, EA is offline`, startedAt, fixes: ['Signals will run once the EA reconnects, unless they expire first.'] };
  return {
    label,
    level: 'error',
    summary: `${n} stuck for ${minutesLabel(oldest)}`,
    startedAt,
    fixes: [
      'The EA is online but is not taking trades. Check that AutoTrading is on.',
      'Look for "Open failed" or market-closed messages in the Experts tab.',
    ],
  };
}

// Broker variants like "ETHUSD@" or "XAUUSD.m" count as the same symbol.
function sameSymbol(a: string, b: string): boolean {
  const x = a.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const y = b.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return x.startsWith(y) || y.startsWith(x);
}

function failuresCheck(signals: CopySignal[], now: number): HealthCheck | null {
  const opened = signals.filter((s) => s.status === 'executed' && s.action !== 'close' && s.action !== 'modify');
  const failed = signals.filter(
    (s) =>
      s.status === 'failed' &&
      ageMs(s.created_at, now) < FAILED_WINDOW_MS &&
      !opened.some((o) => o.created_at > s.created_at && sameSymbol(o.symbol, s.symbol)),
  );
  if (failed.length === 0) return null;
  const symbols = [...new Set(failed.map((s) => s.symbol))].slice(0, 4).join(', ');
  return {
    label: 'Failed copies (24h)',
    level: 'warn',
    summary: `${failed.length} failed on ${symbols}`,
    startedAt: Math.max(...failed.map((s) => toMs(s.created_at))),
    fixes: [
      'Search the Experts tab for "Open failed" to see the reason.',
      'Common causes: symbol name differs on this broker (set Symbol Mapping in Copy Settings) or lot size above MaxLotPerTrade.',
      'After fixing, this warning clears by itself as soon as the next copy on that symbol opens successfully.',
    ],
  };
}

function latencyCheck(account: Account, now: number): HealthCheck | null {
  if (!isOnline(account.last_seen)) return null;
  const { broker, cloud, fresh } = latencyOf(account, now);
  if (!fresh) return null;
  const slowBroker = broker !== null && broker >= BROKER_LIMITS.slow;
  const slowCloud = cloud !== null && cloud >= CLOUD_LIMITS.slow;
  const label = 'Connection speed';
  const parts = [broker !== null ? `broker ${broker} ms` : null, cloud !== null ? `cloud ${cloud} ms` : null].filter(Boolean).join(' · ');
  if (!slowBroker && !slowCloud) return { label, level: 'ok', summary: parts || 'Measuring' };
  const fixes: string[] = [];
  if (slowBroker)
    fixes.push(
      'MT4: click the connection status at the bottom right and choose "Rescan servers". MT5 picks the fastest access point by itself.',
      'Move this terminal to a VPS located near the broker trade server.',
    );
  if (slowCloud) fixes.push('The VPS internet is slow. Close other programs or run fewer terminals on this VPS.');
  fixes.push('See "Reduce latency" in the User Manual for more tips.');
  return { label, level: 'warn', summary: `Slow: ${parts}`, fixes };
}

export function heartbeatOf(health: AccountHealth): HealthCheck {
  return health.checks.find((c) => c.label === 'EA heartbeat') ?? health.checks[0];
}

export function resumeKey(accountName: string, label: string): string {
  return `${accountName}::${label}`;
}

// A resume hides the problem that existed when it was pressed; anything that starts later shows again.
export function applyResumes(health: AccountHealth, resumes: Record<string, number>): AccountHealth {
  const checks = health.checks.map((c) => {
    const at = resumes[resumeKey(health.account.account_name, c.label)];
    if ((c.level !== 'warn' && c.level !== 'error') || !at || c.startedAt === undefined || c.startedAt > at) return c;
    return { ...c, level: 'ok' as const, resumed: true };
  });
  return { ...health, level: checks[0]?.paused ? 'idle' : worstLevel(checks.map((c) => c.level)), checks };
}

export type CopyState = 'copying' | 'paused' | 'unlinked';

// A follower that is not copying has nothing to alert about, so its problems are shown muted.
function muteForPause(checks: HealthCheck[], state: CopyState): HealthCheck[] {
  const summary = state === 'paused' ? 'Paused, copying stopped for this follower · 已暫停複製' : 'Not linked to any master · 未連接主帳戶';
  return [
    { label: 'Copy status', level: 'idle', summary, paused: true },
    ...checks.map((c) => (c.level === 'warn' || c.level === 'error' ? { ...c, level: 'idle' as const, fixes: undefined } : c)),
  ];
}

export function diagnoseAccount(account: Account, positions: LivePosition[], signals: CopySignal[], now: number, copyState: CopyState = 'copying'): AccountHealth {
  const own = signals.filter((s) => s.follower_account === account.account_name);
  const checks = [
    heartbeatCheck(account, now),
    positionsCheck(account, positions.filter((p) => p.account_name === account.account_name), now),
    signalsCheck(account, own, now),
  ];
  const failures = account.type === 'follower' ? failuresCheck(own, now) : null;
  if (failures) checks.push(failures);
  const latency = latencyCheck(account, now);
  if (latency) checks.push(latency);
  if (account.type === 'follower' && copyState !== 'copying') {
    const muted = muteForPause(checks, copyState);
    return { account, level: 'idle', checks: muted };
  }
  return { account, level: worstLevel(checks.map((c) => c.level)), checks };
}
