import { useCallback, useEffect, useState } from 'react';
import { countDueFollowUps } from '@/lib/ibPartners';

const POLL_MS = 5 * 60_000;

export function useIbFollowUps(enabled: boolean) {
  const [due, setDue] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return setDue(0);
    setDue(await countDueFollowUps());
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return;
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  return { due, refresh };
}
