/*
# Trader Manager: cancel unsent orders and close by symbol

1. Modified tables
- `desk_orders.status` now also allows `cancelled`. The page uses this when an order has not gone through
  within the trader's time limit (1.5 seconds) and the terminal has not picked it up yet.

2. New functions (trader/admin only via `can_operate()`)
- `desk_cancel_order(p_id uuid)` cancels a desk order only while it is still waiting (`pending`).
  Returns the order's status after the attempt: `cancelled` if stopped, otherwise the current status
  (e.g. `processing` means the terminal is already executing and it can no longer be stopped).
- `desk_close_symbol(p_account text, p_symbol text, p_side text)` queues market closes for every open
  position on a master account for one symbol. `p_side` is `ALL`, `BUY` or `SELL`. Returns how many were queued.

3. Security
- Both functions are SECURITY DEFINER with a fixed search_path, revoked from public/anon, granted to authenticated,
  and reject anyone who is not admin/trader.
- desk_close_symbol only acts on master accounts.

4. Notes
- Closes already waiting are skipped, so pressing twice is safe. Followers close automatically through normal copying.
*/

ALTER TABLE desk_orders DROP CONSTRAINT IF EXISTS desk_orders_status_check;
ALTER TABLE desk_orders ADD CONSTRAINT desk_orders_status_check
  CHECK (status IN ('pending','processing','filled','failed','expired','cancelled'));

CREATE OR REPLACE FUNCTION public.desk_cancel_order(p_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE desk_orders SET status = 'cancelled', processed_at = now(), error = 'Cancelled: not executed within time limit'
  WHERE id = p_id AND status = 'pending'
  RETURNING status INTO v_status;
  IF v_status IS NULL THEN
    SELECT status INTO v_status FROM desk_orders WHERE id = p_id;
  END IF;
  RETURN coalesce(v_status, 'not_found');
END $$;

CREATE OR REPLACE FUNCTION public.desk_close_symbol(p_account text, p_symbol text, p_side text DEFAULT 'ALL')
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_rows int;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN
    RAISE EXCEPTION 'master account not found';
  END IF;
  IF p_side NOT IN ('ALL','BUY','SELL') THEN RAISE EXCEPTION 'invalid side'; END IF;

  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots, status, action, copy_id, close_ticket)
  SELECT p_account, '', 0, lp.symbol, lp.order_type, lp.lots, 'pending', 'close', 'manual:' || p_account || ':' || lp.ticket, lp.ticket
  FROM live_positions lp
  WHERE lp.account_name = p_account AND lp.symbol = p_symbol
    AND (p_side = 'ALL' OR lp.order_type = p_side)
    AND NOT EXISTS (
      SELECT 1 FROM copy_signals s
      WHERE s.copy_id = 'manual:' || p_account || ':' || lp.ticket AND s.action = 'close' AND s.status IN ('pending','processing'))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $$;

REVOKE ALL ON FUNCTION public.desk_cancel_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desk_close_symbol(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desk_cancel_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desk_close_symbol(text, text, text) TO authenticated;
