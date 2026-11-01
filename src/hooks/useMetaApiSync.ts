import { useEffect } from 'react';
import { syncMetaApi } from '@/lib/metaapi';

const SYNC_MS = 60_000;

export function useMetaApiSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === 'visible') syncMetaApi();
    };
    const timer = setInterval(run, SYNC_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}
