/*
# Symbol mapping and extra copy controls

Different brokers name the same instrument differently (e.g. XAUUSD vs XAUUSD.m vs GOLD).
This lets each master -> follower copy setting translate symbol names, and adds a few extra controls.

1. Modified Tables
- `copy_settings`
  - `symbol_map` (jsonb, default {}) - explicit pairs: MASTER SYMBOL (uppercase) -> follower symbol. Highest priority.
  - `strip_suffix` (text, default '') - suffix removed from the master symbol before translating (e.g. ".pro").
  - `add_prefix` (text, default '') - text added in front of the follower symbol.
  - `add_suffix` (text, default '') - text added after the follower symbol (e.g. ".m").
  - `copy_sl` (boolean, default true) - copy stop loss to the follower.
  - `copy_tp` (boolean, default true) - copy take profit to the follower.
  - `max_open_trades` (integer, default 0) - max simultaneous copied trades for this pair, 0 = unlimited.

2. Engine changes
- `run_copy_engine()` now computes the follower symbol: explicit map first, otherwise
  prefix + (master symbol minus strip_suffix) + suffix.
- Allowed / blocked symbol filters and crypto detection still use the MASTER symbol.
- Close signals already reuse the stored follower symbol, so closes follow the mapping automatically.
- SL / TP are sent as 0 when the corresponding copy flag is off.
- New opens beyond `max_open_trades` for a pair are skipped (they are picked up later if slots free up).

3. Security
- No policy changes. Existing copy_settings policies cover the new columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'copy_settings' AND column_name = 'symbol_map') THEN
    ALTER TABLE copy_settings ADD COLUMN symbol_map jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'copy_settings' AND column_name = 'strip_suffix') THEN
    ALTER TABLE copy_settings ADD COLUMN strip_suffix text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'copy_settings' AND column_name = 'add_prefix') THEN
    ALTER TABLE copy_settings ADD COLUMN add_prefix text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'copy_settings' AND column_name = 'add_suffix') THEN
    ALTER TABLE copy_settings ADD COLUMN add_suffix text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'copy_settings' AND column_name = 'copy_sl') THEN
    ALTER TABLE copy_settings ADD COLUMN copy_sl boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'copy_settings' AND column_name = 'copy_tp') THEN
    ALTER TABLE copy_settings ADD COLUMN copy_tp boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'copy_settings' AND column_name = 'max_open_trades') THEN
    ALTER TABLE copy_settings ADD COLUMN max_open_trades integer NOT NULL DEFAULT 0 CHECK (max_open_trades >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION run_copy_engine() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record;
  v_now timestamptz := now();
  utc timestamp := (now() AT TIME ZONE 'UTC');
  dow int := extract(dow FROM (now() AT TIME ZONE 'UTC'))::int;
  mins int := extract(hour FROM (now() AT TIME ZONE 'UTC'))::int * 60 + extract(minute FROM (now() AT TIME ZONE 'UTC'))::int;
  close_min int;
  near_close boolean := false;
  weekend boolean := false;
  v_mode text;
  v_state record;
  v_offline text;
  v_crypto text[];
  v_max_age int;
  n_open int := 0;
  n_close int := 0;
  n_cancel int := 0;
  n_expired int := 0;
  n_retry int := 0;
  n_stuck int := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(7340021) THEN RETURN; END IF;

  SELECT * INTO cfg FROM app_settings ORDER BY created_at LIMIT 1;
  close_min := coalesce(cfg.friday_close_utc_hour, 21) * 60;
  v_crypto := coalesce(cfg.crypto_symbols, '{}'::text[]);
  v_max_age := greatest(coalesce(cfg.signal_max_age_sec, 300), 30);

  IF coalesce(cfg.friday_close_enabled, true) AND dow = 5
     AND mins >= close_min - coalesce(cfg.friday_close_safe_minutes, 15) AND mins < close_min THEN
    near_close := true;
  END IF;
  IF coalesce(cfg.weekend_pause_enabled, true) THEN
    IF (dow = 5 AND mins >= close_min) OR dow = 6 OR (dow = 0 AND mins < close_min) THEN
      weekend := true;
    END IF;
  END IF;

  v_mode := CASE WHEN weekend THEN 'weekend' WHEN near_close THEN 'friday_close' ELSE 'normal' END;
  SELECT * INTO v_state FROM engine_state WHERE id = 1 FOR UPDATE;
  IF v_state.last_mode IS DISTINCT FROM v_mode THEN
    INSERT INTO engine_log(message) VALUES (CASE v_mode
      WHEN 'friday_close' THEN format('Friday close protection: new signals paused, only closes allowed (%s min to %s:00 UTC)',
        close_min - mins, coalesce(cfg.friday_close_utc_hour, 21))
      WHEN 'weekend' THEN 'Weekend pause: non-crypto new signals paused, crypto (24/7) still active, closes allowed'
      ELSE 'Market open: normal copying active' END);
  END IF;

  SELECT coalesce(string_agg(DISTINCT a.account_name, ', ' ORDER BY a.account_name), '') INTO v_offline
  FROM accounts a JOIN copy_settings cs ON cs.master_account = a.account_name AND cs.enabled
  WHERE a.type = 'master' AND (a.last_seen IS NULL OR a.last_seen < v_now - interval '60 seconds');
  IF v_offline <> v_state.last_offline THEN
    INSERT INTO engine_log(message) VALUES (CASE WHEN v_offline = '' THEN 'All masters online'
      ELSE 'Master offline (>60s): ' || v_offline || ' — new opens paused, open trades kept until master returns' END);
  END IF;

  UPDATE copy_signals s SET status = 'pending', processed_at = NULL
  WHERE s.status = 'processing' AND s.action = 'close' AND s.processed_at < v_now - interval '30 seconds'
    AND NOT EXISTS (SELECT 1 FROM copy_signals p WHERE p.copy_id = s.copy_id AND p.action = 'close' AND p.status = 'pending');
  WITH x AS (
    UPDATE copy_signals s SET status = 'failed', processed_at = v_now
    WHERE s.status = 'processing' AND s.action = 'open' AND s.processed_at < v_now - interval '60 seconds'
    RETURNING s.copy_id)
  , y AS (
    UPDATE copy_trades ct SET status = 'cancelled', cancel_reason = 'expired', closed_at = v_now
    WHERE ct.status = 'pending_open' AND ct.copy_id IN (SELECT copy_id FROM x) RETURNING 1)
  SELECT count(*) INTO n_stuck FROM y;

  UPDATE copy_trades ct SET master_missing_since = v_now
  WHERE ct.status IN ('pending_open', 'open') AND ct.master_missing_since IS NULL
    AND NOT EXISTS (SELECT 1 FROM live_positions lp WHERE lp.account_name = ct.master_account AND lp.ticket = ct.master_ticket)
    AND EXISTS (SELECT 1 FROM accounts a WHERE a.account_name = ct.master_account AND a.last_seen > v_now - interval '15 seconds');

  UPDATE copy_trades ct SET master_missing_since = NULL
  WHERE ct.master_missing_since IS NOT NULL AND ct.status IN ('pending_open', 'open')
    AND EXISTS (SELECT 1 FROM live_positions lp WHERE lp.account_name = ct.master_account AND lp.ticket = ct.master_ticket);

  CREATE TEMP TABLE IF NOT EXISTS _closed_masters (copy_id text PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _closed_masters;
  INSERT INTO _closed_masters
  SELECT ct.copy_id FROM copy_trades ct
  WHERE ct.status IN ('pending_open', 'open') AND ct.master_missing_since IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM trade_history th WHERE th.account_name = ct.master_account AND th.ticket = ct.master_ticket)
      OR (ct.master_missing_since < v_now - interval '4 seconds'
          AND EXISTS (SELECT 1 FROM accounts a WHERE a.account_name = ct.master_account
                      AND a.last_seen > ct.master_missing_since + interval '3 seconds'))
    );

  UPDATE copy_signals s SET status = 'cancelled', processed_at = v_now
  WHERE s.status = 'pending' AND s.action = 'open' AND s.copy_id IN (
    SELECT c.copy_id FROM _closed_masters c JOIN copy_trades ct USING (copy_id) WHERE ct.status = 'pending_open');
  WITH x AS (
    UPDATE copy_trades ct SET status = 'cancelled', cancel_reason = 'master_closed', closed_at = v_now
    WHERE ct.status = 'pending_open' AND ct.copy_id IN (SELECT copy_id FROM _closed_masters) RETURNING 1)
  SELECT count(*) INTO n_cancel FROM x;

  WITH x AS (
    UPDATE copy_trades ct SET status = 'pending_close'
    WHERE ct.status = 'open' AND ct.copy_id IN (SELECT copy_id FROM _closed_masters) RETURNING ct.*)
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, status, action, copy_id)
  SELECT x.follower_account, x.master_account, x.master_ticket, x.symbol, x.order_type, x.lots, 'pending', 'close', x.copy_id FROM x
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_close = ROW_COUNT;

  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, status, action, copy_id)
  SELECT ct.follower_account, ct.master_account, ct.master_ticket, ct.symbol, ct.order_type, ct.lots, 'pending', 'close', ct.copy_id
  FROM copy_trades ct
  WHERE ct.status = 'pending_close'
    AND NOT EXISTS (SELECT 1 FROM copy_signals s WHERE s.copy_id = ct.copy_id AND s.action = 'close' AND s.status IN ('pending', 'processing'))
    AND NOT EXISTS (SELECT 1 FROM copy_signals s WHERE s.copy_id = ct.copy_id AND s.action = 'close' AND s.processed_at > v_now - interval '10 seconds')
  ON CONFLICT DO NOTHING;

  WITH x AS (
    UPDATE copy_signals s SET status = 'failed', processed_at = v_now
    WHERE s.status = 'pending' AND s.action = 'open' AND s.created_at < v_now - make_interval(secs => v_max_age)
    RETURNING s.copy_id)
  , y AS (
    UPDATE copy_trades ct SET status = 'cancelled', cancel_reason = 'expired', closed_at = v_now
    WHERE ct.status = 'pending_open' AND ct.copy_id IN (SELECT copy_id FROM x) RETURNING 1)
  SELECT count(*) INTO n_expired FROM y;

  CREATE TEMP TABLE IF NOT EXISTS _cand (
    copy_id text PRIMARY KEY, master_account text, master_ticket bigint, follower_account text,
    symbol text, order_type text, lots double precision, open_price double precision,
    sl double precision, tp double precision, magic integer) ON COMMIT DROP;
  TRUNCATE _cand;
  INSERT INTO _cand
  SELECT q.copy_id, q.account_name, q.ticket, q.follower_account, q.fsymbol, q.otype,
         round(greatest(coalesce(q.min_lot, 0.01), least(coalesce(q.max_lot, 10), q.raw_lot))::numeric, 2)::double precision,
         q.open_price, coalesce(q.fsl, 0), coalesce(q.ftp, 0), coalesce(q.magic, 0)
  FROM (
    SELECT lp.account_name || ':' || lp.ticket || ':' || cs.follower_account AS copy_id,
           lp.account_name, lp.ticket, cs.follower_account, lp.open_price, lp.magic,
           cs.min_lot, cs.max_lot,
           coalesce(
             nullif(btrim(coalesce(cs.symbol_map, '{}'::jsonb) ->> upper(lp.symbol)), ''),
             coalesce(cs.add_prefix, '')
               || CASE WHEN coalesce(cs.strip_suffix, '') <> ''
                            AND length(lp.symbol) > length(cs.strip_suffix)
                            AND upper(right(lp.symbol, length(cs.strip_suffix))) = upper(cs.strip_suffix)
                       THEN left(lp.symbol, length(lp.symbol) - length(cs.strip_suffix))
                       ELSE lp.symbol END
               || coalesce(cs.add_suffix, '')
           ) AS fsymbol,
           CASE WHEN NOT coalesce(cs.copy_sl, true) THEN 0
                WHEN coalesce(cs.reverse, false) THEN lp.tp ELSE lp.sl END AS fsl,
           CASE WHEN NOT coalesce(cs.copy_tp, true) THEN 0
                WHEN coalesce(cs.reverse, false) THEN lp.sl ELSE lp.tp END AS ftp,
           CASE WHEN NOT coalesce(cs.reverse, false) THEN lp.order_type
                WHEN lp.order_type = 'BUY' THEN 'SELL' WHEN lp.order_type = 'SELL' THEN 'BUY'
                WHEN lp.order_type = 'BUY_LIMIT' THEN 'SELL_STOP' WHEN lp.order_type = 'SELL_LIMIT' THEN 'BUY_STOP'
                WHEN lp.order_type = 'BUY_STOP' THEN 'SELL_LIMIT' WHEN lp.order_type = 'SELL_STOP' THEN 'BUY_LIMIT'
                ELSE lp.order_type END AS otype,
           CASE coalesce(cs.mode, 'multiplier')
             WHEN 'fixed' THEN cs.fixed_lot
             WHEN 'ratio' THEN CASE WHEN coalesce(m.balance, 0) > 0 AND coalesce(f.balance, 0) > 0
                                    THEN lp.lots * (f.balance / m.balance) * coalesce(cs.lot_multiplier, 1) END
             ELSE lp.lots * coalesce(cs.lot_multiplier, 1) END AS raw_lot
    FROM live_positions lp
    JOIN accounts m ON m.account_name = lp.account_name AND m.type = 'master' AND coalesce(m.is_active, true)
                   AND m.last_seen > v_now - interval '60 seconds'
    JOIN copy_settings cs ON cs.master_account = lp.account_name AND cs.enabled
    JOIN accounts f ON f.account_name = cs.follower_account AND f.type = 'follower' AND coalesce(f.is_active, true)
    WHERE lp.updated_at > v_now - interval '60 seconds'
      AND coalesce(lp.lots, 0) > 0
      AND (lp.order_type IN ('BUY', 'SELL') OR coalesce(cs.copy_pending_orders, false))
      AND (coalesce(cardinality(cs.allowed_symbols), 0) = 0
           OR EXISTS (SELECT 1 FROM unnest(cs.allowed_symbols) a WHERE upper(lp.symbol) = upper(a)))
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(cs.blocked_symbols, '{}'::text[])) b WHERE upper(lp.symbol) = upper(b))
      AND (NOT (weekend OR near_close)
           OR EXISTS (SELECT 1 FROM unnest(v_crypto) c WHERE c <> '' AND upper(lp.symbol) LIKE upper(c) || '%'))
  ) q
  WHERE q.raw_lot IS NOT NULL AND q.raw_lot > 0;

  -- Enforce max_open_trades: drop brand-new candidates that exceed the remaining slots for their pair
  DELETE FROM _cand d
  USING (
    SELECT c.copy_id,
           row_number() OVER (PARTITION BY c.master_account, c.follower_account ORDER BY c.master_ticket) AS rn,
           cs.max_open_trades AS lim,
           (SELECT count(*) FROM copy_trades ct
             WHERE ct.master_account = c.master_account AND ct.follower_account = c.follower_account
               AND ct.status IN ('pending_open', 'open', 'pending_close')) AS active
    FROM _cand c
    JOIN copy_settings cs ON cs.master_account = c.master_account AND cs.follower_account = c.follower_account
    WHERE coalesce(cs.max_open_trades, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM copy_trades ct WHERE ct.copy_id = c.copy_id AND ct.status <> 'cancelled')
  ) z
  WHERE d.copy_id = z.copy_id AND z.rn > z.lim - z.active;

  WITH r AS (
    UPDATE copy_trades ct SET status = 'pending_open', attempts = ct.attempts + 1, cancel_reason = NULL,
      closed_at = NULL, lots = c.lots, symbol = c.symbol, follower_ticket = NULL, master_missing_since = NULL
    FROM _cand c
    WHERE ct.copy_id = c.copy_id AND ct.status = 'cancelled' AND ct.cancel_reason = 'open_failed'
      AND ct.attempts < 3 AND ct.created_at > v_now - interval '120 seconds'
      AND ct.closed_at < v_now - interval '5 seconds'
    RETURNING ct.copy_id)
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, open_price, sl, tp, magic, status, action, copy_id)
  SELECT c.follower_account, c.master_account, c.master_ticket, c.symbol, c.order_type, c.lots, c.open_price, c.sl, c.tp, c.magic, 'pending', 'open', c.copy_id
  FROM _cand c JOIN r USING (copy_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_retry = ROW_COUNT;

  WITH ins AS (
    INSERT INTO copy_trades (copy_id, master_account, master_ticket, follower_account, symbol, order_type, lots, open_price, sl, tp, magic, status)
    SELECT c.copy_id, c.master_account, c.master_ticket, c.follower_account, c.symbol, c.order_type, c.lots, c.open_price, c.sl, c.tp, c.magic, 'pending_open'
    FROM _cand c
    ON CONFLICT (copy_id) DO NOTHING
    RETURNING *)
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, open_price, sl, tp, magic, status, action, copy_id)
  SELECT ins.follower_account, ins.master_account, ins.master_ticket, ins.symbol, ins.order_type, ins.lots, ins.open_price, ins.sl, ins.tp, ins.magic, 'pending', 'open', ins.copy_id
  FROM ins
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_open = ROW_COUNT;

  IF n_open + n_close + n_cancel + n_expired + n_retry + n_stuck > 0 THEN
    INSERT INTO engine_log(message) VALUES (concat_ws(', ',
      CASE WHEN n_open > 0 THEN n_open || ' open signal(s)' END,
      CASE WHEN n_close > 0 THEN n_close || ' close signal(s)' END,
      CASE WHEN n_retry > 0 THEN n_retry || ' open retry(s)' END,
      CASE WHEN n_cancel > 0 THEN n_cancel || ' cancelled (master closed before follower opened)' END,
      CASE WHEN n_expired > 0 THEN n_expired || ' expired open(s) after ' || v_max_age || 's' END,
      CASE WHEN n_stuck > 0 THEN n_stuck || ' open(s) abandoned by EA mid-execution' END));
  END IF;

  UPDATE engine_state SET last_mode = v_mode, last_offline = v_offline, last_run = v_now WHERE id = 1;

  IF extract(second FROM utc) < 3 AND extract(minute FROM utc) = 0 THEN
    DELETE FROM engine_log WHERE created_at < v_now - interval '3 days';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION run_copy_engine() FROM PUBLIC, anon, authenticated;
