import { useEffect, useState } from 'react';
import { Check, Loader2, XCircle, Zap } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { supabase } from '@/lib/supabase';
import { reconnectState, type ReconnectState } from '@/lib/reconnect';
import { serverNow } from '@/lib/serverClock';
import type { Account } from '@/lib/types';

export function useReconnect(accountName: string, account: Account | undefined) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => serverNow());
  const rc = reconnectState(account, now);
  const active = rc !== null && rc.phase !== 'success' && rc.phase !== 'failed';

  useEffect(() => {
    if (!account?.reconnect_requested_at) return;
    const id = setInterval(() => setNow(serverNow()), 5000);
    return () => clearInterval(id);
  }, [account?.reconnect_requested_at]);

  const request = async () => {
    setSending(true);
    setError('');
    const { error: err } = await supabase.rpc('request_reconnect', { p_account: accountName });
    setSending(false);
    setNow(serverNow());
    if (err) setError('無法發送重連請求 · Could not send reconnect request');
  };

  return { rc, active, sending, error, request };
}

type ReconnectControl = ReturnType<typeof useReconnect>;

export function ReconnectButton({ control }: { control: ReconnectControl }) {
  const { rc, active, sending, request } = control;
  return (
    <IconButton label={active && rc ? `${rc.label} · ${rc.detail}` : 'Reconnect · 加速重連'} tone="amber" onClick={request} disabled={sending || active}>
      {active ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className={`w-3.5 h-3.5 ${sending ? 'animate-pulse' : ''}`} />}
    </IconButton>
  );
}

export function ReconnectStatus({ rc, className = '' }: { rc: ReconnectState | null; className?: string }) {
  if (!rc) return null;
  return (
    <p
      title={rc.detail}
      className={`flex items-center gap-1 text-xs animate-fade-in ${
        rc.phase === 'success' ? 'text-emerald-400' : rc.phase === 'failed' ? 'text-red-400' : 'text-amber-300'
      } ${className}`}
    >
      {rc.phase === 'success' ? <Check className="w-3 h-3" /> : rc.phase === 'failed' ? <XCircle className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
      {rc.label}
    </p>
  );
}
