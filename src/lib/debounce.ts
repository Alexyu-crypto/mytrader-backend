// maxWaitMs guarantees a run even when calls never pause (e.g. constant EA heartbeats).
export function debounce(fn: () => void, ms: number, maxWaitMs?: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstCallAt: number | null = null;
  const fire = () => {
    firstCallAt = null;
    fn();
  };
  const run = () => {
    clearTimeout(timer);
    const now = Date.now();
    if (firstCallAt === null) firstCallAt = now;
    const wait = maxWaitMs === undefined ? ms : Math.max(0, Math.min(ms, firstCallAt + maxWaitMs - now));
    timer = setTimeout(fire, wait);
  };
  run.cancel = () => {
    clearTimeout(timer);
    firstCallAt = null;
  };
  return run;
}
