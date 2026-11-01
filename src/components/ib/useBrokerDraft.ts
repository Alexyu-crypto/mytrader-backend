import { useEffect, useRef, useState } from 'react';
import { updateBroker, type BrokerPatch, type IbBroker } from '@/lib/ibPartners';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useBrokerDraft<K extends keyof BrokerPatch>(broker: IbBroker, keys: K[], onSaved: () => void) {
  const pick = () => Object.fromEntries(keys.map((k) => [k, broker[k]])) as Pick<IbBroker, K>;
  const [draft, setDraft] = useState(pick);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const original = pick();
  const dirty = keys.some((k) => !same(draft[k], original[k]));

  // Pull in server-side changes (e.g. an auto-scheduled follow-up) for fields the user has not edited.
  const previous = useRef(original);
  const originalKey = JSON.stringify(original);
  useEffect(() => {
    const prev = previous.current;
    const next = JSON.parse(originalKey) as Pick<IbBroker, K>;
    previous.current = next;
    setDraft((d) => {
      const merged = { ...d };
      for (const k of keys) if (same(d[k], prev[k])) merged[k] = next[k];
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalKey]);

  const set = <F extends K>(key: F, value: IbBroker[F]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    const err = await updateBroker(broker.id, draft as BrokerPatch);
    setBusy(false);
    if (err) setError(err);
    else {
      setSaved(true);
      onSaved();
    }
  };

  return { draft, set, dirty, busy, saved, error, save };
}
