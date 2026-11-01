import { serverNow } from '@/lib/serverClock';

export function formatCurrency(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatPrice(value: number): string {
  if (value === 0) return '0';
  const decimals = value >= 100 ? 2 : value >= 1 ? 4 : 5;
  return value.toFixed(decimals);
}

export function formatTime(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function timeAgo(ts: string | null): string {
  if (!ts) return 'never';
  const diff = serverNow() - new Date(ts).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// EAs send a heartbeat every 10s; allow a few missed beats before showing offline.
export const ONLINE_WINDOW_MS = 45_000;

// MetaApi accounts are polled about once a minute, so they need a wider window than EA bridges.
export const METAAPI_ONLINE_WINDOW_MS = 180_000;

type OnlineSource = { last_seen: string | null; connection_method?: string | null; metaapi_connection?: string | null };

export function isOnline(source: string | null | OnlineSource): boolean {
  const lastSeen = typeof source === 'object' && source ? source.last_seen : source;
  if (!lastSeen) return false;
  if (typeof source === 'object' && source?.connection_method === 'metaapi') {
    if (source.metaapi_connection && source.metaapi_connection !== 'CONNECTED') return false;
    return serverNow() - new Date(lastSeen).getTime() < METAAPI_ONLINE_WINDOW_MS;
  }
  return serverNow() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}
