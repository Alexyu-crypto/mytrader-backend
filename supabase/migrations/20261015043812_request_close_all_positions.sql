/*
# Close all open orders on one account

1. New function
- `request_close_all(p_account text)` queues a market close order for every open
  position on the given account (master or follower). Returns the number queued.
2. Security
- SECURITY DEFINER with fixed search_path; only staff who pass `can_operate()` may call it.
- EXECUTE revoked from public/anon, granted to authenticated only.
3. Notes
- Orders already waiting to close are skipped, so pressing twice is safe.
- Closing a master's orders also closes the followers' copied trades (normal copy behaviour).
*/

CREATE OR REPLACE FUNCTION public.request_close_all(p_account text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows int;
BEGIN
  IF NOT can_operate() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account) THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  UPDATE copy_trades ct SET status = 'pending_close'
  FROM live_positions lp
  WHERE lp.account_name = p_account AND ct.follower_account = p_account
    AND ct.follower_ticket = lp.ticket AND ct.status = 'open';

  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots,
    status, action, copy_id, close_ticket)
  SELECT p_account, coalesce(ct.master_account, ''), coalesce(ct.master_ticket, 0), lp.symbol, lp.order_type, lp.lots,
    'pending', 'close', coalesce(ct.copy_id, 'manual:' || p_account || ':' || lp.ticket), lp.ticket
  FROM live_positions lp
  LEFT JOIN LATERAL (
    SELECT * FROM copy_trades c
    WHERE c.follower_account = p_account AND c.follower_ticket = lp.ticket AND c.status IN ('open', 'pending_close')
    ORDER BY c.created_at DESC LIMIT 1
  ) ct ON true
  WHERE lp.account_name = p_account
    AND NOT EXISTS (
      SELECT 1 FROM copy_signals s
      WHERE s.copy_id = coalesce(ct.copy_id, 'manual:' || p_account || ':' || lp.ticket)
        AND s.action = 'close' AND s.status IN ('pending', 'processing'))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    INSERT INTO engine_log(message) VALUES (format('Manual close-all requested: %s (%s orders)', p_account, v_rows));
  END IF;
  RETURN v_rows;
END $$;

REVOKE ALL ON FUNCTION public.request_close_all(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_close_all(text) TO authenticated;