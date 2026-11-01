/*
# Account Opening role (開戶部) and IB rebate reconciliation (回傭到帳核對)

1. Roles
  - `app_members.role` may now also be 'account_opening'.
  - `admin_update_member()` accepts 'account_opening'.
  - `can_open_accounts()`: active admin, ib_manager or account_opening.
  - `can_reconcile_rebates()`: active admin, ib_manager or finance.

2. New Tables
  - `ib_referrals`: client trading accounts opened through our IB links.
    - broker_id (fk ib_brokers, cascade), link_id (fk ib_links, set null)
    - client_name, client_contact, account_number, account_type
    - status: applied | opened | funded | rejected; opened_on (date); notes
    - created_by / created_email (from session), created_at, updated_at
    - unique account number per broker (when filled in)
  - `ib_rebate_statements`: one row per broker rebate payout period.
    - broker_id, period_start, period_end, currency
    - lots (from broker statement), rate_per_lot, expected_amount
    - received_amount (null until money arrives), received_on, reference, notes
    - created_by / created_email (from session), created_at, updated_at

3. New Functions (SECURITY DEFINER, authenticated only, caller checked inside)
  - `ib_opening_brokers()`: approved brokers with id, name, region, regulation, website, IB code and
    active referral links. Lets the opening team work without access to portal logins, rebate terms or
    manager contacts.
  - `ib_tracked_lots(p_broker, p_start, p_end)`: total closed lots in our own trade history for the
    broker's referral account numbers in the period, as a cross-check against the broker statement.

4. Security
  - RLS on both tables, anon revoked.
  - ib_referrals: read/insert/update can_open_accounts(); delete can_manage_ib(). Authors stamped from session.
  - ib_rebate_statements: read/insert/update can_reconcile_rebates(); delete admin only. Authors stamped.
*/

ALTER TABLE app_members DROP CONSTRAINT IF EXISTS app_members_role_check;
ALTER TABLE app_members ADD CONSTRAINT app_members_role_check CHECK (role IN ('admin', 'trader', 'client', 'agent', 'finance', 'ib_manager', 'account_opening'));

CREATE OR REPLACE FUNCTION public.admin_update_member(p_user uuid, p_role text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('admin', 'trader', 'client', 'agent', 'finance', 'ib_manager', 'account_opening') OR p_status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'invalid role or status';
  END IF;
  IF p_role = 'agent' AND NOT EXISTS (SELECT 1 FROM agents WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'not_an_agent';
  END IF;
  UPDATE app_members
  SET role = p_role, status = p_status,
      agent_id = CASE WHEN p_role = 'agent' THEN NULL ELSE agent_id END,
      approved_by = CASE WHEN status = 'pending' AND p_status = 'active' THEN auth.uid() ELSE approved_by END
  WHERE user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_open_accounts()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM app_members WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'ib_manager', 'account_opening')) $$;
REVOKE ALL ON FUNCTION public.can_open_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_open_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_reconcile_rebates()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM app_members WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'ib_manager', 'finance')) $$;
REVOKE ALL ON FUNCTION public.can_reconcile_rebates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_reconcile_rebates() TO authenticated;

CREATE TABLE IF NOT EXISTS ib_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES ib_brokers(id) ON DELETE CASCADE,
  link_id uuid REFERENCES ib_links(id) ON DELETE SET NULL,
  client_name text NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 120),
  client_contact text NOT NULL DEFAULT '' CHECK (char_length(client_contact) <= 200),
  account_number text NOT NULL DEFAULT '' CHECK (char_length(account_number) <= 40),
  account_type text NOT NULL DEFAULT '' CHECK (char_length(account_type) <= 60),
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'opened', 'funded', 'rejected')),
  opened_on date,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_by uuid DEFAULT auth.uid(),
  created_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ib_referrals_broker_idx ON ib_referrals (broker_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ib_referrals_account_key ON ib_referrals (broker_id, lower(account_number)) WHERE account_number <> '';

CREATE TABLE IF NOT EXISTS ib_rebate_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES ib_brokers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) BETWEEN 1 AND 10),
  lots numeric CHECK (lots IS NULL OR lots >= 0),
  rate_per_lot numeric CHECK (rate_per_lot IS NULL OR rate_per_lot >= 0),
  expected_amount numeric NOT NULL CHECK (expected_amount >= 0),
  received_amount numeric CHECK (received_amount IS NULL OR received_amount >= 0),
  received_on date,
  reference text NOT NULL DEFAULT '' CHECK (char_length(reference) <= 120),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_by uuid DEFAULT auth.uid(),
  created_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS ib_rebate_statements_broker_idx ON ib_rebate_statements (broker_id, period_end DESC);

ALTER TABLE ib_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ib_rebate_statements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ib_referrals, ib_rebate_statements FROM anon;

DROP POLICY IF EXISTS "select_ib_referrals" ON ib_referrals;
CREATE POLICY "select_ib_referrals" ON ib_referrals FOR SELECT TO authenticated USING (can_open_accounts());
DROP POLICY IF EXISTS "insert_ib_referrals" ON ib_referrals;
CREATE POLICY "insert_ib_referrals" ON ib_referrals FOR INSERT TO authenticated
  WITH CHECK (can_open_accounts() AND EXISTS (SELECT 1 FROM ib_brokers b WHERE b.id = broker_id AND b.stage = 'approved'));
DROP POLICY IF EXISTS "update_ib_referrals" ON ib_referrals;
CREATE POLICY "update_ib_referrals" ON ib_referrals FOR UPDATE TO authenticated USING (can_open_accounts()) WITH CHECK (can_open_accounts());
DROP POLICY IF EXISTS "delete_ib_referrals" ON ib_referrals;
CREATE POLICY "delete_ib_referrals" ON ib_referrals FOR DELETE TO authenticated USING (can_manage_ib());

DROP POLICY IF EXISTS "select_ib_rebates" ON ib_rebate_statements;
CREATE POLICY "select_ib_rebates" ON ib_rebate_statements FOR SELECT TO authenticated USING (can_reconcile_rebates());
DROP POLICY IF EXISTS "insert_ib_rebates" ON ib_rebate_statements;
CREATE POLICY "insert_ib_rebates" ON ib_rebate_statements FOR INSERT TO authenticated WITH CHECK (can_reconcile_rebates());
DROP POLICY IF EXISTS "update_ib_rebates" ON ib_rebate_statements;
CREATE POLICY "update_ib_rebates" ON ib_rebate_statements FOR UPDATE TO authenticated USING (can_reconcile_rebates()) WITH CHECK (can_reconcile_rebates());
DROP POLICY IF EXISTS "delete_ib_rebates" ON ib_rebate_statements;
CREATE POLICY "delete_ib_rebates" ON ib_rebate_statements FOR DELETE TO authenticated USING (is_admin());

-- Authors come from the session; created_* never change after insert.
CREATE OR REPLACE FUNCTION public.ib_stamp_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_email := coalesce(auth.jwt() ->> 'email', '');
    NEW.created_at := now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_email := OLD.created_email;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ib_stamp_author() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ib_referrals_stamp ON ib_referrals;
CREATE TRIGGER ib_referrals_stamp BEFORE INSERT OR UPDATE ON ib_referrals FOR EACH ROW EXECUTE FUNCTION ib_stamp_author();
DROP TRIGGER IF EXISTS ib_rebates_stamp ON ib_rebate_statements;
CREATE TRIGGER ib_rebates_stamp BEFORE INSERT OR UPDATE ON ib_rebate_statements FOR EACH ROW EXECUTE FUNCTION ib_stamp_author();

CREATE OR REPLACE FUNCTION public.ib_opening_brokers()
RETURNS TABLE (id uuid, broker_name text, region text, regulation text, website text, ib_code text, links jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT can_open_accounts() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
  SELECT b.id, b.broker_name, b.region, b.regulation, b.website, b.ib_code,
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label, 'url', l.url, 'account_type', l.account_type, 'region', l.region) ORDER BY l.created_at)
                   FROM ib_links l WHERE l.broker_id = b.id AND l.active), '[]'::jsonb)
  FROM ib_brokers b
  WHERE b.stage = 'approved'
  ORDER BY b.broker_name;
END $$;
REVOKE ALL ON FUNCTION public.ib_opening_brokers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ib_opening_brokers() TO authenticated;

CREATE OR REPLACE FUNCTION public.ib_tracked_lots(p_broker uuid, p_start date, p_end date)
RETURNS TABLE (lots numeric, accounts integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT can_reconcile_rebates() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
  SELECT coalesce(sum(t.lots), 0)::numeric, count(DISTINCT t.account_name)::integer
  FROM trade_history t
  WHERE lower(t.account_name) IN (SELECT lower(r.account_number) FROM ib_referrals r WHERE r.broker_id = p_broker AND r.account_number <> '')
    AND t.close_time >= p_start::timestamptz
    AND t.close_time < (p_end + 1)::timestamptz;
END $$;
REVOKE ALL ON FUNCTION public.ib_tracked_lots(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ib_tracked_lots(uuid, date, date) TO authenticated;
