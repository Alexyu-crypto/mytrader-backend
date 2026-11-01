/*
# Trading desk: safer order text + follower skip flag

1. Changes
- `desk_place_order`: symbol may only contain letters, digits and . _ # + - / ! (what brokers use);
  the comment keeps only letters, digits, spaces and . _ # : - (max 24 chars, MT4 limit is 31).
  This keeps orders readable by the terminal's simple message reader.
- `ea_poll_desk`: also returns `is_master`, so follower terminals stop checking the desk.
2. Security
- Unchanged: trader/admin only for placing orders; terminal functions still only act on master accounts.
*/

CREATE OR REPLACE FUNCTION public.desk_place_order(
  p_account text, p_symbol text, p_type text, p_lots double precision,
  p_price double precision DEFAULT 0, p_sl double precision DEFAULT 0, p_tp double precision DEFAULT 0, p_comment text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_symbol text := trim(coalesce(p_symbol, ''));
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN
    RAISE EXCEPTION 'master account not found';
  END IF;
  IF p_type NOT IN ('BUY','SELL','BUY_LIMIT','SELL_LIMIT','BUY_STOP','SELL_STOP') THEN RAISE EXCEPTION 'invalid order type'; END IF;
  IF p_lots IS NULL OR p_lots <= 0 THEN RAISE EXCEPTION 'invalid volume'; END IF;
  IF v_symbol !~ '^[A-Za-z0-9._#+/!-]{1,64}$' THEN RAISE EXCEPTION 'invalid symbol'; END IF;
  IF p_type NOT IN ('BUY','SELL') AND coalesce(p_price, 0) <= 0 THEN RAISE EXCEPTION 'price required'; END IF;
  IF coalesce(p_sl, 0) < 0 OR coalesce(p_tp, 0) < 0 THEN RAISE EXCEPTION 'invalid stops'; END IF;

  INSERT INTO desk_orders (account_name, symbol, order_type, lots, price, sl, tp, comment, requested_by, requested_email)
  VALUES (p_account, v_symbol, p_type, p_lots,
    CASE WHEN p_type IN ('BUY','SELL') THEN 0 ELSE p_price END,
    coalesce(p_sl, 0), coalesce(p_tp, 0),
    left(trim(regexp_replace(coalesce(p_comment, ''), '[^A-Za-z0-9 ._#:-]', '', 'g')), 24),
    auth.uid(), (SELECT email FROM app_members WHERE user_id = auth.uid()))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ea_poll_desk(p_account text, p_quotes jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_watch jsonb; v_orders jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN
    RETURN jsonb_build_object('watch', '[]'::jsonb, 'orders', '[]'::jsonb, 'active', false, 'is_master', false);
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

  RETURN jsonb_build_object('watch', v_watch, 'orders', v_orders, 'active', jsonb_array_length(v_watch) > 0, 'is_master', true);
END $$;