/*
# Cloud (MetaApi) follower signal claiming + scheduler key

1. New functions
- `metaapi_take_signals(p_follower, p_limit)`: same claim semantics as `ea_take_signals`
  (pending -> processing, auto-cancel opens whose copy trade is no longer pending or whose
  master position is gone) but for cloud accounts, which have no EA bridge token.
- `metaapi_cron_key()`: returns the shared key the scheduler sends to the metaapi function.

2. Secrets
- Creates vault secret `metaapi_cron_key` (random) if missing.

3. Security
- Both functions are SECURITY DEFINER and executable ONLY by `service_role`
  (revoked from public, anon, authenticated).
*/

CREATE OR REPLACE FUNCTION public.metaapi_take_signals(p_follower text, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_out jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    WITH c AS (
      SELECT s.id FROM copy_signals s
      WHERE s.follower_account = p_follower AND s.status = 'pending'
      ORDER BY s.created_at
      LIMIT least(greatest(coalesce(p_limit, 20), 1), 20)
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
        UPDATE copy_trades SET status = 'cancelled', cancel_reason = coalesce(cancel_reason, 'master_closed'), closed_at = now()
        WHERE copy_id = r.copy_id;
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
END $$;

REVOKE ALL ON FUNCTION public.metaapi_take_signals(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metaapi_take_signals(text, integer) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'metaapi_cron_key') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'metaapi_cron_key');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.metaapi_cron_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'metaapi_cron_key' LIMIT 1 $$;

REVOKE ALL ON FUNCTION public.metaapi_cron_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metaapi_cron_key() TO service_role;
