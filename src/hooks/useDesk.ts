import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { DeskOrder, Quote } from '@/lib/desk';

const QUOTE_POLL_MS = 700;
const WATCH_REFRESH_MS = 20000;
const MAX_TICKS = 150;

export interface Tick {
  t: number;
  bid: number;
  ask: number;
}

export function useLiveQuote(account: string | null, symbol: string) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [ticks, setTicks] = useState<Tick[]>([]);

  useEffect(() => {
    setQuote(null);
    setTicks([]);
    if (!account || !symbol) return;
    let cancelled = false;
    let lastAt = '';

    const watch = () => supabase.rpc('desk_watch_symbol', { p_account: account, p_symbol: symbol }).then();
    const poll = async () => {
      const { data } = await supabase
        .from('account_quotes')
        .select('bid, ask, digits, vol_min, vol_step, vol_max, quoted_at')
        .eq('account_name', account)
        .eq('symbol', symbol)
        .maybeSingle();
      if (cancelled || !data || typeof data.bid !== 'number' || typeof data.ask !== 'number') return;
      const q = data as Quote;
      setQuote(q);
      if (q.quoted_at !== lastAt) {
        lastAt = q.quoted_at;
        setTicks((prev) => [...prev, { t: new Date(q.quoted_at).getTime(), bid: q.bid, ask: q.ask }].slice(-MAX_TICKS));
      }
    };

    watch();
    poll();
    const pollId = window.setInterval(poll, QUOTE_POLL_MS);
    const watchId = window.setInterval(watch, WATCH_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.clearInterval(watchId);
    };
  }, [account, symbol]);

  return { quote, ticks };
}

export function useDeskOrders(account: string | null) {
  const [orders, setOrders] = useState<DeskOrder[]>([]);

  const load = useCallback(async () => {
    if (!account) return setOrders([]);
    const { data } = await supabase
      .from('desk_orders')
      .select('id, account_name, symbol, order_type, lots, price, sl, tp, status, ticket, error, requested_email, created_at, processed_at')
      .eq('account_name', account)
      .order('created_at', { ascending: false })
      .limit(15);
    if (Array.isArray(data)) setOrders(data as DeskOrder[]);
  }, [account]);

  useEffect(() => {
    load();
    if (!account) return;
    const channel = supabase
      .channel(`desk-orders-${account}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'desk_orders', filter: `account_name=eq.${account}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [account, load]);

  return { orders, reload: load };
}

export function useDeskMeta() {
  const [terminals, setTerminals] = useState<Map<string, string>>(new Map());
  const [groups, setGroups] = useState<Map<string, string>>(new Map());
  const [followers, setFollowers] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [t, g, s] = await Promise.all([
        supabase.from('desk_terminals').select('account_name, polled_at'),
        supabase.from('copy_groups').select('master_account, name'),
        supabase.from('copy_settings').select('master_account, follower_account'),
      ]);
      if (cancelled) return;
      if (Array.isArray(t.data)) setTerminals(new Map(t.data.map((r) => [r.account_name as string, r.polled_at as string])));
      if (Array.isArray(g.data)) setGroups(new Map(g.data.map((r) => [r.master_account as string, r.name as string])));
      if (Array.isArray(s.data)) {
        const m = new Map<string, string[]>();
        for (const r of s.data as { master_account: string; follower_account: string }[]) {
          m.set(r.master_account, [...(m.get(r.master_account) ?? []), r.follower_account]);
        }
        setFollowers(m);
      }
    };
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { terminals, groups, followers };
}
