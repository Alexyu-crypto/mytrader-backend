/*
# Trading desk: place, modify and close orders on master accounts from the website

1. New tables
- `desk_orders`: market or pending orders a trader sends to a master terminal.
  - account_name, symbol, order_type (BUY/SELL/BUY_LIMIT/SELL_LIMIT/BUY_STOP/SELL_STOP), lots, price (pending only), sl, tp, comment
  - status: pending -> processing -> filled | failed, or expired if the terminal did not pick it up within 30 seconds
  - ticket (filled order number), error (broker message), requested_by / requested_email, created_at, processed_at
- `account_quotes`: latest bid/ask a master terminal reports for the symbols traders are watching (plus digits and volume limits).
- `desk_watch`: which symbols are open on the desk right now, so terminals only stream the prices that are needed.
- `desk_terminals`: last time each master terminal checked the desk (shows whether the terminal runs the desk-capable bridge).

2. New functions
- Trader/admin only (`can_operate()`): desk_place_order, desk_watch_symbol, desk_modify_position, desk_close_position.
- Terminal bridge: ea_poll_desk (streams prices, collects orders), ea_finish_desk_order (reports fill or error).

3. Security
- RLS enabled on all new tables. Only admin/trader can read them. No direct writes: every write goes through the functions above.
- Desk functions are revoked from anon. Bridge functions only act on master accounts and only on their own rows.

4. Notes
- Orders not picked up within 30 seconds expire instead of filling late at an unexpected price.
- No lot-size cap (requested by the operator); the terminal's own broker limits still apply.
*/

CREATE TABLE IF NOT EXISTS desk_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL REFERENCES accounts(account_name) ON UPDATE CASCADE ON DELETE CASCADE,
  symbol text NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('BUY','SELL','BUY_LIMIT','SELL_LIMIT','BUY_STOP','SELL_STOP')),
  lots double precision NOT NULL CHECK (lots > 0),
  price double precision NOT NULL DEFAULT 0,
  sl double precision NOT NULL DEFAULT 0,
  tp double precision NOT NULL DEFAULT 0,
  comment text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','filled','failed','expired')),
  ticket bigint,
  error text,
  requested_by uuid DEFAULT auth.uid(),
  requested_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS desk_orders_account_status_idx ON desk_orders (account_name, status, created_at);
CREATE INDEX IF NOT EXISTS desk_orders_created_idx ON desk_orders (created_at DESC);

CREATE TABLE IF NOT EXISTS account_quotes (
  account_name text NOT NULL REFERENCES accounts(account_name) ON UPDATE CASCADE ON DELETE CASCADE,
  symbol text NOT NULL,
  bid double precision NOT NULL DEFAULT 0,
  ask double precision NOT NULL DEFAULT 0,
  digits int NOT NULL DEFAULT 5,
  vol_min double precision NOT NULL DEFAULT 0.01,
  vol_step double precision NOT NULL DEFAULT 0.01,
  vol_max double precision NOT NULL DEFAULT 0,
  quoted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_name, symbol)
);

CREATE TABLE IF NOT EXISTS desk_watch (
  account_name text NOT NULL REFERENCES accounts(account_name) ON UPDATE CASCADE ON DELETE CASCADE,
  symbol text NOT NULL,
  until timestamptz NOT NULL,
  PRIMARY KEY (account_name, symbol)
);

CREATE TABLE IF NOT EXISTS desk_terminals (
  account_name text PRIMARY KEY REFERENCES accounts(account_name) ON UPDATE CASCADE ON DELETE CASCADE,
  polled_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE desk_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE desk_watch ENABLE ROW LEVEL SECURITY;
ALTER TABLE desk_terminals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators_read_desk_orders" ON desk_orders;
CREATE POLICY "operators_read_desk_orders" ON desk_orders FOR SELECT TO authenticated USING (can_operate());
DROP POLICY IF EXISTS "operators_read_account_quotes" ON account_quotes;
CREATE POLICY "operators_read_account_quotes" ON account_quotes FOR SELECT TO authenticated USING (can_operate());
DROP POLICY IF EXISTS "operators_read_desk_terminals" ON desk_terminals;
CREATE POLICY "operators_read_desk_terminals" ON desk_terminals FOR SELECT TO authenticated USING (can_operate());

-- Old bridges treat unknown actions as copy opens, so desk work never travels through copy_signals opens.

CREATE OR REPLACE FUNCTION public.desk_place_order(
  p_account text, p_symbol text, p_type text, p_lots double precision,
  p_price double precision DEFAULT 0, p_sl double precision DEFAULT 0, p_tp double precision DEFAULT 0, p_comment text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN
    RAISE EXCEPTION 'master account not found';
  END IF;
  IF p_type NOT IN ('BUY','SELL','BUY_LIMIT','SELL_LIMIT','BUY_STOP','SELL_STOP') THEN RAISE EXCEPTION 'invalid order type'; END IF;
  IF p_lots IS NULL OR p_lots <= 0 THEN RAISE EXCEPTION 'invalid volume'; END IF;
  IF length(trim(coalesce(p_symbol, ''))) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'invalid symbol'; END IF;
  IF p_type NOT IN ('BUY','SELL') AND coalesce(p_price, 0) <= 0 THEN RAISE EXCEPTION 'price required'; END IF;
  IF coalesce(p_sl, 0) < 0 OR coalesce(p_tp, 0) < 0 THEN RAISE EXCEPTION 'invalid stops'; END IF;

  INSERT INTO desk_orders (account_name, symbol, order_type, lots, price, sl, tp, comment, requested_by, requested_email)
  VALUES (p_account, trim(p_symbol), p_type, p_lots,
    CASE WHEN p_type IN ('BUY','SELL') THEN 0 ELSE p_price END,
    coalesce(p_sl, 0), coalesce(p_tp, 0), left(coalesce(p_comment, ''), 24), auth.uid(),
    (SELECT email FROM app_members WHERE user_id = auth.uid()))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.desk_watch_symbol(p_account text, p_symbol text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF length(trim(coalesce(p_symbol, ''))) NOT BETWEEN 1 AND 64 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN RETURN; END IF;
  INSERT INTO desk_watch (account_name, symbol, until) VALUES (p_account, trim(p_symbol), now() + interval '45 seconds')
  ON CONFLICT (account_name, symbol) DO UPDATE SET until = EXCLUDED.until;
END $$;

CREATE OR REPLACE FUNCTION public.desk_modify_position(p_account text, p_ticket bigint, p_sl double precision, p_tp double precision)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pos live_positions%ROWTYPE; v_copy text;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN RAISE EXCEPTION 'master account not found'; END IF;
  IF coalesce(p_sl, 0) < 0 OR coalesce(p_tp, 0) < 0 THEN RAISE EXCEPTION 'invalid stops'; END IF;
  SELECT * INTO v_pos FROM live_positions WHERE account_name = p_account AND ticket = p_ticket;
  IF NOT FOUND THEN RAISE EXCEPTION 'position not found'; END IF;
  v_copy := 'desk:' || p_account || ':' || p_ticket;
  UPDATE copy_signals SET status = 'cancelled', processed_at = now()
  WHERE copy_id = v_copy AND action = 'modify' AND status = 'pending';
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, sl, tp, status, action, copy_id, close_ticket)
  VALUES (p_account, p_account, p_ticket, v_pos.symbol, v_pos.order_type, v_pos.lots, coalesce(p_sl, 0), coalesce(p_tp, 0), 'pending', 'modify', v_copy, p_ticket);
  RETURN 'queued';
END $$;

CREATE OR REPLACE FUNCTION public.desk_close_position(p_account text, p_ticket bigint)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pos live_positions%ROWTYPE; v_copy text;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN RAISE EXCEPTION 'master account not found'; END IF;
  SELECT * INTO v_pos FROM live_positions WHERE account_name = p_account AND ticket = p_ticket;
  IF NOT FOUND THEN RAISE EXCEPTION 'position not found'; END IF;
  v_copy := 'manual:' || p_account || ':' || p_ticket;
  IF EXISTS (SELECT 1 FROM copy_signals WHERE copy_id = v_copy AND action = 'close' AND status IN ('pending','processing')) THEN
    RETURN 'already_queued';
  END IF;
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, status, action, copy_id, close_ticket)
  VALUES (p_account, '', 0, v_pos.symbol, v_pos.order_type, v_pos.lots, 'pending', 'close', v_copy, p_ticket);
  RETURN 'queued';
END $$;

CREATE OR REPLACE FUNCTION public.ea_poll_desk(p_account text, p_quotes jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_watch jsonb; v_orders jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN
    RETURN jsonb_build_object('watch', '[]'::jsonb, 'orders', '[]'::jsonb, 'active', false);
  END IF;

  INSERT INTO desk_terminals (account_name, polled_at) VALUES (p_account, now())
  ON CONFLICT (account_name) DO UPDATE SET polled_at = now();

  IF jsonb_typeof(p_quotes) = 'array' AND jsonb_array_length(p_quotes) > 0 THEN
    INSERT INTO account_quotes (account_name, symbol, bid, ask, digits, vol_min, vol_step, vol_max, quoted_at)
    SELECT p_account, q->>'s', (q->>'b')::float8, (q->>'a')::float8, coalesce((q->>'d')::int, 5),
      coalesce((q->>'mn')::float8, 0.01), coalesce((q->>'st')::float8, 0.01), coalesce((q->>'mx')::float8, 0), now()
    FROM (SELECT q FROM jsonb_array_elements(p_quotes) q LIMIT 20) t
    WHERE EXISTS (SELECT 1 FROM desk_watch w WHERE w.account_name = p_account AND w.symbol = q->>'s' AND w.until > now())
    ON CONFLICT (account_name, symbol) DO UPDATE SET
      bid = EXCLUDED.bid, ask = EXCLUDED.ask, digits = EXCLUDED.digits, vol_min = EXCLUDED.vol_min,
      vol_step = EXCLUDED.vol_step, vol_max = EXCLUDED.vol_max, quoted_at = EXCLUDED.quoted_at;
  END IF;

  UPDATE desk_orders SET status = 'expired', processed_at = now(), error = 'Terminal did not pick up the order within 30 seconds'
  WHERE account_name = p_account AND status = 'pending' AND created_at < now() - interval '30 seconds';

  WITH c AS (
    SELECT id FROM desk_orders WHERE account_name = p_account AND status = 'pending'
    ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE desk_orders d SET status = 'processing', processed_at = now() FROM c WHERE d.id = c.id
    RETURNING d.id, d.symbol, d.order_type, d.lots, d.price, d.sl, d.tp, d.comment, d.created_at
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'symbol', symbol, 'order_type', order_type, 'lots', lots,
    'price', price, 'sl', sl, 'tp', tp, 'comment', comment) ORDER BY created_at), '[]'::jsonb)
  INTO v_orders FROM u;

  SELECT coalesce(jsonb_agg(symbol), '[]'::jsonb) INTO v_watch
  FROM (SELECT symbol FROM desk_watch WHERE account_name = p_account AND until > now() LIMIT 20) w;

  RETURN jsonb_build_object('watch', v_watch, 'orders', v_orders, 'active', jsonb_array_length(v_watch) > 0);
END $$;

CREATE OR REPLACE FUNCTION public.ea_finish_desk_order(p_id uuid, p_account text, p_status text, p_ticket bigint DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_status NOT IN ('filled','failed') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE desk_orders SET status = p_status, ticket = p_ticket, error = left(p_error, 300), processed_at = now()
  WHERE id = p_id AND account_name = p_account AND status = 'processing';
END $$;

REVOKE ALL ON FUNCTION public.desk_place_order(text, text, text, double precision, double precision, double precision, double precision, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desk_watch_symbol(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desk_modify_position(text, bigint, double precision, double precision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desk_close_position(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desk_place_order(text, text, text, double precision, double precision, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desk_watch_symbol(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desk_modify_position(text, bigint, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desk_close_position(text, bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.ea_poll_desk(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ea_finish_desk_order(uuid, text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ea_poll_desk(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ea_finish_desk_order(uuid, text, text, bigint, text) TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'desk_orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE desk_orders;
  END IF;
END $$;