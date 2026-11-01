import type { Account } from '@/lib/types';

export type LatencyLevel = 'good' | 'fair' | 'slow' | 'none';

const STALE_MS = 2 * 60_000;

export const BROKER_LIMITS = { fair: 50, slow: 150 };
export const CLOUD_LIMITS = { fair: 400, slow: 1000 };

export interface Latency {
  broker: number | null;
  cloud: number | null;
  fresh: boolean;
  reported: boolean;
}

export function latencyOf(account: Account, now: number): Latency {
  const reported = !!account.latency_at;
  const fresh = reported && now - new Date(account.latency_at as string).getTime() < STALE_MS;
  return {
    broker: fresh ? account.broker_ping_ms ?? null : null,
    cloud: fresh ? account.cloud_rtt_ms ?? null : null,
    fresh,
    reported,
  };
}

export function levelFor(ms: number | null, limits: { fair: number; slow: number }): LatencyLevel {
  if (ms === null) return 'none';
  if (ms >= limits.slow) return 'slow';
  if (ms >= limits.fair) return 'fair';
  return 'good';
}

export const LEVEL_TEXT: Record<LatencyLevel, string> = {
  good: 'text-emerald-400',
  fair: 'text-amber-400',
  slow: 'text-red-400',
  none: 'text-slate-500',
};

export const LEVEL_DOT: Record<LatencyLevel, string> = {
  good: 'bg-emerald-400',
  fair: 'bg-amber-400',
  slow: 'bg-red-400',
  none: 'bg-slate-600',
};

export function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}
