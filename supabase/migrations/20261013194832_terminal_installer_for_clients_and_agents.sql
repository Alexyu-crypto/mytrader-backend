/*
# PC installer for clients and agents

1. Modified Tables
- `agents`: new `perm_install_terminals` (boolean, default false). When on, the agent may build
  PC install packages for their clients' accounts. Off by default because a package carries the
  clients' trading passwords to the agent's PC.

2. Modified Functions
- `admin_update_agent` and `admin_approve_agent` gain a trailing `p_install_terminals` argument
  (default false). Old signatures are replaced. Still admin-only.

3. Security
- `terminal_installations`: signed-in users can now read and delete the packages they created
  themselves (`created_by = auth.uid()`). Staff access (`can_operate()`) is unchanged.
  Inserts/updates still only happen inside the server function.

4. Notes
1. Column-level UPDATE privileges on `agents` are unchanged, so agents cannot grant themselves the new permission.
*/

ALTER TABLE agents ADD COLUMN IF NOT EXISTS perm_install_terminals boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.admin_update_agent(uuid, text, boolean, boolean, boolean, boolean);
CREATE OR REPLACE FUNCTION public.admin_update_agent(p_agent uuid, p_status text, p_view_trades boolean, p_view_activity boolean, p_client_signup boolean, p_manage_clients boolean, p_install_terminals boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
IF p_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'invalid status'; END IF;
UPDATE agents SET status = p_status, perm_view_trades = p_view_trades, perm_view_activity = p_view_activity,
perm_client_signup = p_client_signup, perm_manage_clients = p_manage_clients,
perm_install_terminals = coalesce(p_install_terminals, false)
WHERE id = p_agent;
IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.admin_update_agent(uuid, text, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_agent(uuid, text, boolean, boolean, boolean, boolean, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_approve_agent(uuid, text, boolean, boolean, boolean, boolean, text);
CREATE OR REPLACE FUNCTION public.admin_approve_agent(p_application uuid, p_slug text, p_view_trades boolean, p_view_activity boolean, p_client_signup boolean, p_manage_clients boolean, p_note text DEFAULT ''::text, p_install_terminals boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_app agent_applications%ROWTYPE;
v_agent uuid;
BEGIN
IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
SELECT * INTO v_app FROM agent_applications WHERE id = p_application AND status = 'pending' FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'not_pending'; END IF;
IF NOT agent_slug_available(p_slug) THEN RAISE EXCEPTION 'slug_taken'; END IF;
IF EXISTS (SELECT 1 FROM app_members WHERE user_id = v_app.user_id AND role = 'admin') THEN RAISE EXCEPTION 'is_admin'; END IF;

INSERT INTO agents (user_id, slug, brand_name, contact, perm_view_trades, perm_view_activity, perm_client_signup, perm_manage_clients, perm_install_terminals)
VALUES (v_app.user_id, lower(p_slug), v_app.brand_name, v_app.contact, coalesce(p_view_trades, true),
coalesce(p_view_activity, false), coalesce(p_client_signup, true), coalesce(p_manage_clients, true), coalesce(p_install_terminals, false))
RETURNING id INTO v_agent;

UPDATE app_members SET role = 'agent', status = 'active', agent_id = NULL WHERE user_id = v_app.user_id;
UPDATE agent_applications SET status = 'approved', handled_by = auth.uid(), admin_note = left(coalesce(p_note, ''), 1000)
WHERE id = p_application;
RETURN v_agent;
END $function$;
REVOKE ALL ON FUNCTION public.admin_approve_agent(uuid, text, boolean, boolean, boolean, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_agent(uuid, text, boolean, boolean, boolean, boolean, text, boolean) TO authenticated;

DROP POLICY IF EXISTS "creator_select_installations" ON terminal_installations;
CREATE POLICY "creator_select_installations" ON terminal_installations FOR SELECT
TO authenticated USING (created_by = auth.uid());

DROP POLICY IF EXISTS "creator_delete_installations" ON terminal_installations;
CREATE POLICY "creator_delete_installations" ON terminal_installations FOR DELETE
TO authenticated USING (created_by = auth.uid());
