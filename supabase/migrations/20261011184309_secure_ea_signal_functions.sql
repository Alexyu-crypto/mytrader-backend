-- The EA signal functions ran as SECURITY INVOKER, which forced copy_signals and
-- copy_trades to carry USING (true) policies for anon. Move the work inside
-- SECURITY DEFINER functions with their own validation, then close the tables.

CREATE OR REPLACE FUNCTION public.ea_claim_signal(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE copy_signals SET status = 'processing', processed_at = now()
  WHERE id = p_id AND status = 'pending';
  RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_set_signal_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_status NOT IN ('pending', 'processing', 'executed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid signal status';
  END IF;
  UPDATE copy_signals
  SET status = p_status, processed_at = now()
  WHERE id = p_id AND status IN ('pending', 'processing');
END $function$;

CREATE OR REPLACE FUNCTION public.ea_update_copy_trade(
  p_copy_id text,
  p_status text,
  p_follower_ticket bigint DEFAULT NULL::bigint,
  p_cancel_reason text DEFAULT NULL::text,
  p_lots double precision DEFAULT NULL::double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.ea_take_signals(p_follower text, p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      'follower_ticket', coalesce(r.close_ticket, r.follower_ticket));
  END LOOP;
  RETURN v_out;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_wait_signals(p_follower text, p_limit integer DEFAULT 10, p_wait_ms integer DEFAULT 1500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deadline timestamptz := clock_timestamp()
    + make_interval(secs => least(greatest(coalesce(p_wait_ms, 0), 0), 2000) / 1000.0);
  v_is_follower boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_follower AND type = 'follower')
  INTO v_is_follower;

  LOOP
    IF EXISTS (SELECT 1 FROM copy_signals WHERE follower_account = p_follower AND status = 'pending') THEN
      RETURN ea_take_signals(p_follower, p_limit);
    END IF;
    EXIT WHEN NOT v_is_follower OR clock_timestamp() >= v_deadline;
    PERFORM pg_sleep(0.025);
  END LOOP;
  RETURN '[]'::jsonb;
END $function$;

REVOKE ALL ON FUNCTION public.ea_claim_signal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ea_set_signal_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ea_update_copy_trade(text, text, bigint, text, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ea_take_signals(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ea_wait_signals(text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ea_claim_signal(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ea_set_signal_status(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ea_update_copy_trade(text, text, bigint, text, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ea_take_signals(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ea_wait_signals(text, integer, integer) TO anon, authenticated, service_role;

-- Now that the EA no longer touches these tables directly, close them.
DROP POLICY IF EXISTS anon_select_copy_signals ON public.copy_signals;
DROP POLICY IF EXISTS anon_update_copy_signals ON public.copy_signals;
DROP POLICY IF EXISTS anon_select_copy_trades ON public.copy_trades;
DROP POLICY IF EXISTS anon_update_copy_trades ON public.copy_trades;

CREATE POLICY operator_select_copy_signals ON public.copy_signals
  FOR SELECT TO authenticated
  USING (can_view_all());

CREATE POLICY operator_select_copy_trades ON public.copy_trades
  FOR SELECT TO authenticated
  USING (can_view_all());
