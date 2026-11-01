/*
# Admin sign-in protection + manual close for follower accounts

1. New Tables
- `app_admins`: users allowed to manage the dashboard
  - `user_id` (uuid, primary key, references auth.users)
  - `created_at` (timestamptz)
  The very first user who signs up becomes the admin automatically. Later sign-ups get no access
  until an existing admin adds them here.

2. Modified Tables
- `copy_signals`: new nullable column `close_ticket` (bigint). This is the follower ticket that a manual
  close request targets, so the EA knows exactly which position to close.

3. Security changes
- `accounts`, `copy_settings`, `app_settings`: insert/update/delete now require a signed-in admin.
  The anon role keeps read access (public report pages and EAs still work) but loses write grants.
- `ea_heartbeat` now runs as SECURITY DEFINER so EAs can still refresh balance/equity/last_seen without
  the anon role having UPDATE on `accounts`. It only touches the row matching the given account name.
- `is_admin()`: helper used by policies.
- `request_follower_close(account, ticket)`: SECURITY DEFINER, callable by signed-in users only,
  checks admin + follower account + live position before queueing a close signal.

4. Notes
  1. Master accounts cannot be closed through this function.
  2. If the follower position is a copied trade, its copy record moves to `pending_close`, so the copy engine
     keeps retrying the close and never copies the same master trade again.
  3. `ea_take_signals` now returns `close_ticket` (when set) as `follower_ticket`; no EA update is needed.
*/

CREATE TABLE IF NOT EXISTS app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_self" ON app_admins;
CREATE POLICY "admins_read_self" ON app_admins FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid()) $$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7340031);
  IF NOT EXISTS (SELECT 1 FROM app_admins) THEN
    INSERT INTO app_admins(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_claim_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_claim_admin
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.claim_first_admin();

INSERT INTO app_admins(user_id)
SELECT id FROM auth.users ORDER BY created_at LIMIT 1
ON CONFLICT DO NOTHING;

-- Heartbeat must keep working after anon loses UPDATE on accounts
CREATE OR REPLACE FUNCTION public.ea_heartbeat(p_account_name text, p_balance double precision, p_equity double precision)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
UPDATE accounts
SET balance = p_balance, equity = p_equity, is_active = true, last_seen = now()
WHERE account_name = p_account_name;
RETURN FOUND;
END $function$;
REVOKE ALL ON FUNCTION public.ea_heartbeat(text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ea_heartbeat(text, double precision, double precision) TO anon, authenticated;

-- Admin-only writes on configuration tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'copy_settings', 'app_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_insert_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_update_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_delete_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "admin_insert_%1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (is_admin())', t);
    EXECUTE format('CREATE POLICY "admin_update_%1$s" ON %1$I FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin())', t);
    EXECUTE format('CREATE POLICY "admin_delete_%1$s" ON %1$I FOR DELETE TO authenticated USING (is_admin())', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM anon', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'copy_signals' AND column_name = 'close_ticket') THEN
    ALTER TABLE copy_signals ADD COLUMN close_ticket bigint;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ea_take_signals(p_follower text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION public.request_follower_close(p_account text, p_ticket bigint)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pos record;
  v_ct record;
  v_copy_id text;
  v_rows int;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'follower') THEN
    RAISE EXCEPTION 'only follower accounts can be closed here';
  END IF;
  SELECT * INTO v_pos FROM live_positions WHERE account_name = p_account AND ticket = p_ticket;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'position not found';
  END IF;

  SELECT * INTO v_ct FROM copy_trades
  WHERE follower_account = p_account AND follower_ticket = p_ticket AND status IN ('open', 'pending_close')
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    v_copy_id := v_ct.copy_id;
    UPDATE copy_trades SET status = 'pending_close' WHERE copy_id = v_copy_id AND status = 'open';
  ELSE
    v_copy_id := 'manual:' || p_account || ':' || p_ticket;
  END IF;

  IF EXISTS (SELECT 1 FROM copy_signals WHERE copy_id = v_copy_id AND action = 'close' AND status IN ('pending', 'processing')) THEN
    RETURN 'already_queued';
  END IF;

  INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots,
                            status, action, copy_id, close_ticket)
  VALUES (p_account, coalesce(v_ct.master_account, ''), coalesce(v_ct.master_ticket, 0), v_pos.symbol,
          v_pos.order_type, v_pos.lots, 'pending', 'close', v_copy_id, p_ticket)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN 'already_queued';
  END IF;

  INSERT INTO engine_log(message) VALUES (format('Manual close requested: %s #%s %s', p_account, p_ticket, v_pos.symbol));
  RETURN 'queued';
END $$;
REVOKE ALL ON FUNCTION public.request_follower_close(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_follower_close(text, bigint) TO authenticated;
