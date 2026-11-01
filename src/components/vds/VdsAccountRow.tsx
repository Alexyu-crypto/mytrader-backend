import { ReconnectButton, ReconnectStatus, useReconnect } from '@/components/copy/Reconnect';
import { timeAgo } from '@/lib/format';
import type { Level, VdsAccount } from '@/lib/vdsMonitor';

const DOT: Record<Level, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]',
  warn: 'bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.15)]',
  error: 'bg-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.15)]',
};

const TEXT: Record<Level, string> = { ok: 'text-emerald-300', warn: 'text-amber-300', error: 'text-red-300' };

export function VdsAccountRow({ row, canEdit }: { row: VdsAccount; canEdit: boolean }) {
  const reconnect = useReconnect(row.name, row.account);
  const acc = row.account;

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors align-top">
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="font-mono text-slate-100 tabular-nums">{row.login}</span>
        <span className="block text-[11px] text-slate-500 max-w-[180px] truncate" title={row.name}>
          {row.name}
        </span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-400">
        <span className="text-slate-300">{acc?.platform ?? '—'}</span>
        <span className="block max-w-[160px] truncate" title={acc?.broker_server ?? ''}>
          {acc?.broker_server ?? '—'}
        </span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${row.online ? DOT[row.level] : DOT[row.level === 'ok' ? 'warn' : row.level]} ${row.online ? 'animate-pulse' : ''}`} />
          <span className={row.online ? 'text-emerald-300' : 'text-slate-400'}>{row.online ? 'Online · 在線' : 'Offline · 離線'}</span>
        </span>
        <span className="block text-[11px] text-slate-500 mt-0.5">{acc?.last_seen ? timeAgo(acc.last_seen) : 'never'}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {row.eaCode ? <span className="font-mono text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5">{row.eaCode}</span> : <span className="text-slate-600 text-xs">—</span>}
      </td>
      <td className="px-3 py-2.5 min-w-[220px]">
        <p className={`text-xs leading-relaxed break-words ${TEXT[row.level]}`}>{row.reason}</p>
        {row.state && (row.state.restarts > 0 || !row.state.running) && (
          <p className="text-[11px] text-slate-500 mt-0.5">
            MT {row.state.running ? '運行中' : '未運行'} · 自動重啟 {row.state.restarts} 次
          </p>
        )}
        <ReconnectStatus rc={reconnect.rc} className="mt-1" />
        {reconnect.error && <p className="text-[11px] text-red-400 mt-1">{reconnect.error}</p>}
      </td>
      <td className="px-3 py-2.5 text-right">{canEdit && <ReconnectButton control={reconnect} />}</td>
    </tr>
  );
}
