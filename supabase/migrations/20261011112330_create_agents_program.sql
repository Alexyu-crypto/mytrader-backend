/*
# Agent (reseller) program

Lets people apply to become agents, lets full admins approve them and set what they may do, gives every
agent a branded sign-in link for their own clients, and lets agents upload their own logo.

1. New Tables
- `agents`: one row per approved agent
  - `id` (uuid, pk), `user_id` (uuid, unique, the agent's login)
  - `slug` (text, unique, lowercase letters/digits/hyphens; used in the branded link #/a/<slug>)
  - `brand_name`, `tagline`, `contact` (text, editable by the agent)
  - `brand_color` (text, #rrggbb, editable by the agent)
  - `logo_path` (text, file inside the `agent-logos` storage bucket, editable by the agent)
  - `status` ('active' | 'suspended') admin only
  - `perm_view_trades`, `perm_view_activity`, `perm_client_signup` (booleans) admin only
  - `created_at`, `updated_at`
- `agent_applications`: applications from signed-in users
  - applicant `user_id` (defaults to the signed-in user), `email`, `brand_name`, `desired_slug`,
    `contact_name`, `contact`, `region`, `expected_clients`, `message`
  - `status` ('pending' | 'approved' | 'rejected' | 'cancelled'), `admin_note`, `handled_by`

2. Modified Tables
- `app_members`: role may now also be 'agent'; new column `agent_id` (which agent a client belongs to).
  Users cannot write app_members directly (no write policies), so agent_id cannot be self-assigned after sign-up.

3. Functions
- `is_agent()`, `my_agent_id()`: helpers for policies.
- `agent_public_brand(slug)`: public, returns only branding of an ACTIVE agent (for the branded sign-in page).
- `my_brand()`: branding to show inside the app for an agent or an agent's client.
- `agent_slug_available(slug)`: availability check for the application form.
- `admin_approve_agent(...)`, `admin_reject_agent_application(...)`, `admin_update_agent(...)`,
  `admin_set_member_agent(...)`: admin only (checked inside).
- `cancel_agent_application(id)`: applicant cancels own pending application.
- `agent_clients()`: an active agent's own clients (email, join date, linked accounts).
- `handle_new_member()`: sign-ups coming through an agent link (sign-up metadata `agent_slug`) are attached
  to that agent if it is active and allows client sign-up.
- `my_linked_accounts()`: an active agent with `perm_view_trades` also sees the accounts of their clients
  (relation 'client').
- `admin_update_member()`: role 'agent' is only allowed for users that have an agents row.
- `audit_row_change()`: readable target names for agent rows.

4. Storage
- Bucket `agent-logos` (public read, because logos are shown on the public sign-in page; 1 MB, PNG/JPEG/WEBP only).
- An active agent may only upload / delete files inside the folder named after their own agent id.

5. Security
- RLS on both new tables.
- agents: SELECT own row or admin; UPDATE by the agent limited by column grants to branding columns only;
  INSERT/DELETE admin only (approval goes through admin_approve_agent).
- agent_applications: applicants insert/see their own; admins see/handle all; status changes only via functions.
- Changes on both tables are written to the activity log.
*/

ALTER TABLE app_members DROP CONSTRAINT IF EXISTS app_members_role_check;
ALTER TABLE app_members ADD CONSTRAINT app_members_role_check CHECK (role IN ('admin', 'trader', 'viewer', 'client', 'agent'));

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$'),
  brand_name text NOT NULL CHECK (char_length(brand_name) BETWEEN 1 AND 60),
  tagline text NOT NULL DEFAULT '' CHECK (char_length(tagline) <= 140),
  contact text NOT NULL DEFAULT '' CHECK (char_length(contact) <= 200),
  brand_color text NOT NULL DEFAULT '#06b6d4' CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text CHECK (logo_path IS NULL OR char_length(logo_path) <= 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  perm_view_trades boolean NOT NULL DEFAULT true,
  perm_view_activity boolean NOT NULL DEFAULT false,
  perm_client_signup boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'app_members' AND column_name = 'agent_id') THEN
    ALTER TABLE app_members ADD COLUMN agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_app_members_agent ON app_members(agent_id);

CREATE TABLE IF NOT EXISTS agent_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  brand_name text NOT NULL CHECK (char_length(brand_name) BETWEEN 1 AND 60),
  desired_slug text NOT NULL CHECK (desired_slug ~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$'),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 100),
  contact text NOT NULL CHECK (char_length(contact) BETWEEN 1 AND 200),
  region text NOT NULL DEFAULT '' CHECK (char_length(region) <= 100),
  expected_clients integer CHECK (expected_clients IS NULL OR expected_clients BETWEEN 0 AND 1000000),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note text NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 1000),
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_applications_user ON agent_applications(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_applications_one_pending ON agent_applications(user_id) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.is_agent()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (
  SELECT 1 FROM app_members m JOIN agents a ON a.user_id = m.user_id
  WHERE m.user_id = auth.uid() AND m.role = 'agent' AND m.status = 'active' AND a.status = 'active') $$;

CREATE OR REPLACE FUNCTION public.my_agent_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT a.id FROM agents a JOIN app_members m ON m.user_id = a.user_id
  WHERE a.user_id = auth.uid() AND m.role = 'agent' AND m.status = 'active' AND a.status = 'active' $$;

REVOKE ALL ON FUNCTION public.is_agent() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_agent_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_agent() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_agent_id() TO authenticated;

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_or_admin_agents" ON agents;
CREATE POLICY "select_own_or_admin_agents" ON agents FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "admin_insert_agents" ON agents;
CREATE POLICY "admin_insert_agents" ON agents FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "own_or_admin_update_agents" ON agents;
CREATE POLICY "own_or_admin_update_agents" ON agents FOR UPDATE
  TO authenticated USING (is_admin() OR id = my_agent_id()) WITH CHECK (is_admin() OR id = my_agent_id());
DROP POLICY IF EXISTS "admin_delete_agents" ON agents;
CREATE POLICY "admin_delete_agents" ON agents FOR DELETE
  TO authenticated USING (is_admin());

REVOKE INSERT, UPDATE, DELETE ON agents FROM anon, authenticated;
GRANT UPDATE (brand_name, tagline, contact, brand_color, logo_path) ON agents TO authenticated;

ALTER TABLE agent_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_or_admin_agent_applications" ON agent_applications;
CREATE POLICY "select_own_or_admin_agent_applications" ON agent_applications FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "insert_own_agent_applications" ON agent_applications;
CREATE POLICY "insert_own_agent_applications" ON agent_applications FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
DROP POLICY IF EXISTS "admin_update_agent_applications" ON agent_applications;
CREATE POLICY "admin_update_agent_applications" ON agent_applications FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admin_delete_agent_applications" ON agent_applications;
CREATE POLICY "admin_delete_agent_applications" ON agent_applications FOR DELETE
  TO authenticated USING (is_admin());

REVOKE INSERT, UPDATE ON agent_applications FROM anon, authenticated;
GRANT INSERT (brand_name, desired_slug, contact_name, contact, region, expected_clients, message) ON agent_applications TO authenticated;
GRANT UPDATE (admin_note) ON agent_applications TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_applications_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.status := 'pending';
  NEW.admin_note := '';
  NEW.handled_by := NULL;
  NEW.desired_slug := lower(NEW.desired_slug);
  NEW.email := coalesce((SELECT email FROM app_members WHERE user_id = auth.uid()), '');
  IF EXISTS (SELECT 1 FROM agents WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'already_agent';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.agent_applications_before_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agent_applications_before_insert ON agent_applications;
CREATE TRIGGER agent_applications_before_insert BEFORE INSERT ON agent_applications
  FOR EACH ROW EXECUTE FUNCTION agent_applications_before_insert();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS agents_touch ON agents;
CREATE TRIGGER agents_touch BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS agent_applications_touch ON agent_applications;
CREATE TRIGGER agent_applications_touch BEFORE UPDATE ON agent_applications FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS audit_agents ON agents;
CREATE TRIGGER audit_agents AFTER INSERT OR UPDATE OR DELETE ON agents FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_agent_applications ON agent_applications;
CREATE TRIGGER audit_agent_applications AFTER INSERT OR UPDATE OR DELETE ON agent_applications FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changes jsonb;
  v_target text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;
  v_row := coalesce(v_new, v_old);

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(n.key, jsonb_build_object('from', v_old -> n.key, 'to', n.value))
      INTO v_changes
      FROM jsonb_each(v_new) n
      WHERE n.key NOT IN ('updated_at') AND (v_old -> n.key) IS DISTINCT FROM n.value;
    IF v_changes IS NULL THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_changes := v_new - 'id';
  ELSE
    v_changes := v_old - 'id';
  END IF;

  v_target := CASE TG_TABLE_NAME
    WHEN 'copy_settings' THEN concat(v_row ->> 'master_account', ' -> ', v_row ->> 'follower_account')
    WHEN 'app_members' THEN v_row ->> 'email'
    WHEN 'client_accounts' THEN concat(
      (SELECT m.email FROM app_members m WHERE m.user_id = (v_row ->> 'user_id')::uuid), ' : ', v_row ->> 'account_name')
    WHEN 'copy_requests' THEN concat(v_row ->> 'email', ' -> ', v_row ->> 'master_account')
    WHEN 'app_settings' THEN 'Global settings'
    WHEN 'agents' THEN concat(v_row ->> 'brand_name', ' (', v_row ->> 'slug', ')')
    WHEN 'agent_applications' THEN concat(v_row ->> 'email', ' -> ', v_row ->> 'brand_name')
    ELSE coalesce(v_row ->> 'account_name', v_row ->> 'id')
  END;

  INSERT INTO activity_log (actor_id, actor_email, action, category, target, changes)
  VALUES (
    v_actor,
    (SELECT m.email FROM app_members m WHERE m.user_id = v_actor),
    lower(TG_OP),
    TG_TABLE_NAME,
    left(v_target, 300),
    v_changes
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_public_brand(p_slug text)
RETURNS TABLE (slug text, brand_name text, tagline text, brand_color text, logo_path text, signup_open boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.slug, a.brand_name, a.tagline, a.brand_color, a.logo_path, a.perm_client_signup
  FROM agents a JOIN app_members m ON m.user_id = a.user_id
  WHERE a.slug = lower(p_slug) AND a.status = 'active' AND m.role = 'agent' AND m.status = 'active';
$$;
REVOKE ALL ON FUNCTION public.agent_public_brand(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_public_brand(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_brand()
RETURNS TABLE (slug text, brand_name text, tagline text, brand_color text, logo_path text, is_owner boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.slug, a.brand_name, a.tagline, a.brand_color, a.logo_path, a.user_id = auth.uid()
  FROM agents a
  WHERE a.status = 'active'
    AND (a.user_id = auth.uid() OR a.id = (SELECT m.agent_id FROM app_members m WHERE m.user_id = auth.uid()))
  ORDER BY (a.user_id = auth.uid()) DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_brand() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_brand() TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_slug_available(p_slug text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT lower(p_slug) ~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$'
    AND lower(p_slug) NOT IN ('www', 'admin', 'api', 'app', 'dashboard', 'report', 'login', 'signup')
    AND NOT EXISTS (SELECT 1 FROM agents WHERE slug = lower(p_slug));
$$;
REVOKE ALL ON FUNCTION public.agent_slug_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_slug_available(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_agent(
  p_application uuid, p_slug text, p_view_trades boolean, p_view_activity boolean, p_client_signup boolean, p_note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_app agent_applications%ROWTYPE;
  v_agent uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO v_app FROM agent_applications WHERE id = p_application AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT agent_slug_available(p_slug) THEN RAISE EXCEPTION 'slug_taken'; END IF;
  IF EXISTS (SELECT 1 FROM app_members WHERE user_id = v_app.user_id AND role = 'admin') THEN RAISE EXCEPTION 'is_admin'; END IF;

  INSERT INTO agents (user_id, slug, brand_name, contact, perm_view_trades, perm_view_activity, perm_client_signup)
  VALUES (v_app.user_id, lower(p_slug), v_app.brand_name, v_app.contact, coalesce(p_view_trades, true), coalesce(p_view_activity, false), coalesce(p_client_signup, true))
  RETURNING id INTO v_agent;

  UPDATE app_members SET role = 'agent', status = 'active', agent_id = NULL WHERE user_id = v_app.user_id;
  UPDATE agent_applications SET status = 'approved', handled_by = auth.uid(), admin_note = left(coalesce(p_note, ''), 1000)
    WHERE id = p_application;
  RETURN v_agent;
END $$;
REVOKE ALL ON FUNCTION public.admin_approve_agent(uuid, text, boolean, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_agent(uuid, text, boolean, boolean, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_agent_application(p_application uuid, p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE agent_applications SET status = 'rejected', handled_by = auth.uid(), admin_note = left(coalesce(p_note, ''), 1000)
    WHERE id = p_application AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_pending'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_reject_agent_application(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_agent_application(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_agent_application(p_application uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE agent_applications SET status = 'cancelled'
    WHERE id = p_application AND user_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_pending'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.cancel_agent_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_agent_application(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_agent(
  p_agent uuid, p_status text, p_view_trades boolean, p_view_activity boolean, p_client_signup boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE agents SET status = p_status, perm_view_trades = p_view_trades, perm_view_activity = p_view_activity,
    perm_client_signup = p_client_signup
  WHERE id = p_agent;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_agent(uuid, text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_agent(uuid, text, boolean, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_member_agent(p_user uuid, p_agent uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_agent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents WHERE id = p_agent) THEN RAISE EXCEPTION 'not found'; END IF;
  IF p_agent IS NOT NULL AND EXISTS (SELECT 1 FROM agents WHERE id = p_agent AND user_id = p_user) THEN RAISE EXCEPTION 'self'; END IF;
  UPDATE app_members SET agent_id = p_agent WHERE user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_member_agent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_agent(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_clients()
RETURNS TABLE (user_id uuid, email text, status text, joined_at timestamptz, accounts text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT m.user_id, m.email, m.status, m.created_at,
    coalesce((SELECT array_agg(ca.account_name ORDER BY ca.account_name) FROM client_accounts ca WHERE ca.user_id = m.user_id), '{}')
  FROM app_members m
  WHERE my_agent_id() IS NOT NULL AND m.agent_id = my_agent_id()
  ORDER BY m.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.agent_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_clients() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_agent uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(7340031);
  IF NOT EXISTS (SELECT 1 FROM app_members) THEN
    INSERT INTO app_members (user_id, email, role, status) VALUES (NEW.id, coalesce(NEW.email, ''), 'admin', 'active')
    ON CONFLICT DO NOTHING;
  ELSE
    SELECT a.id INTO v_agent FROM agents a
      WHERE a.slug = lower(coalesce(NEW.raw_user_meta_data ->> 'agent_slug', ''))
        AND a.status = 'active' AND a.perm_client_signup;
    INSERT INTO app_members (user_id, email, role, status, agent_id) VALUES (NEW.id, coalesce(NEW.email, ''), 'client', 'active', v_agent)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_member() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_linked_accounts()
RETURNS TABLE (account_name text, relation text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  WITH own AS (
    SELECT ca.account_name FROM client_accounts ca WHERE ca.user_id = auth.uid()
  ),
  clients AS (
    SELECT DISTINCT unnest(ac.accounts) AS account_name FROM agent_clients() ac
    WHERE EXISTS (SELECT 1 FROM agents a WHERE a.id = my_agent_id() AND a.perm_view_trades)
  ),
  signals AS (
    SELECT cs.master_account AS account_name FROM copy_settings cs
      WHERE cs.follower_account IN (SELECT o.account_name FROM own o UNION SELECT c.account_name FROM clients c)
    UNION
    SELECT cr.master_account FROM copy_requests cr
      WHERE cr.user_id = auth.uid() AND cr.status = 'approved'
  )
  SELECT o.account_name, 'own'::text FROM own o
  UNION
  SELECT c.account_name, 'client'::text FROM clients c WHERE c.account_name NOT IN (SELECT o.account_name FROM own o)
  UNION
  SELECT s.account_name, 'signal'::text FROM signals s
    WHERE s.account_name NOT IN (SELECT o.account_name FROM own o UNION SELECT c.account_name FROM clients c);
$$;
REVOKE ALL ON FUNCTION public.my_linked_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_linked_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_member(p_user uuid, p_role text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('admin', 'trader', 'viewer', 'client', 'agent') OR p_status NOT IN ('pending', 'active') THEN
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'agent-logos') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('agent-logos', 'agent-logos', true, 1048576, ARRAY['image/png', 'image/jpeg', 'image/webp']);
  END IF;
END $$;

DROP POLICY IF EXISTS "agent_logos_insert_own_folder" ON storage.objects;
CREATE POLICY "agent_logos_insert_own_folder" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'agent-logos' AND (storage.foldername(name))[1] = my_agent_id()::text);
DROP POLICY IF EXISTS "agent_logos_delete_own_folder" ON storage.objects;
CREATE POLICY "agent_logos_delete_own_folder" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'agent-logos' AND (storage.foldername(name))[1] = my_agent_id()::text);
DROP POLICY IF EXISTS "agent_logos_select_own_folder" ON storage.objects;
CREATE POLICY "agent_logos_select_own_folder" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'agent-logos' AND ((storage.foldername(name))[1] = my_agent_id()::text OR is_admin()));