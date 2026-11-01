import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/lib/debounce';
import type { CopySignal } from '@/lib/types';

const ENGINE_STALE_SEC = 30;
const STATE_POLL_MS = 5000;
const BATCH_MS = 150;

interface EngineLogRow {
  id: number;
  message: string;
  created_at: string;
}

export type EngineHealth = 'checking' | 'running' | 'stale' | 'offline' | 'error';
export type LogTone = 'open' | 'close' | 'problem' | 'info';

export interface EngineLogEntry {
  id: number;
  time: string;
  message: string;
  tone: LogTone;
  hint?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour12: false });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function toEntry(row: EngineLogRow): EngineLogEntry {
  const m = row.message.toLowerCase();
  let tone: LogTone = 'info';
  let hint: string | undefined;
  if (m.includes('expired')) {
    tone = 'problem';
    hint = 'Followers did not open these trades in time. Check that the follower terminals and EAs are online. 跟單戶口未能及時開倉，請檢查跟單終端及 EA 是否在線。';
  } else if (m.includes('cancelled')) {
    tone = 'problem';
    hint = 'The master closed before followers could open, so these copies were skipped. 主戶口在跟單開倉前已平倉，故取消跟單。';
  } else if (m.includes('fail') || m.includes('error')) {
    tone = 'problem';
  } else if (m.includes('open')) {
    tone = 'open';
  } else if (m.includes('close')) {
    tone = 'close';
  }
  return { id: row.id, time: formatTime(row.created_at), message: row.message, tone, hint };
}

// The copy engine runs server-side (instantly on master changes, pg_cron every 1s as backup). This hook only reads its output via Realtime.
export function useCopyEngine() {
  const [signals, setSignals] = useState<CopySignal[]>([]);
  const [logRows, setLogRows] = useState<EngineLogRow[]>([]);
  const [lastRun, setLastRun] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    const loadSignals = debounce(async () => {
      const { data, error } = await supabase.from('copy_signals').select('*').order('created_at', { ascending: false }).limit(100);
      if (!cancelled && !error && data) setSignals(data as CopySignal[]);
    }, BATCH_MS);

    const loadLog = debounce(async () => {
      const { data, error } = await supabase.from('engine_log').select('id, message, created_at').order('id', { ascending: false }).limit(50);
      if (cancelled) return;
      setLoadError(!!error);
      if (data) setLogRows(data as EngineLogRow[]);
    }, BATCH_MS);

    const loadState = async () => {
      const { data, error } = await supabase.from('engine_state').select('last_run').eq('id', 1).maybeSingle();
      if (cancelled) return;
      if (error) setLoadError(true);
      else setLastRun((data?.last_run as string | null) ?? null);
    };

    const loadAll = () => {
      loadSignals();
      loadLog();
      loadState();
    };

    const channel = supabase
      .channel('copy-engine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'copy_signals' }, loadSignals)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'engine_log' }, loadLog)
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          loadAll();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnected(false);
        }
      });

    loadAll();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(loadState, STATE_POLL_MS);

    return () => {
      cancelled = true;
      loadSignals.cancel();
      loadLog.cancel();
      clearInterval(tick);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  const health: EngineHealth = loadError
    ? 'error'
    : !connected
      ? 'offline'
      : lastRun === undefined
        ? 'checking'
        : !lastRun || (now - new Date(lastRun).getTime()) / 1000 > ENGINE_STALE_SEC
          ? 'stale'
          : 'running';

  const engineLog = useMemo(() => logRows.map(toEntry), [logRows]);

  return { signals, engineLog, health, lastRun: lastRun ?? null };
}
