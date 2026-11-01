import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Account, LivePosition } from '@/lib/types';

// Heartbeat tables change constantly; polling keeps realtime usage flat as accounts grow.
const REFRESH_MS = 5_000;

function usePolling(load: () => void) {
  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) setAccounts(data as Account[]);
    setLoading(false);
  }, []);

  usePolling(load);

  return { accounts, loading, reload: load };
}

export function useLivePositions() {
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_positions')
      .select('*')
      .order('account_name', { ascending: true });
    if (!error && data) setPositions(data as LivePosition[]);
    setLoading(false);
  }, []);

  usePolling(load);

  return { positions, loading, reload: load };
}
