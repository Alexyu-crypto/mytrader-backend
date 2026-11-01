import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/lib/debounce';
import { fetchCopyRequests, type CopyRequest } from '@/lib/copyRequests';

export function useCopyRequests(channelName: string, enabled = true) {
  const [requests, setRequests] = useState<CopyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchCopyRequests();
    setRequests(result.requests);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const reload = debounce(load, 300);
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'copy_requests' }, reload)
      .subscribe();
    return () => {
      reload.cancel();
      supabase.removeChannel(channel);
    };
  }, [load, channelName, enabled]);

  return { requests, loading, error, reload: load };
}
