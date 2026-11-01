/*
# User management: members, roles, approval, last-admin protection

1. New Tables
- `app_members`: one row per signed-up user
  - `user_id` (uuid, PK, references auth.users, cascade delete)
  - `email` (text)
  - `role` (text: 'admin' full admin, 'trader' can edit settings and close trades, 'viewer' read-only)
  - `status` (text: 'pending' waiting for approval, 'active')
  - `approved_by` (uuid, nullable), `created_at`, `updated_at`

2. Data
- Every existing user is copied in. Users listed in `app_admins` become active admins; everyone else is pending.
- New sign-ups are added automatically: the very first user ever becomes an active admin, later ones are pending viewers.
- `app_admins` is no longer used by the app (left in place, no data removed).

3. Security
- RLS on `app_members`: users can read their own row; active admins can read all rows. No direct writes from the browser.
- `guard_last_admin` trigger blocks any update/delete (including deleting the auth user) that would leave zero active admins.
- `is_admin()` now reads `app_members`; new `can_operate()` = active admin or trader.
- Writes on `accounts`, `copy_settings`, `app_settings` and `request_follower_close` now require `can_operate()`.
- `admin_update_member(user, role, status)`: SECURITY DEFINER, admins only.
*/

CREATE TABLE IF NOT EXISTS app_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'trader', 'viewer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_app_members_role_status ON app_members(role, status);

INSERT INTO app_members (user_id, email, role, status, created_at)
SELECT u.id, coalesce(u.email, ''),
       CASE WHEN a.user_id IS NOT NULL THEN 'admin' ELSE 'viewer' END,
       CASE WHEN a.user_id IS NOT NULL THEN 'active' ELSE 'pending' END,
       u.created_at
FROM auth.users u LEFT JOIN app_admins a ON a.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM app_members WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active') $$;

CREATE OR REPLACE FUNCTION public.can_operate()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM app_members WHERE user_id = auth.uid() AND role IN ('admin', 'trader') AND status = 'active') $$;
REVOKE ALL ON FUNCTION public.can_operate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_operate() TO authenticated;

DROP POLICY IF EXISTS "members_read_self_or_admin" ON app_members;
CREATE POLICY "members_read_self_or_admin" ON app_members FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

CREATE OR REPLACE FUNCTION public.handle_new_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7340031);
  IF NOT EXISTS (SELECT 1 FROM app_members) THEN
    INSERT INTO app_members (user_id, email, role, status) VALUES (NEW.id, coalesce(NEW.email, ''), 'admin', 'active')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO app_members (user_id, email) VALUES (NEW.id, coalesce(NEW.email, ''))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_member() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_claim_admin ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_member ON auth.users;
CREATE TRIGGER on_auth_user_created_member
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_member();

CREATE OR REPLACE FUNCTION public.guard_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.status = 'active'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.status <> 'active') THEN
    PERFORM pg_advisory_xact_lock(7340032);
    IF NOT EXISTS (SELECT 1 FROM app_members
                   WHERE user_id <> OLD.user_id AND role = 'admin' AND status = 'active') THEN
      RAISE EXCEPTION 'last_admin' USING HINT = 'At least one full admin must remain';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS app_members_guard_last_admin ON app_members;
CREATE TRIGGER app_members_guard_last_admin
  BEFORE UPDATE OR DELETE ON app_members FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();

CREATE OR REPLACE FUNCTION public.admin_update_member(p_user uuid, p_role text, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('admin', 'trader', 'viewer') OR p_status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'invalid role or status';
  END IF;
  UPDATE app_members
  SET role = p_role, status = p_status,
      approved_by = CASE WHEN status = 'pending' AND p_status = 'active' THEN auth.uid() ELSE approved_by END
  WHERE user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_member(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_member(uuid, text, text) TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'copy_settings', 'app_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin_insert_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_update_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_delete_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "operator_insert_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "operator_update_%1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "operator_delete_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "operator_insert_%1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (can_operate())', t);
    EXECUTE format('CREATE POLICY "operator_update_%1$s" ON %1$I FOR UPDATE TO authenticated USING (can_operate()) WITH CHECK (can_operate())', t);
    EXECUTE format('CREATE POLICY "operator_delete_%1$s" ON %1$I FOR DELETE TO authenticated USING (can_operate())', t);
  END LOOP;
END $$;

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
  IF NOT can_operate() THEN
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
