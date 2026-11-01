/*
# Add "client" member role

1. Modified Tables
- `app_members.role` now also accepts 'client'. Clients may only see the Signals page,
  which lists master accounts with a simplified performance summary.

2. Modified Functions
- `admin_update_member` accepts 'client' as a role (still admins only).

3. Security
- `can_operate()` is unchanged (admin and trader only), so clients cannot change accounts,
  settings, or close trades. `is_admin()` is unchanged.
*/

ALTER TABLE app_members DROP CONSTRAINT IF EXISTS app_members_role_check;
ALTER TABLE app_members ADD CONSTRAINT app_members_role_check CHECK (role IN ('admin', 'trader', 'viewer', 'client'));

CREATE OR REPLACE FUNCTION public.admin_update_member(p_user uuid, p_role text, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('admin', 'trader', 'viewer', 'client') OR p_status NOT IN ('pending', 'active') THEN
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