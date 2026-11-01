/*
# Add lots to ea_update_copy_trade

The EA reports the actual filled lot size when a copy opens. Replaces the 4-argument
version (created minutes earlier, never used by any client) with one that also accepts
`p_lots`. Same SECURITY INVOKER semantics; no privilege changes.
*/

DROP FUNCTION IF EXISTS public.ea_update_copy_trade(text, text, bigint, text);

CREATE OR REPLACE FUNCTION public.ea_update_copy_trade(
  p_copy_id text, p_status text, p_follower_ticket bigint DEFAULT NULL,
  p_cancel_reason text DEFAULT NULL, p_lots double precision DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('open', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid copy trade status';
  END IF;
  UPDATE copy_trades
     SET status          = p_status,
         follower_ticket = COALESCE(p_follower_ticket, follower_ticket),
         cancel_reason   = COALESCE(p_cancel_reason, cancel_reason),
         lots            = COALESCE(p_lots, lots),
         opened_at       = CASE WHEN p_status = 'open' THEN now() ELSE opened_at END,
         closed_at       = CASE WHEN p_status IN ('closed', 'cancelled') THEN now() ELSE closed_at END
   WHERE copy_id = p_copy_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ea_update_copy_trade(text, text, bigint, text, double precision) TO anon, authenticated;
