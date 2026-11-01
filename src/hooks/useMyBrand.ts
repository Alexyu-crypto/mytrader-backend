import { useCallback, useEffect, useState } from 'react';
import { fetchMyBrand, type MyBrand } from '@/lib/agents';

export function useMyBrand(enabled: boolean, userId: string) {
  const [brand, setBrand] = useState<MyBrand | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setBrand(null);
      return;
    }
    let cancelled = false;
    fetchMyBrand().then((b) => {
      if (!cancelled) setBrand(b);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { brand, reload };
}
