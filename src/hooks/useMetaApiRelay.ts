import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { relayMetaApi } from '@/lib/metaapi';
import type { Account } from '@/lib/types';

const RELAY_MS = 3000;

export const isCloudAccount = (a: Pick<Account, 'connection_method'> | null | undefined) => a?.connection_method === 'metaapi';

export function useMetaApiRelay(accounts: Account[]) {
  const [error, setError] = useState<string | null>(null);
  const signature = accounts.filter((a) => isCloudAccount(a) && !a.frozen).map((a) => a.account_name).sort().join('|');

  useEffect(() => {
    setError(null);
    if (!signature) return;
    const names = signature.split('|');
    let cancelled = false;
    let busy = false;
    let again = false;

    const run = async () => {
      if (busy) {
        again = true;
        return;
      }
      if (document.visibilityState !== 'visible') return;
      busy = true;
      const err = await relayMetaApi(names);
      busy = false;
      if (cancelled) return;
      setError(err);
      if (again) {
        again = false;
        run();
      }
    };

    const onQueued = (account: unknown) => {
      if (typeof account === 'string' && names.includes(account)) run();
    };
    const channel = supabase
      .channel(`metaapi-relay-${signature.length}-${names[0]}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'desk_orders' }, (p) => onQueued((p.new as { account_name?: unknown }).account_name))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'copy_signals' }, (p) => onQueued((p.new as { follower_account?: unknown }).follower_account))
      .subscribe();

    run();
    const timer = window.setInterval(run, RELAY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [signature]);

  return { error };
}
