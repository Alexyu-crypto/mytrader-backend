/*
# Sync SL/TP changes from master to followers

1. Problem
- Stop loss / take profit were copied only at the moment a trade opened. If the master
  added or moved SL/TP afterwards, followers never got the change.

2. New Function
- `sync_copy_stops()` (SECURITY DEFINER, not callable by anon/authenticated)
  - For every open copy trade, computes the follower SL/TP from the master's current
    position, honouring the copy_sl / copy_tp switches and reverse mode (reverse swaps SL and TP).
  - When they differ from what the follower last received, inserts a `modify` copy signal
    and records the new values on the copy trade, so each change is sent exactly once.
  - Only one modify signal per copy trade is in flight at a time; a newer change is
    sent after the current one finishes.
  - Housekeeping: modify signals stuck in processing > 30s become failed; pending
    modify signals older than 60s are cancelled.

3. Schedule
- pg_cron job `copy-stop-sync` runs every 3 seconds (same cadence as the copy engine).

4. Security
- No table or policy changes. Execute revoked from PUBLIC, anon, authenticated.
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
  ), changed AS (
    UPDATE copy_trades ct SET sl = d.fsl, tp = d.ftp
      FROM desired d
     WHERE ct.copy_id = d.copy_id
       AND (abs(coalesce(ct.sl, 0) - d.fsl) > 1e-9 OR abs(coalesce(ct.tp, 0) - d.ftp) > 1e-9)
       AND NOT EXISTS (SELECT 1 FROM copy_signals s
                        WHERE s.copy_id = ct.copy_id AND s.action = 'modify' AND s.status IN ('pending', 'processing'))
    RETURNING ct.*
  )
  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, open_price, sl, tp, magic, status, action, copy_id)
  SELECT c.follower_account, c.master_account, c.master_ticket, c.symbol, c.order_type, c.lots, c.open_price,
         c.sl, c.tp, coalesce(c.magic, 0), 'pending', 'modify', c.copy_id
    FROM changed c;
END $$;

REVOKE EXECUTE ON FUNCTION public.sync_copy_stops() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('copy-stop-sync', '3 seconds', 'SELECT public.sync_copy_stops()');
