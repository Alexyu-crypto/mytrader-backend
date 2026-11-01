/*
# Retry failed SL/TP updates on follower trades

1. Problem
- When a follower terminal rejected an SL/TP update (for example the broker refused a
  take-profit too close to its current price), the signal was marked failed and never
  sent again. The follower trade stayed without the master's stop loss.

2. Changed Function
- `sync_copy_stops()` keeps its existing behaviour and adds a retry step:
  - For an open copy trade whose most recent `modify` signal failed at least 10 seconds
    ago, and that has no update in flight, a new `modify` signal is sent with the
    master's current SL/TP.
  - At most 30 failed attempts per copy trade in any 10-minute window, so a level the
    broker will never accept does not cause endless traffic.

3. Security
- No table or policy changes. Execute stays revoked from PUBLIC, anon, authenticated.
*/

CREATE OR REPLACE FUNCTION public.sync_copy_stops() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF NOT pg_try_advisory_xact_lock(7340022) THEN RETURN; END IF;

  UPDATE copy_signals SET status = 'failed', processed_at = v_now
   WHERE action = 'modify' AND status = 'processing' AND processed_at < v_now - interval '30 seconds';
  UPDATE copy_signals SET status = 'cancelled', processed_at = v_now
   WHERE action = 'modify' AND status = 'pending' AND created_at < v_now - interval '60 seconds';

  WITH desired AS (
    SELECT ct.copy_id,
           CASE WHEN NOT coalesce(cs.copy_sl, true) THEN 0
                WHEN coalesce(cs.reverse, false) THEN coalesce(lp.tp, 0) ELSE coalesce(lp.sl, 0) END AS fsl,
           CASE WHEN NOT coalesce(cs.copy_tp, true) THEN 0
                WHEN coalesce(cs.reverse, false) THEN coalesce(lp.sl, 0) ELSE coalesce(lp.tp, 0) END AS ftp
      FROM copy_trades ct
      JOIN live_positions lp ON lp.account_name = ct.master_account AND lp.ticket = ct.master_ticket
      LEFT JOIN copy_settings cs ON cs.master_account = ct.master_account AND cs.follower_account = ct.follower_account
     WHERE ct.status = 'open'
  ), last_modify AS (
    SELECT DISTINCT ON (s.copy_id) s.copy_id, s.status, coalesce(s.processed_at, s.created_at) AS at
      FROM copy_signals s
      JOIN desired d ON d.copy_id = s.copy_id
     WHERE s.action = 'modify'
     ORDER BY s.copy_id, s.created_at DESC
  ), changed AS (
    UPDATE copy_trades ct SET sl = d.fsl, tp = d.ftp
      FROM desired d
      LEFT JOIN last_modify lm ON lm.copy_id = d.copy_id
     WHERE ct.copy_id = d.copy_id
       AND NOT EXISTS (SELECT 1 FROM copy_signals s
                        WHERE s.copy_id = ct.copy_id AND s.action = 'modify' AND s.status IN ('pending', 'processing'))
       AND (
             abs(coalesce(ct.sl, 0) - d.fsl) > 1e-9 OR abs(coalesce(ct.tp, 0) - d.ftp) > 1e-9
          OR (lm.status = 'failed'
              AND lm.at < v_now - interval '10 seconds'
              AND (SELECT count(*) FROM copy_signals s
                    WHERE s.copy_id = ct.copy_id AND s.action = 'modify' AND s.status = 'failed'
                      AND s.created_at > v_now - interval '10 minutes') < 30)
           )
    RETURNING ct.*
  )
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, open_price, sl, tp, magic, status, action, copy_id)
  SELECT c.follower_account, c.master_account, c.master_ticket, c.symbol, c.order_type, c.lots, c.open_price,
         c.sl, c.tp, coalesce(c.magic, 0), 'pending', 'modify', c.copy_id
    FROM changed c;
END $$;

REVOKE EXECUTE ON FUNCTION public.sync_copy_stops() FROM PUBLIC, anon, authenticated;