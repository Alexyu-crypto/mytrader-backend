/*
# Server-side copy engine (Production V1)

## Why
The copy engine used to run inside the browser on the Dashboard page. If the page was closed,
navigated away, or opened in two tabs, trades were missed, duplicated, or closed by mistake.
It now runs inside the database every 3 seconds via pg_cron, so copying works 24/7.

## New tables
- `engine_log` (id, message, created_at): event log shown on the Dashboard ("Copy Engine Log").
- `engine_state` (id=1, last_mode, last_offline): remembers last market mode so log lines are
  written once per change instead of every cycle.

## Modified tables
- `copy_trades`: + `master_missing_since` (when the master ticket first disappeared),
  + `attempts` (open attempts), + `cancel_reason` (why an open was cancelled).
- `copy_signals`: unique partial index so only one pending signal per (copy_id, action).

## Triggers
- `accounts.last_seen` and `live_positions.updated_at` are stamped with the server clock, so
  broker server time zones can never make a master look online/offline incorrectly.
- `copy_signals`: clients may only change a signal that is still `pending`.

## Security
- anon/authenticated can no longer INSERT or DELETE copy_signals / copy_trades (only the engine
  creates them). They may only UPDATE the status columns the EA needs.
- `engine_log` and `engine_state` are read-only for clients.
- `run_copy_engine()` is SECURITY DEFINER and NOT executable by anon/authenticated.

## Engine rules
1. Close only after the master ticket has been missing for 2+ EA cycles while the master is online
   (or the ticket appears in trade_history). Prevents false closes.
2. Close signals never expire and are generated on weekends too (EA retries until market opens).
3. Non-crypto opens paused in Friday close window and weekend; crypto matched by prefix
   (BTCUSD matches BTCUSD.m / BTCUSDm).
4. Failed opens retried up to 3 times within 2 minutes; expired opens cancelled.
5. Lot: multiplier = lots*mult; ratio = lots*(follower balance/master balance)*mult; fixed = fixed_lot.
   Zero/negative lots or balances skip the trade.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE copy_trades ADD COLUMN IF NOT EXISTS master_missing_since timestamptz;
ALTER TABLE copy_trades ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1;
ALTER TABLE copy_trades ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS idx_copy_trades_status ON copy_trades(status);
CREATE INDEX IF NOT EXISTS idx_copy_signals_pending ON copy_signals(follower_account, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_copy_signals_pending_action
  ON copy_signals(copy_id, action) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS engine_log (
  id bigserial PRIMARY KEY,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engine_log_created ON engine_log(created_at DESC);
ALTER TABLE engine_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_engine_log" ON engine_log;
CREATE POLICY "anon_select_engine_log" ON engine_log FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON engine_log FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS engine_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_mode text NOT NULL DEFAULT '',
  last_offline text NOT NULL DEFAULT '',
  last_run timestamptz
);
INSERT INTO engine_state (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE engine_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_engine_state" ON engine_state;
CREATE POLICY "anon_select_engine_state" ON engine_state FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON engine_state FROM anon, authenticated;

-- Server clock stamps
CREATE OR REPLACE FUNCTION stamp_account_last_seen() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.last_seen IS NOT NULL THEN NEW.last_seen := now(); END IF;
  ELSIF NEW.last_seen IS DISTINCT FROM OLD.last_seen THEN
    NEW.last_seen := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stamp_account_last_seen ON accounts;
CREATE TRIGGER trg_stamp_account_last_seen BEFORE INSERT OR UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION stamp_account_last_seen();

CREATE OR REPLACE FUNCTION stamp_position_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stamp_position_updated_at ON live_positions;
CREATE TRIGGER trg_stamp_position_updated_at BEFORE INSERT OR UPDATE ON live_positions
  FOR EACH ROW EXECUTE FUNCTION stamp_position_updated_at();

CREATE OR REPLACE FUNCTION guard_signal_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'signal already processed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_signal_update ON copy_signals;
CREATE TRIGGER trg_guard_signal_update BEFORE UPDATE ON copy_signals
  FOR EACH ROW EXECUTE FUNCTION guard_signal_update();

-- Lock down engine-owned tables
DROP POLICY IF EXISTS "anon_insert_copy_signals" ON copy_signals;
DROP POLICY IF EXISTS "anon_delete_copy_signals" ON copy_signals;
DROP POLICY IF EXISTS "anon_insert_copy_trades" ON copy_trades;
DROP POLICY IF EXISTS "anon_delete_copy_trades" ON copy_trades;
REVOKE INSERT, UPDATE, DELETE ON copy_signals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON copy_trades FROM anon, authenticated;
GRANT UPDATE (status, processed_at) ON copy_signals TO anon, authenticated;
GRANT UPDATE (status, follower_ticket, opened_at, closed_at, cancel_reason) ON copy_trades TO anon, authenticated;

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

  -- Track master tickets that disappeared (only while master EA is online)
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

  -- Master closed before follower opened: cancel
  UPDATE copy_signals s SET status = 'cancelled', processed_at = v_now
  WHERE s.status = 'pending' AND s.action = 'open' AND s.copy_id IN (
    SELECT c.copy_id FROM _closed_masters c JOIN copy_trades ct USING (copy_id) WHERE ct.status = 'pending_open');
  WITH x AS (
    UPDATE copy_trades ct SET status = 'cancelled', cancel_reason = 'master_closed', closed_at = v_now
    WHERE ct.status = 'pending_open' AND ct.copy_id IN (SELECT copy_id FROM _closed_masters) RETURNING 1)
  SELECT count(*) INTO n_cancel FROM x;

  -- Master closed: close follower
  WITH x AS (
    UPDATE copy_trades ct SET status = 'pending_close'
    WHERE ct.status = 'open' AND ct.copy_id IN (SELECT copy_id FROM _closed_masters) RETURNING ct.*)
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, status, action, copy_id)
  SELECT x.follower_account, x.master_account, x.master_ticket, x.symbol, x.order_type, x.lots, 'pending', 'close', x.copy_id FROM x
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_close = ROW_COUNT;

  -- Re-issue close signals for pending_close trades that lost their signal
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, status, action, copy_id)
  SELECT ct.follower_account, ct.master_account, ct.master_ticket, ct.symbol, ct.order_type, ct.lots, 'pending', 'close', ct.copy_id
  FROM copy_trades ct
  WHERE ct.status = 'pending_close'
    AND NOT EXISTS (SELECT 1 FROM copy_signals s WHERE s.copy_id = ct.copy_id AND s.action = 'close' AND s.status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM copy_signals s WHERE s.copy_id = ct.copy_id AND s.action = 'close' AND s.processed_at > v_now - interval '10 seconds')
  ON CONFLICT DO NOTHING;

  -- Expire stale open signals (close signals never expire)
  WITH x AS (
    UPDATE copy_signals s SET status = 'failed', processed_at = v_now
    WHERE s.status = 'pending' AND s.action = 'open' AND s.created_at < v_now - make_interval(secs => v_max_age)
    RETURNING s.copy_id)
  , y AS (
    UPDATE copy_trades ct SET status = 'cancelled', cancel_reason = 'expired', closed_at = v_now
    WHERE ct.status = 'pending_open' AND ct.copy_id IN (SELECT copy_id FROM x) RETURNING 1)
  SELECT count(*) INTO n_expired FROM y;

  -- Candidate opens (fresh master positions, master online, follower active)
  CREATE TEMP TABLE IF NOT EXISTS _cand (
    copy_id text PRIMARY KEY, master_account text, master_ticket bigint, follower_account text,
    symbol text, order_type text, lots double precision, open_price double precision,
    sl double precision, tp double precision, magic integer) ON COMMIT DROP;
  TRUNCATE _cand;
  INSERT INTO _cand
  SELECT q.copy_id, q.account_name, q.ticket, q.follower_account, q.symbol, q.otype,
         round(greatest(coalesce(q.min_lot, 0.01), least(coalesce(q.max_lot, 10), q.raw_lot))::numeric, 2)::double precision,
         q.open_price, coalesce(q.sl, 0), coalesce(q.tp, 0), coalesce(q.magic, 0)
  FROM (
    SELECT lp.account_name || ':' || lp.ticket || ':' || cs.follower_account AS copy_id,
           lp.account_name, lp.ticket, cs.follower_account, lp.symbol, lp.open_price, lp.sl, lp.tp, lp.magic,
           cs.min_lot, cs.max_lot,
           CASE WHEN NOT coalesce(cs.reverse, false) THEN lp.order_type
                WHEN lp.order_type = 'BUY' THEN 'SELL' WHEN lp.order_type = 'SELL' THEN 'BUY'
                WHEN lp.order_type = 'BUY_LIMIT' THEN 'SELL_LIMIT' WHEN lp.order_type = 'SELL_LIMIT' THEN 'BUY_LIMIT'
                WHEN lp.order_type = 'BUY_STOP' THEN 'SELL_STOP' WHEN lp.order_type = 'SELL_STOP' THEN 'BUY_STOP'
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

  -- Retry failed opens (max 3 attempts within 2 minutes of first attempt)
  WITH r AS (
    UPDATE copy_trades ct SET status = 'pending_open', attempts = ct.attempts + 1, cancel_reason = NULL,
      closed_at = NULL, lots = c.lots, follower_ticket = NULL
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

  -- New opens: copy_trades row is the dedup lock; signal only for rows actually inserted
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

  IF n_open + n_close + n_cancel + n_expired + n_retry > 0 THEN
    INSERT INTO engine_log(message) VALUES (concat_ws(', ',
      CASE WHEN n_open > 0 THEN n_open || ' open signal(s)' END,
      CASE WHEN n_close > 0 THEN n_close || ' close signal(s)' END,
      CASE WHEN n_retry > 0 THEN n_retry || ' open retry(s)' END,
      CASE WHEN n_cancel > 0 THEN n_cancel || ' cancelled (master closed before follower opened)' END,
      CASE WHEN n_expired > 0 THEN n_expired || ' expired open(s) after ' || v_max_age || 's' END));
  END IF;

  UPDATE engine_state SET last_mode = v_mode, last_offline = v_offline, last_run = v_now WHERE id = 1;

  IF extract(second FROM utc) < 3 AND extract(minute FROM utc) = 0 THEN
    DELETE FROM engine_log WHERE created_at < v_now - interval '3 days';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION run_copy_engine() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION stamp_account_last_seen() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION stamp_position_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION guard_signal_update() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('copy-engine', '3 seconds', 'SELECT public.run_copy_engine()');
