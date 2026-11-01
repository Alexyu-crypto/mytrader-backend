import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { DeskOrder, MarketSide, Quote } from '@/lib/desk';

export interface DeskTicket {
  id: string;
  position: number;
  account_name: string | null;
  symbol: string;
  lots: number;
  sl: number;
  tp: number;
  side: MarketSide;
  armed: boolean;
}

type TicketPatch = Partial<Omit<DeskTicket, 'id'>>;

const SAVE_DELAY_MS = 500;
const QUOTE_POLL_MS = 800;
const WATCH_REFRESH_MS = 20000;
const COLUMNS = 'id, position, account_name, symbol, lots, sl, tp, side, armed';

const toTicket = (r: Record<string, unknown>): DeskTicket => ({
  id: String(r.id),
  position: Number(r.position) || 0,
  account_name: (r.account_name as string | null) ?? null,
  symbol: String(r.symbol ?? ''),
  lots: Number(r.lots) || 0,
  sl: Number(r.sl) || 0,
  tp: Number(r.tp) || 0,
  side: r.side === 'SELL' ? 'SELL' : 'BUY',
  armed: !!r.armed,
});

export function useDeskTickets() {
  const [tickets, setTickets] = useState<DeskTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; patch: TicketPatch }>());
  const latest = useRef<DeskTicket[]>([]);
  latest.current = tickets;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('desk_tickets')
      .select(COLUMNS)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !Array.isArray(data)) setError('Could not load your windows. 無法載入視窗。');
        else setTickets(data.map(toTicket));
        setLoading(false);
      });
    const saves = pending.current;
    return () => {
      cancelled = true;
      saves.forEach(({ timer, patch }, id) => {
        clearTimeout(timer);
        supabase.from('desk_tickets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).then();
      });
      saves.clear();
    };
  }, []);

  const add = useCallback(async (seed: TicketPatch) => {
    setError('');
    const position = tickets.reduce((m, t) => Math.max(m, t.position), 0) + 1;
    const { data, error: err } = await supabase.from('desk_tickets').insert({ ...seed, position }).select(COLUMNS).maybeSingle();
    if (err || !data) {
      setError('Could not add a window. 無法新增視窗。');
      return;
    }
    setTickets((prev) => [...prev, toTicket(data)]);
  }, [tickets]);

  const update = useCallback((id: string, patch: TicketPatch) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const saves = pending.current;
    const prior = saves.get(id);
    if (prior) clearTimeout(prior.timer);
    const merged = { ...prior?.patch, ...patch };
    const timer = setTimeout(async () => {
      saves.delete(id);
      const { error: err } = await supabase.from('desk_tickets').update({ ...merged, updated_at: new Date().toISOString() }).eq('id', id);
      if (err) setError('A change was not saved. 有修改未能儲存。');
    }, SAVE_DELAY_MS);
    saves.set(id, { timer, patch: merged });
  }, []);

  const updateAll = useCallback((patch: TicketPatch) => {
    latest.current.forEach((t) => update(t.id, patch));
  }, [update]);

  const remove = useCallback(async (id: string) => {
    const prior = pending.current.get(id);
    if (prior) clearTimeout(prior.timer);
    pending.current.delete(id);
    setTickets((prev) => prev.filter((t) => t.id !== id));
    const { error: err } = await supabase.from('desk_tickets').delete().eq('id', id);
    if (err) setError('Could not remove the window. 無法移除視窗。');
  }, []);

  return { tickets, loading, error, add, update, updateAll, remove };
}

export const pairKey = (account: string, symbol: string) => `${account}\u0000${symbol}`;

export function useQuoteBoard(pairs: { account: string; symbol: string }[]) {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const signature = [...new Set(pairs.map((p) => pairKey(p.account, p.symbol)))].sort().join('|');

  useEffect(() => {
    const list = signature ? signature.split('|').map((k) => k.split('\u0000') as [string, string]) : [];
    if (list.length === 0) {
      setQuotes(new Map());
      return;
    }
    let cancelled = false;
    const wanted = new Set(list.map(([a, s]) => pairKey(a, s)));
    const accounts = [...new Set(list.map(([a]) => a))];

    const watch = () => list.forEach(([a, s]) => supabase.rpc('desk_watch_symbol', { p_account: a, p_symbol: s }).then());
    const poll = async () => {
      const { data } = await supabase
        .from('account_quotes')
        .select('account_name, symbol, bid, ask, digits, vol_min, vol_step, vol_max, quoted_at')
        .in('account_name', accounts);
      if (cancelled || !Array.isArray(data)) return;
      const next = new Map<string, Quote>();
      for (const r of data) {
        const key = pairKey(r.account_name, r.symbol);
        if (wanted.has(key) && typeof r.bid === 'number' && typeof r.ask === 'number') next.set(key, r as Quote);
      }
      setQuotes(next);
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
  }, [signature]);

  return quotes;
}

export function useOrderStatuses(ids: string[]) {
  const [orders, setOrders] = useState<Map<string, DeskOrder>>(new Map());
  const signature = [...new Set(ids)].sort().join(',');

  useEffect(() => {
    if (!signature) {
      setOrders(new Map());
      return;
    }
    let cancelled = false;
    const list = signature.split(',');
    const load = async () => {
      const { data } = await supabase
        .from('desk_orders')
        .select('id, account_name, symbol, order_type, lots, price, sl, tp, status, ticket, error, requested_email, created_at, processed_at')
        .in('id', list);
      if (!cancelled && Array.isArray(data)) setOrders(new Map((data as DeskOrder[]).map((o) => [o.id, o])));
    };
    load();
    const channel = supabase
      .channel(`trader-manager-orders-${signature.length}-${list[0]}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'desk_orders' }, (payload) => {
        const row = payload.new as DeskOrder;
        if (list.includes(row.id)) setOrders((prev) => new Map(prev).set(row.id, { ...prev.get(row.id), ...row }));
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [signature]);

  return orders;
}
