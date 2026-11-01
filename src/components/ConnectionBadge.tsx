import { Cloud, Cpu } from 'lucide-react';
import type { ConnectionMethod } from '@/lib/types';

export const CONNECTION_METHODS: Record<ConnectionMethod, { label: string; short: string; hint: string; badge: string; Icon: typeof Cpu }> = {
  ea: {
    label: 'EA Installer',
    short: 'EA',
    hint: 'Runs on our VDS with the bridge EA. 由 VDS 上的 EA 連線',
    badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40',
    Icon: Cpu,
  },
  metaapi: {
    label: 'MetaApi',
    short: 'META API',
    hint: 'Connected through the MetaApi cloud. 經 MetaApi 雲端連線',
    badge: 'bg-sky-500/15 text-sky-300 ring-sky-500/40',
    Icon: Cloud,
  },
};

export const connectionShort = (m: ConnectionMethod | null | undefined) => CONNECTION_METHODS[m ?? 'ea'].short;

export function ConnectionBadge({ method }: { method: ConnectionMethod | null | undefined }) {
  const info = CONNECTION_METHODS[method ?? 'ea'];
  const { Icon } = info;
  return (
    <span title={info.hint} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${info.badge}`}>
      <Icon className="h-3 w-3" />
      {info.short}
    </span>
  );
}
