/*
# IB Manager role and broker partnership (IB) applications

1. Modified Tables
  - `app_members.role` may now also be 'ib_manager' (staff who open IB/agent accounts with brokers).

2. New Functions
  - `can_manage_ib()`: true for active admin or ib_manager members.
  - `admin_update_member()`: now accepts 'ib_manager'.

3. New Tables
  - `ib_brokers`: one row per broker we apply to.
    - broker_name, website, regulation, region, contact_name, contact_email
    - stage: prospect | submitted | review | negotiating | approved | rejected
    - application_ref, submitted_at, approved_at, next_follow_up (date)
    - documents (jsonb checklist: key -> done boolean)
    - rebate_type, rebate_per_lot, payout_cycle, rebate_terms (free text)
    - ib_code, portal_url, portal_login (backend account, no password)
    - manager_name, manager_title, manager_email, manager_phone, manager_messenger, manager_timezone
    - notes, created_by, created_at, updated_at
  - `ib_links`: referral links per broker (label, url, account_type, region, active).
  - `ib_portal_secrets`: backend portal password per broker, kept in a separate table so that a
    future account-opening role can read broker info and links without seeing passwords.
  - `ib_events`: timeline per broker (stage changes, notes, follow-ups) with author.

4. Security
  - RLS enabled on all four tables, anon has no privileges.
  - All read/write limited to active admin or ib_manager via `can_manage_ib()`.
  - Timeline entries cannot be edited; only full admins may delete them.
  - Deleting a broker record is admin only.
*/

ALTER TABLE app_members DROP CONSTRAINT IF EXISTS app_members_role_check;
ALTER TABLE app_members ADD CONSTRAINT app_members_role_check CHECK (role IN ('admin', 'trader', 'client', 'agent', 'finance', 'ib_manager'));

CREATE OR REPLACE FUNCTION public.can_manage_ib()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM app_members WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'ib_manager')) $$;
REVOKE ALL ON FUNCTION public.can_manage_ib() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_ib() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_member(p_user uuid, p_role text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('admin', 'trader', 'client', 'agent', 'finance', 'ib_manager') OR p_status NOT IN ('pending', 'active') THEN
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

CREATE TABLE IF NOT EXISTS ib_brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_name text NOT NULL CHECK (char_length(broker_name) BETWEEN 1 AND 120),
  website text NOT NULL DEFAULT '',
  regulation text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'prospect' CHECK (stage IN ('prospect', 'submitted', 'review', 'negotiating', 'approved', 'rejected')),
  application_ref text NOT NULL DEFAULT '',
  submitted_at date,
  approved_at date,
  next_follow_up date,
  documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  rebate_type text NOT NULL DEFAULT '',
  rebate_per_lot numeric,
  payout_cycle text NOT NULL DEFAULT '',
  rebate_terms text NOT NULL DEFAULT '',
  ib_code text NOT NULL DEFAULT '',
  portal_url text NOT NULL DEFAULT '',
  portal_login text NOT NULL DEFAULT '',
  manager_name text NOT NULL DEFAULT '',
  manager_title text NOT NULL DEFAULT '',
  manager_email text NOT NULL DEFAULT '',
  manager_phone text NOT NULL DEFAULT '',
  manager_messenger text NOT NULL DEFAULT '',
  manager_timezone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ib_brokers_stage_idx ON ib_brokers (stage);

CREATE TABLE IF NOT EXISTS ib_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES ib_brokers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  url text NOT NULL CHECK (url ~* '^https?://'),
  account_type text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ib_links_broker_idx ON ib_links (broker_id);

CREATE TABLE IF NOT EXISTS ib_portal_secrets (
  broker_id uuid PRIMARY KEY REFERENCES ib_brokers(id) ON DELETE CASCADE,
  password text NOT NULL CHECK (char_length(password) BETWEEN 1 AND 128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS ib_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES ib_brokers(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'stage', 'follow_up', 'created')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  actor_id uuid DEFAULT auth.uid(),
  actor_email text NOT NULL DEFAULT coalesce(auth.jwt() ->> 'email', ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ib_events_broker_idx ON ib_events (broker_id, created_at DESC);

ALTER TABLE ib_brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ib_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ib_portal_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ib_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ib_brokers, ib_links, ib_portal_secrets, ib_events FROM anon;

DROP POLICY IF EXISTS "ib_select_brokers" ON ib_brokers;
CREATE POLICY "ib_select_brokers" ON ib_brokers FOR SELECT TO authenticated USING (can_manage_ib());
DROP POLICY IF EXISTS "ib_insert_brokers" ON ib_brokers;
CREATE POLICY "ib_insert_brokers" ON ib_brokers FOR INSERT TO authenticated WITH CHECK (can_manage_ib());
DROP POLICY IF EXISTS "ib_update_brokers" ON ib_brokers;
CREATE POLICY "ib_update_brokers" ON ib_brokers FOR UPDATE TO authenticated USING (can_manage_ib()) WITH CHECK (can_manage_ib());
DROP POLICY IF EXISTS "ib_delete_brokers" ON ib_brokers;
CREATE POLICY "ib_delete_brokers" ON ib_brokers FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "ib_select_links" ON ib_links;
CREATE POLICY "ib_select_links" ON ib_links FOR SELECT TO authenticated USING (can_manage_ib());
DROP POLICY IF EXISTS "ib_insert_links" ON ib_links;
CREATE POLICY "ib_insert_links" ON ib_links FOR INSERT TO authenticated WITH CHECK (can_manage_ib());
DROP POLICY IF EXISTS "ib_update_links" ON ib_links;
CREATE POLICY "ib_update_links" ON ib_links FOR UPDATE TO authenticated USING (can_manage_ib()) WITH CHECK (can_manage_ib());
DROP POLICY IF EXISTS "ib_delete_links" ON ib_links;
CREATE POLICY "ib_delete_links" ON ib_links FOR DELETE TO authenticated USING (can_manage_ib());

DROP POLICY IF EXISTS "ib_select_secrets" ON ib_portal_secrets;
CREATE POLICY "ib_select_secrets" ON ib_portal_secrets FOR SELECT TO authenticated USING (can_manage_ib());
DROP POLICY IF EXISTS "ib_insert_secrets" ON ib_portal_secrets;
CREATE POLICY "ib_insert_secrets" ON ib_portal_secrets FOR INSERT TO authenticated WITH CHECK (can_manage_ib());
DROP POLICY IF EXISTS "ib_update_secrets" ON ib_portal_secrets;
CREATE POLICY "ib_update_secrets" ON ib_portal_secrets FOR UPDATE TO authenticated USING (can_manage_ib()) WITH CHECK (can_manage_ib());
DROP POLICY IF EXISTS "ib_delete_secrets" ON ib_portal_secrets;
CREATE POLICY "ib_delete_secrets" ON ib_portal_secrets FOR DELETE TO authenticated USING (can_manage_ib());

DROP POLICY IF EXISTS "ib_select_events" ON ib_events;
CREATE POLICY "ib_select_events" ON ib_events FOR SELECT TO authenticated USING (can_manage_ib());
DROP POLICY IF EXISTS "ib_insert_events" ON ib_events;
CREATE POLICY "ib_insert_events" ON ib_events FOR INSERT TO authenticated WITH CHECK (can_manage_ib() AND actor_id = auth.uid());
DROP POLICY IF EXISTS "ib_delete_events" ON ib_events;
CREATE POLICY "ib_delete_events" ON ib_events FOR DELETE TO authenticated USING (is_admin());
