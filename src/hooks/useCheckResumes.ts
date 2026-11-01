import { useCallback, useState } from 'react';
import { serverNow } from '@/lib/serverClock';

const KEY = 'ea-health-resumes';

function read(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function useCheckResumes() {
  const [resumes, setResumes] = useState(read);

  const update = useCallback((fn: (prev: Record<string, number>) => Record<string, number>) => {
    setResumes((prev) => {
      const next = fn(prev);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resume = useCallback(
    (keys: string[]) => {
      const t = serverNow();
      update((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, t])) }));
    },
    [update],
  );

  const undo = useCallback(
    (key: string) =>
      update((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      }),
    [update],
  );

  return { resumes, resume, undo };
}
