import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/lib/debounce';
import { playAlarm, unlockAlarmSound, alarmSoundReady } from '@/lib/alarmSound';
import {
  flashTitle,
  listenForAlertClicks,
  notifyPermission,
  pageInBackground,
  requestNotifyPermission,
  showDesktopAlert,
  watchNotifyPermission,
  type AlertResult,
  type NotifyPermission,
} from '@/lib/desktopAlert';
import type { CopySignal } from '@/lib/types';

export const STUCK_AFTER_MS = 15_000;
const ALARM_MS = 10_000;
const LOOKBACK_MS = 6 * 3600_000;
const ACK_KEY = 'missed-copy-ack-at';
const MUTE_KEY = 'missed-copy-muted';

export interface MissedCopy {
  id: string;
  kind: 'failed' | 'stuck';
  action: 'open' | 'close';
  follower: string;
  master: string;
  symbol: string;
  lots: number;
  at: number;
  createdAt: number;
}

function readAck(): number {
  const v = Number(localStorage.getItem(ACK_KEY));
  return Number.isFinite(v) && v > 0 ? v : Date.now() - 5 * 60_000;
}

export function useMissedCopyAlarm(enabled: boolean) {
  const [signals, setSignals] = useState<CopySignal[]>([]);
  const [copyingFollowers, setCopyingFollowers] = useState<Set<string> | null>(null);
  const [ackAt, setAckAt] = useState(readAck);
  const [muted, setMutedState] = useState(() => localStorage.getItem(MUTE_KEY) === '1');
  const [soundReady, setSoundReady] = useState(false);
  const [testing, setTesting] = useState(false);
  const [permission, setPermission] = useState<NotifyPermission>(notifyPermission);
  const [testResult, setTestResult] = useState<AlertResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rung = useRef(new Set<string>());
  const stopSound = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = debounce(async () => {
      const [{ data, error }, links] = await Promise.all([
        supabase
          .from('copy_signals')
          .select('*')
          .in('action', ['open', 'close'])
          .in('status', ['failed', 'pending', 'processing'])
          .gte('created_at', new Date(Date.now() - LOOKBACK_MS).toISOString())
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('copy_settings').select('follower_account').eq('enabled', true),
      ]);
      if (cancelled) return;
      if (!error && data) setSignals(data as CopySignal[]);
      if (!links.error && links.data) setCopyingFollowers(new Set((links.data as { follower_account: string }[]).map((l) => l.follower_account)));
    }, 150);
    const channel = supabase
      .channel('missed-copy-alarm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'copy_signals' }, load)
      .subscribe();
    load();
    const poll = setInterval(load, 10_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      load.cancel();
      clearInterval(poll);
      clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  useEffect(() => {
    const stopWatching = watchNotifyPermission(setPermission);
    const stopListening = listenForAlertClicks();
    return () => {
      stopWatching();
      stopListening();
    };
  }, []);

  useEffect(() => {
    const unlock = () => {
      unlockAlarmSound();
      setTimeout(() => setSoundReady(alarmSoundReady()), 50);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  const missed = useMemo<MissedCopy[]>(() => {
    const list: MissedCopy[] = [];
    for (const s of signals) {
      if (copyingFollowers && !copyingFollowers.has(s.follower_account)) continue;
      const createdAt = new Date(s.created_at).getTime();
      const action = s.action === 'close' ? 'close' : 'open';
      const base = { id: s.id, action, follower: s.follower_account, master: s.master_account, symbol: s.symbol, lots: s.lots, createdAt } as const;
      if (s.status === 'failed') list.push({ ...base, kind: 'failed', at: s.processed_at ? new Date(s.processed_at).getTime() : createdAt });
      else if (now - createdAt >= STUCK_AFTER_MS) list.push({ ...base, kind: 'stuck', at: createdAt + STUCK_AFTER_MS });
    }
    return list.filter((m) => m.at > ackAt).sort((a, b) => b.at - a.at);
  }, [signals, now, ackAt, copyingFollowers]);

  const ring = useCallback(() => {
    stopSound.current();
    stopSound.current = playAlarm(ALARM_MS);
  }, []);

  useEffect(() => {
    const fresh = missed.filter((m) => !rung.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => rung.current.add(m.id));
    if (!muted) ring();
    if (pageInBackground()) {
      const first = fresh[0];
      const what = first.kind === 'failed' ? (first.action === 'close' ? 'failed to close' : 'failed to open') : first.action === 'close' ? 'close stuck' : 'not copied yet';
      const more = fresh.length > 1 ? ` (+${fresh.length - 1} more)` : '';
      void showDesktopAlert('Missed copy · 甩單警報', `${first.follower} ${what}: ${first.symbol} ${first.lots} lot from ${first.master}${more}`);
    }
  }, [missed, muted, ring]);

  const alerting = missed.length > 0 || testing;
  useEffect(() => {
    if (!alerting) return;
    return flashTitle(`(${Math.max(missed.length, 1)}) Missed copy!`);
  }, [alerting, missed.length]);

  useEffect(() => () => stopSound.current(), []);

  const acknowledge = useCallback(() => {
    const t = Date.now();
    localStorage.setItem(ACK_KEY, String(t));
    setAckAt(t);
    setTesting(false);
    stopSound.current();
  }, []);

  const setMuted = useCallback((m: boolean) => {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    setMutedState(m);
    if (m) stopSound.current();
  }, []);

  const test = useCallback(() => {
    unlockAlarmSound();
    setTesting(true);
    ring();
    setTestResult(null);
    void showDesktopAlert('Test alarm · 測試警報', 'Desktop notifications are working. 桌面通知正常。').then(setTestResult);
    setTimeout(() => setTesting(false), ALARM_MS);
  }, [ring]);

  const enableNotifications = useCallback(async () => {
    setPermission(await requestNotifyPermission());
    setTestResult(null);
  }, []);

  return { missed, active: alerting, testing, acknowledge, muted, setMuted, soundReady, test, testResult, permission, enableNotifications };
}

export type MissedCopyAlarm = ReturnType<typeof useMissedCopyAlarm>;
