/*
# Instant copy engine + one-call signal pickup

Cuts copy latency. Before: the engine only ran every 3 seconds, and followers needed
4 round trips (poll, claim, check copy, check master) before placing an order.

1. Instant engine runs (triggers)
- `live_positions` AFTER INSERT / AFTER DELETE (statement level, master rows only)
  -> runs `run_copy_engine()` right away (new master trade / master trade gone).
- `live_positions` AFTER UPDATE when a master row's SL/TP changed -> runs `sync_copy_stops()`.
- `trade_history` AFTER INSERT for master rows -> runs `run_copy_engine()` (master closed).
- Kicks wait for the same advisory lock the cron job uses, so runs never overlap,
  and any error is swallowed so an EA write can never fail because of the engine.
- The pg_cron jobs stay as a safety net; the engine job now runs every 1 second.

2. New function `ea_take_signals(p_follower text, p_limit int)`
- Atomically claims (pending -> processing) the follower's pending signals in one call
  (FOR UPDATE SKIP LOCKED, so two EA instances never get the same signal).
- For open signals it pre-checks server side: the copy must still be `pending_open`
  and the master position must still exist; otherwise the signal is cancelled
  (and the copy cancelled with reason `master_closed`) and not returned.
- Returns a JSON array ordered by creation time, including `follower_ticket`
  so modify/close need no extra lookup.

3. Security
- Trigger functions are SECURITY DEFINER (they call engine functions that anon cannot
  execute) and EXECUTE is revoked from PUBLIC/anon/authenticated.
- `ea_take_signals` is SECURITY INVOKER: it uses exactly the same privileges and RLS
  that EAs already have through `ea_claim_signal` / `ea_update_copy_trade`.
*/

CREATE OR REPLACE FUNCTION public.kick_copy_engine() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM changed_rows r JOIN accounts a ON a.account_name = r.account_name AND a.type = 'master') THEN
    BEGIN
      PERFORM pg_advisory_xact_lock(7340021);
      PERFORM run_copy_engine();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.kick_copy_stops() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    JOIN accounts a ON a.account_name = n.account_name AND a.type = 'master'
    WHERE n.sl IS DISTINCT FROM o.sl OR n.tp IS DISTINCT FROM o.tp
  ) THEN
    BEGIN
      PERFORM pg_advisory_xact_lock(7340022);
      PERFORM sync_copy_stops();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.kick_copy_engine() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kick_copy_stops() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kick_engine_on_position_insert ON live_positions;
CREATE TRIGGER trg_kick_engine_on_position_insert AFTER INSERT ON live_positions
  REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION kick_copy_engine();

DROP TRIGGER IF EXISTS trg_kick_engine_on_position_delete ON live_positions;
CREATE TRIGGER trg_kick_engine_on_position_delete AFTER DELETE ON live_positions
  REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION kick_copy_engine();

DROP TRIGGER IF EXISTS trg_kick_stops_on_position_update ON live_positions;
CREATE TRIGGER trg_kick_stops_on_position_update AFTER UPDATE ON live_positions
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION kick_copy_stops();

DROP TRIGGER IF EXISTS trg_kick_engine_on_history_insert ON trade_history;
CREATE TRIGGER trg_kick_engine_on_history_insert AFTER INSERT ON trade_history
  REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION kick_copy_engine();

CREATE OR REPLACE FUNCTION public.ea_take_signals(p_follower text, p_limit int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r record;
  v_out jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    WITH c AS (
      SELECT s.id FROM copy_signals s
      WHERE s.follower_account = p_follower AND s.status = 'pending'
      ORDER BY s.created_at
      LIMIT least(greatest(coalesce(p_limit, 10), 1), 20)
      FOR UPDATE SKIP LOCKED
    ), u AS (
      UPDATE copy_signals s SET status = 'processing', processed_at = now()
      FROM c WHERE s.id = c.id
      RETURNING s.*
    )
    SELECT u.*, ct.status AS ct_status, ct.follower_ticket
    FROM u LEFT JOIN copy_trades ct ON ct.copy_id = u.copy_id
    ORDER BY u.created_at
  LOOP
    IF r.action = 'open' THEN
      IF r.ct_status IS DISTINCT FROM 'pending_open' THEN
        UPDATE copy_signals SET status = 'cancelled', processed_at = now() WHERE id = r.id;
        CONTINUE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM live_positions lp WHERE lp.account_name = r.master_account AND lp.ticket = r.master_ticket) THEN
        UPDATE copy_signals SET status = 'cancelled', processed_at = now() WHERE id = r.id;
        PERFORM ea_update_copy_trade(r.copy_id, 'cancelled', NULL, 'master_closed', NULL);
        CONTINUE;
      END IF;
    END IF;

    v_out := v_out || jsonb_build_object(
      'id', r.id, 'action', coalesce(r.action, 'open'), 'copy_id', r.copy_id,
      'master_account', r.master_account, 'master_ticket', r.master_ticket,
      'symbol', r.symbol, 'order_type', r.order_type, 'lots', r.lots,
      'open_price', r.open_price, 'sl', r.sl, 'tp', r.tp, 'magic', r.magic,
      'follower_ticket', r.follower_ticket);
  END LOOP;
  RETURN v_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.ea_take_signals(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ea_take_signals(text, int) TO anon, authenticated;

SELECT cron.alter_job(jobid, schedule => '1 second') FROM cron.job WHERE jobname = 'copy-engine';
