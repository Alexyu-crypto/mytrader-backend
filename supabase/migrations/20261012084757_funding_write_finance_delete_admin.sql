/*
# Funding requests: finance can manage, only admin can delete

1. Modified Tables
- `funding_requests` policies
2. Security
- New helper `can_edit_funding()` = active admin or finance member.
- INSERT / UPDATE now require `can_edit_funding()` (traders can still view but no longer write).
- DELETE now requires `is_admin()`.
- SELECT unchanged (`can_manage_funding()`: admin, trader, finance).
*/

CREATE OR REPLACE FUNCTION public.can_edit_funding()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM app_members WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'finance')) $$;

REVOKE EXECUTE ON FUNCTION public.can_edit_funding() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_edit_funding() TO authenticated;

DROP POLICY IF EXISTS "insert_funding_requests" ON funding_requests;
CREATE POLICY "insert_funding_requests" ON funding_requests FOR INSERT
TO authenticated WITH CHECK (can_edit_funding());

DROP POLICY IF EXISTS "update_funding_requests" ON funding_requests;
CREATE POLICY "update_funding_requests" ON funding_requests FOR UPDATE
TO authenticated USING (can_edit_funding()) WITH CHECK (can_edit_funding());

DROP POLICY IF EXISTS "delete_funding_requests" ON funding_requests;
CREATE POLICY "delete_funding_requests" ON funding_requests FOR DELETE
TO authenticated USING (is_admin());