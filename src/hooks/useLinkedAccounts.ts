import { useEffect, useState } from 'react';
import { fetchMyLinkedAccounts, type LinkedAccounts } from '@/lib/clientAccounts';

export function useLinkedAccounts(enabled: boolean) {
  const [linked, setLinked] = useState<LinkedAccounts | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchMyLinkedAccounts().then((res) => {
      if (!alive) return;
      setLinked(res.linked);
      setError(res.error ?? '');
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { linked: enabled ? linked : null, loading: enabled && loading, error };
}
