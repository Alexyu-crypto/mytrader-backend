/*
# EA write functions callable via POST (MT4 compatibility)

MT4's WebRequest() does not support the HTTP PATCH method (fails with error 4029),
so the MT4 EA could not send heartbeats, claim signals, or report copy results.
These functions let the EA perform the same updates through POST /rest/v1/rpc/<name>.

1. New Functions (all SECURITY INVOKER: they run as the caller, so existing RLS policies
   and the copy_signals guard trigger still apply exactly as they did for PATCH)
- `ea_heartbeat(p_account_name, p_balance, p_equity)` -> boolean
  Updates balance/equity, marks active, stamps last_seen (server clock). Returns false if no
  account has that name.
- `ea_claim_signal(p_id)` -> boolean
  Atomically moves a signal pending -> processing. Returns true only for the winner.
- `ea_set_signal_status(p_id, p_status)` -> void
- `ea_update_copy_trade(p_copy_id, p_status, p_follower_ticket, p_cancel_reason)` -> void
  opened_at / closed_at are stamped with the server clock.

2. Security
- No new privileges: these do nothing the anon role could not already do via PATCH.
- copy_trades status restricted to open / closed / cancelled.
*/

CREATE OR REPLACE FUNCTION public.ea_heartbeat(p_account_name text, p_balance double precision, p_equity double precision)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE accounts
     SET balance = p_balance, equity = p_equity, is_active = true, last_seen = now()
   WHERE account_name = p_account_name;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.ea_claim_signal(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE copy_signals SET status = 'processing', processed_at = now()
   WHERE id = p_id AND status = 'pending';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.ea_set_signal_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE copy_signals SET status = p_status, processed_at = now() WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.ea_update_copy_trade(
  p_copy_id text, p_status text, p_follower_ticket bigint DEFAULT NULL, p_cancel_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('open', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid copy trade status';
  END IF;
  UPDATE copy_trades
     SET status          = p_status,
         follower_ticket = COALESCE(p_follower_ticket, follower_ticket),
         cancel_reason   = COALESCE(p_cancel_reason, cancel_reason),
         opened_at       = CASE WHEN p_status = 'open' THEN now() ELSE opened_at END,
         closed_at       = CASE WHEN p_status IN ('closed', 'cancelled') THEN now() ELSE closed_at END
   WHERE copy_id = p_copy_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ea_heartbeat(text, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ea_claim_signal(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ea_set_signal_status(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ea_update_copy_trade(text, text, bigint, text) TO anon, authenticated;
