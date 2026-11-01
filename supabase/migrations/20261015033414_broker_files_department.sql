/*
# Broker Files department

## Summary
Adds a new staff role, `broker_files`, for colleagues who collect MT4 / MT5 broker
server files and setup programs from around the world. They can manage the broker
file library and nothing else.

## 1. Role
- `app_members.role` now also accepts `broker_files`.
- `admin_update_member` accepts `broker_files` so admins can assign it.

## 2. New helper
- `can_manage_terminal_files()`: true for active admin, trader or broker_files members.

## 3. Security changes
- Storage buckets `terminal-servers` and `terminal-setups`: select / insert / update /
  delete now use `can_manage_terminal_files()` (previously admin + trader only).
- `terminal_installer_settings`: select / insert / update now use the same helper.

## 4. New report function
- `terminal_file_needs()`: returns each distinct (platform, broker, server) used by
  accounts, with an account count, so the department can see which servers are still
  missing. Returns no account names or numbers. Only callable by the roles above.

## Notes
1. No tables or data are removed.
2. Safe to re-run.
*/

ALTER TABLE app_members DROP CONSTRAINT IF EXISTS app_members_role_check;
ALTER TABLE app_members ADD CONSTRAINT app_members_role_check
  CHECK (role = ANY (ARRAY['admin','trader','client','agent','finance','ib_manager','account_opening','broker_files']));

CREATE OR REPLACE FUNCTION public.admin_update_member(p_user uuid, p_role text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
IF p_role NOT IN ('admin', 'trader', 'client', 'agent', 'finance', 'ib_manager', 'account_opening', 'broker_files') OR p_status NOT IN ('pending', 'active') THEN
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
END $function$;

CREATE OR REPLACE FUNCTION public.can_manage_terminal_files()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_members
    WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin','trader','broker_files')
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_terminal_files() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_terminal_files() TO authenticated;

CREATE OR REPLACE FUNCTION public.terminal_file_needs()
RETURNS TABLE(platform text, broker text, server text, accounts bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT can_manage_terminal_files() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
    SELECT a.platform::text, coalesce(a.broker,'')::text, coalesce(a.server,'')::text, count(*)
    FROM accounts a
    WHERE coalesce(a.server,'') <> '' OR coalesce(a.broker,'') <> ''
    GROUP BY 1,2,3
    ORDER BY 4 DESC;
END $$;
REVOKE ALL ON FUNCTION public.terminal_file_needs() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.terminal_file_needs() TO authenticated;

DROP POLICY IF EXISTS "operators_select_terminal_servers" ON storage.objects;
CREATE POLICY "operators_select_terminal_servers" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'terminal-servers' AND can_manage_terminal_files());
DROP POLICY IF EXISTS "operators_insert_terminal_servers" ON storage.objects;
CREATE POLICY "operators_insert_terminal_servers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'terminal-servers' AND can_manage_terminal_files());
DROP POLICY IF EXISTS "operators_update_terminal_servers" ON storage.objects;
CREATE POLICY "operators_update_terminal_servers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'terminal-servers' AND can_manage_terminal_files())
  WITH CHECK (bucket_id = 'terminal-servers' AND can_manage_terminal_files());
DROP POLICY IF EXISTS "operators_delete_terminal_servers" ON storage.objects;
CREATE POLICY "operators_delete_terminal_servers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'terminal-servers' AND can_manage_terminal_files());

DROP POLICY IF EXISTS "operators_select_terminal_setups" ON storage.objects;
CREATE POLICY "operators_select_terminal_setups" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'terminal-setups' AND can_manage_terminal_files());
DROP POLICY IF EXISTS "operators_insert_terminal_setups" ON storage.objects;
CREATE POLICY "operators_insert_terminal_setups" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'terminal-setups' AND can_manage_terminal_files());
DROP POLICY IF EXISTS "operators_update_terminal_setups" ON storage.objects;
CREATE POLICY "operators_update_terminal_setups" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'terminal-setups' AND can_manage_terminal_files())
  WITH CHECK (bucket_id = 'terminal-setups' AND can_manage_terminal_files());
DROP POLICY IF EXISTS "operators_delete_terminal_setups" ON storage.objects;
CREATE POLICY "operators_delete_terminal_setups" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'terminal-setups' AND can_manage_terminal_files());

DROP POLICY IF EXISTS "operators_select_installer_settings" ON terminal_installer_settings;
CREATE POLICY "operators_select_installer_settings" ON terminal_installer_settings FOR SELECT TO authenticated
  USING (can_manage_terminal_files());
DROP POLICY IF EXISTS "operators_insert_installer_settings" ON terminal_installer_settings;
CREATE POLICY "operators_insert_installer_settings" ON terminal_installer_settings FOR INSERT TO authenticated
  WITH CHECK (can_manage_terminal_files());
DROP POLICY IF EXISTS "operators_update_installer_settings" ON terminal_installer_settings;
CREATE POLICY "operators_update_installer_settings" ON terminal_installer_settings FOR UPDATE TO authenticated
  USING (can_manage_terminal_files()) WITH CHECK (can_manage_terminal_files());
