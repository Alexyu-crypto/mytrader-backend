/*
# Self-service account requests (agents and clients)

Lets clients and agents submit a new Follower trading account. The account is NOT
created until an admin/trader approves it, so nothing is copied before review.
Only EA Installer accounts can be requested (MetaApi is not allowed for these roles).

1. New Tables
- `account_requests`
  - `id` uuid PK
  - `requested_by` uuid: the signed-in user who submitted (defaults to auth.uid())
  - `for_user_id` uuid: the client who will own the account (self, or an agent's client)
  - `holder_name`, `account_number`, `broker`, `broker_server`, `platform` (MT4/MT5)
  - `account_name` text: generated follower name (F-XX-123456-Broker)
  - `master_account` text: master the account will follow once approved
  - `password` text: trading password, readable only server-side (column not granted)
  - `status` pending | approved | rejected | cancelled
  - `review_note`, `reviewed_by`, `reviewed_at`, `created_at`

2. Functions
- `submit_account_request(...)`: client (for self) or agent (for self or own client,
  needs perm_manage_clients). Forces EA connection. Validates all fields.
- `review_account_request(id, approve, note)`: admin/trader only. On approval creates the
  follower account (EA), stores the password, links it to the client and creates the
  copy pair with default settings. Password is wiped from the request afterwards.
- `cancel_account_request(id)`: submitter can cancel while pending.

3. Security
- RLS enabled. SELECT only: own/for-me rows, agent's clients' rows, or operators.
- No direct INSERT/UPDATE/DELETE grants; all writes go through the functions above.
- The `password` column is excluded from the SELECT grant.
*/

CREATE TABLE IF NOT EXISTS account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  for_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holder_name text NOT NULL,
  account_number text NOT NULL,
  broker text NOT NULL,
  broker_server text,
  platform text NOT NULL DEFAULT 'MT4' CHECK (platform IN ('MT4','MT5')),
  account_name text NOT NULL,
  master_account text NOT NULL,
  password text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  review_note text NOT NULL DEFAULT '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_requests_status_idx ON account_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS account_requests_for_user_idx ON account_requests (for_user_id);
CREATE INDEX IF NOT EXISTS account_requests_requested_by_idx ON account_requests (requested_by);
CREATE UNIQUE INDEX IF NOT EXISTS account_requests_pending_name_uq ON account_requests (account_name) WHERE status = 'pending';

ALTER TABLE account_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON account_requests FROM anon, authenticated;
GRANT SELECT (id, requested_by, for_user_id, holder_name, account_number, broker, broker_server, platform, account_name, master_account, status, review_note, reviewed_by, reviewed_at, created_at) ON account_requests TO authenticated;

DROP POLICY IF EXISTS "read_relevant_account_requests" ON account_requests;
CREATE POLICY "read_relevant_account_requests" ON account_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR for_user_id = auth.uid()
  OR can_operate()
  OR (my_agent_id() IS NOT NULL AND for_user_id IN (SELECT m.user_id FROM app_members m WHERE m.agent_id = my_agent_id()))
);

DROP POLICY IF EXISTS "no_direct_insert_account_requests" ON account_requests;
CREATE POLICY "no_direct_insert_account_requests" ON account_requests FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "no_direct_update_account_requests" ON account_requests;
CREATE POLICY "no_direct_update_account_requests" ON account_requests FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "no_direct_delete_account_requests" ON account_requests;
CREATE POLICY "no_direct_delete_account_requests" ON account_requests FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION submit_account_request(
  p_holder_name text, p_account_number text, p_broker text, p_broker_server text,
  p_platform text, p_master_account text, p_password text, p_for_user uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_target uuid;
  v_initials text;
  v_broker_short text;
  v_name text;
  v_id uuid;
BEGIN
  SELECT role INTO v_role FROM app_members WHERE user_id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('client','agent') THEN RAISE EXCEPTION 'not_allowed'; END IF;

  v_target := coalesce(p_for_user, v_uid);
  IF v_target <> v_uid THEN
    IF v_role <> 'agent' OR my_agent_id() IS NULL
       OR NOT EXISTS (SELECT 1 FROM agents a WHERE a.id = my_agent_id() AND a.perm_manage_clients)
       OR NOT EXISTS (SELECT 1 FROM app_members m WHERE m.user_id = v_target AND m.agent_id = my_agent_id() AND m.role = 'client')
    THEN RAISE EXCEPTION 'not_your_client'; END IF;
  ELSIF v_role = 'agent' AND my_agent_id() IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  p_holder_name := btrim(coalesce(p_holder_name,''));
  p_account_number := btrim(coalesce(p_account_number,''));
  p_broker := btrim(coalesce(p_broker,''));
  p_broker_server := nullif(btrim(coalesce(p_broker_server,'')), '');
  IF length(p_holder_name) = 0 OR length(p_holder_name) > 100 THEN RAISE EXCEPTION 'invalid_holder'; END IF;
  IF p_account_number !~ '^[0-9]{3,12}$' THEN RAISE EXCEPTION 'invalid_number'; END IF;
  IF length(p_broker) = 0 OR length(p_broker) > 60 THEN RAISE EXCEPTION 'invalid_broker'; END IF;
  IF p_broker_server IS NOT NULL AND length(p_broker_server) > 120 THEN RAISE EXCEPTION 'invalid_server'; END IF;
  IF p_platform NOT IN ('MT4','MT5') THEN RAISE EXCEPTION 'invalid_platform'; END IF;
  IF length(coalesce(p_password,'')) = 0 OR length(p_password) > 64 THEN RAISE EXCEPTION 'invalid_password'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_master_account AND type = 'master') THEN RAISE EXCEPTION 'invalid_master'; END IF;

  SELECT left(string_agg(upper(left(regexp_replace(w, '[^A-Za-z]', '', 'g'), 1)), '' ), 4)
    INTO v_initials FROM regexp_split_to_table(p_holder_name, '[\s\-_.]+') AS w;
  v_broker_short := left(regexp_replace(p_broker, '[^A-Za-z0-9]', '', 'g'), 16);
  IF coalesce(v_initials,'') = '' THEN RAISE EXCEPTION 'invalid_holder'; END IF;
  IF v_broker_short = '' THEN RAISE EXCEPTION 'invalid_broker'; END IF;
  v_name := 'F-' || v_initials || '-' || p_account_number || '-' || v_broker_short;
  IF length(v_name) > 28 THEN RAISE EXCEPTION 'name_too_long'; END IF;

  IF EXISTS (SELECT 1 FROM accounts WHERE account_name = v_name)
     OR EXISTS (SELECT 1 FROM account_requests WHERE account_name = v_name AND status = 'pending')
  THEN RAISE EXCEPTION 'already_exists'; END IF;

  INSERT INTO account_requests (requested_by, for_user_id, holder_name, account_number, broker, broker_server, platform, account_name, master_account, password)
  VALUES (v_uid, v_target, p_holder_name, p_account_number, p_broker, p_broker_server, p_platform, v_name, p_master_account, p_password)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION review_account_request(p_id uuid, p_approve boolean, p_note text DEFAULT '')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r account_requests%ROWTYPE;
  v_account_id uuid;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO r FROM account_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  IF NOT p_approve THEN
    UPDATE account_requests SET status = 'rejected', password = '', review_note = left(coalesce(p_note,''), 500),
      reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
    RETURN r.account_name;
  END IF;

  IF EXISTS (SELECT 1 FROM accounts WHERE account_name = r.account_name) THEN RAISE EXCEPTION 'already_exists'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = r.master_account AND type = 'master') THEN RAISE EXCEPTION 'invalid_master'; END IF;

  INSERT INTO accounts (account_name, broker, broker_server, platform, type, holder_name, connection_method)
  VALUES (r.account_name, r.broker, r.broker_server, r.platform, 'follower', r.holder_name, 'ea')
  RETURNING id INTO v_account_id;

  INSERT INTO account_credentials (account_id, password, updated_by) VALUES (v_account_id, r.password, auth.uid())
  ON CONFLICT (account_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now(), updated_by = auth.uid();

  INSERT INTO client_accounts (user_id, account_name, created_by)
  SELECT r.for_user_id, r.account_name, auth.uid()
  WHERE NOT EXISTS (SELECT 1 FROM client_accounts WHERE user_id = r.for_user_id AND account_name = r.account_name);

  INSERT INTO copy_settings (master_account, follower_account, enabled)
  SELECT r.master_account, r.account_name, true
  WHERE NOT EXISTS (SELECT 1 FROM copy_settings WHERE master_account = r.master_account AND follower_account = r.account_name);

  UPDATE account_requests SET status = 'approved', password = '', review_note = left(coalesce(p_note,''), 500),
    reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
  RETURN r.account_name;
END $$;

CREATE OR REPLACE FUNCTION cancel_account_request(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE account_requests SET status = 'cancelled', password = ''
  WHERE id = p_id AND requested_by = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_pending'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION submit_account_request(text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION review_account_request(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cancel_account_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_account_request(text, text, text, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION review_account_request(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_account_request(uuid) TO authenticated;
