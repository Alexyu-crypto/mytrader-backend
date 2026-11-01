/*
# Add "finance" member role (funding staff only)

1. Modified Tables
  - `app_members.role` may now also be 'finance' (deposit/withdrawal staff).

2. New Functions
  - `can_manage_funding()`: true for active admin, trader or finance members.

3. Modified Functions
  - `admin_update_member()`: accepts 'finance' as a valid role.

4. Security
  - `funding_requests` policies were open to every signed-in user (including clients and agents).
    They are now restricted to active admin / trader / finance members.
*/

ALTER TABLE app_members DROP CONSTRAINT IF EXISTS app_members_role_check;
ALTER TABLE app_members ADD CONSTRAINT app_members_role_check CHECK (role IN ('admin', 'trader', 'viewer', 'client', 'agent', 'finance'));

CREATE OR REPLACE FUNCTION public.can_manage_funding()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM app_members WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'trader', 'finance')) $$;
REVOKE ALL ON FUNCTION public.can_manage_funding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_funding() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_member(p_user uuid, p_role text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('admin', 'trader', 'viewer', 'client', 'agent', 'finance') OR p_status NOT IN ('pending', 'active') THEN
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

DROP POLICY IF EXISTS "select_funding_requests" ON funding_requests;
CREATE POLICY "select_funding_requests" ON funding_requests FOR SELECT
  TO authenticated USING (can_manage_funding());

DROP POLICY IF EXISTS "insert_funding_requests" ON funding_requests;
CREATE POLICY "insert_funding_requests" ON funding_requests FOR INSERT
  TO authenticated WITH CHECK (can_manage_funding());

DROP POLICY IF EXISTS "update_funding_requests" ON funding_requests;
CREATE POLICY "update_funding_requests" ON funding_requests FOR UPDATE
  TO authenticated USING (can_manage_funding()) WITH CHECK (can_manage_funding());

DROP POLICY IF EXISTS "delete_funding_requests" ON funding_requests;
CREATE POLICY "delete_funding_requests" ON funding_requests FOR DELETE
  TO authenticated USING (can_manage_funding());
