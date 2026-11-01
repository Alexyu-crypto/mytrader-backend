/*
# Remove the "viewer" role

1. Modified Tables
  - `app_members`: role constraint no longer includes 'viewer'.
    Default changed from 'viewer' to 'client'.

2. Modified Functions
  - `admin_update_member()`: no longer accepts 'viewer'.
  - `can_view_all()`: now checks admin, trader, finance (viewer removed).

3. Notes
  - No existing rows have role='viewer', so no data migration needed.
  - The viewer role is fully retired; finance replaces the read-only staff use case.
*/

-- Migrate any stragglers (safety net)
UPDATE app_members SET role = 'client' WHERE role = 'viewer';

ALTER TABLE app_members ALTER COLUMN role SET DEFAULT 'client';

ALTER TABLE app_members DROP CONSTRAINT IF EXISTS app_members_role_check;
ALTER TABLE app_members ADD CONSTRAINT app_members_role_check CHECK (role IN ('admin', 'trader', 'client', 'agent', 'finance'));

CREATE OR REPLACE FUNCTION public.can_view_all()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
SELECT EXISTS (
  SELECT 1 FROM app_members
  WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'trader', 'finance')
);
$$;

CREATE OR REPLACE FUNCTION public.admin_update_member(p_user uuid, p_role text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('admin', 'trader', 'client', 'agent', 'finance') OR p_status NOT IN ('pending', 'active') THEN
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
