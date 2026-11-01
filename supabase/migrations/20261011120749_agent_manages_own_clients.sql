/*
# Agents manage the authorisation of their own clients

Clients who joined through an agent are now approved and handled by that agent in the agent back office,
instead of by head office.

1. Modified Tables
- `agents`
  - `perm_manage_clients` (boolean, default true, admin only): the agent may approve / deactivate their own
    clients and handle their clients' copy-trading applications.
  - `client_approval` (boolean, default false, editable by the agent): new sign-ups through the agent link
    start as "pending" and must be approved by the agent.

2. New Functions
- `agent_manages_user(uuid)`: true when the caller is an active agent with `perm_manage_clients` and the user is one of their clients.
- `agent_set_client_status(user, status)`: agent approves ('active') or deactivates ('pending') one of their clients.
- `agent_handle_copy_request(id, status, note)`: agent marks a client's copy application contacted / approved / rejected.

3. Modified Functions
- `handle_new_member()`: agent sign-ups start as 'pending' when the agent requires approval.
- `copy_requests_before_update()`: the handling agent is recorded as handler and may keep the note.
- `admin_update_agent(...)`, `admin_approve_agent(...)`: also set `perm_manage_clients` (old signatures replaced).

4. Security
- New SELECT policy on `copy_requests`: an agent with `perm_manage_clients` can read their own clients' applications.
- Agents still cannot update/delete copy_requests or app_members directly; changes go only through the functions above,
  which check the caller with auth.uid() and the client's agent.
- Linking trading accounts to clients stays with head office.
*/

ALTER TABLE agents ADD COLUMN IF NOT EXISTS perm_manage_clients boolean NOT NULL DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS client_approval boolean NOT NULL DEFAULT false;
GRANT UPDATE (client_approval) ON agents TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_manages_user(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (
  SELECT 1 FROM app_members m JOIN agents a ON a.id = m.agent_id
  WHERE m.user_id = p_user AND m.role = 'client' AND a.id = my_agent_id() AND a.perm_manage_clients) $$;
REVOKE ALL ON FUNCTION public.agent_manages_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_manages_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "agent_select_client_copy_requests" ON copy_requests;
CREATE POLICY "agent_select_client_copy_requests" ON copy_requests FOR SELECT
  TO authenticated USING (agent_manages_user(user_id));

CREATE OR REPLACE FUNCTION public.agent_set_client_status(p_user uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT agent_manages_user(p_user) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_status NOT IN ('active', 'pending') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE app_members SET status = p_status,
    approved_by = CASE WHEN status = 'pending' AND p_status = 'active' THEN auth.uid() ELSE approved_by END
  WHERE user_id = p_user;
END $$;
REVOKE ALL ON FUNCTION public.agent_set_client_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_set_client_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_handle_copy_request(p_id uuid, p_status text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM copy_requests WHERE id = p_id;
  IF v_user IS NULL OR NOT agent_manages_user(v_user) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_status NOT IN ('pending', 'contacted', 'approved', 'rejected') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE copy_requests SET status = p_status, admin_note = left(coalesce(p_note, ''), 1000)
  WHERE id = p_id AND status <> 'cancelled';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_cancellable'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.agent_handle_copy_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_handle_copy_request(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.copy_requests_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  v_staff boolean := is_admin() OR agent_manages_user(OLD.user_id);
BEGIN
  NEW.user_id := OLD.user_id;
  NEW.email := OLD.email;
  NEW.master_account := OLD.master_account;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status AND v_staff THEN
    NEW.handled_by := auth.uid();
  ELSIF NOT v_staff THEN
    NEW.handled_by := OLD.handled_by;
    NEW.admin_note := OLD.admin_note;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.copy_requests_before_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_agent uuid;
  v_status text := 'active';
BEGIN
  PERFORM pg_advisory_xact_lock(7340031);
  IF NOT EXISTS (SELECT 1 FROM app_members) THEN
    INSERT INTO app_members (user_id, email, role, status) VALUES (NEW.id, coalesce(NEW.email, ''), 'admin', 'active')
    ON CONFLICT DO NOTHING;
  ELSE
    SELECT a.id, CASE WHEN a.client_approval AND a.perm_manage_clients THEN 'pending' ELSE 'active' END
      INTO v_agent, v_status
      FROM agents a
      WHERE a.slug = lower(coalesce(NEW.raw_user_meta_data ->> 'agent_slug', ''))
        AND a.status = 'active' AND a.perm_client_signup;
    INSERT INTO app_members (user_id, email, role, status, agent_id)
    VALUES (NEW.id, coalesce(NEW.email, ''), 'client', coalesce(v_status, 'active'), v_agent)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_member() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.admin_update_agent(uuid, text, boolean, boolean, boolean);
CREATE OR REPLACE FUNCTION public.admin_update_agent(
  p_agent uuid, p_status text, p_view_trades boolean, p_view_activity boolean, p_client_signup boolean, p_manage_clients boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE agents SET status = p_status, perm_view_trades = p_view_trades, perm_view_activity = p_view_activity,
    perm_client_signup = p_client_signup, perm_manage_clients = p_manage_clients
  WHERE id = p_agent;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_agent(uuid, text, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_agent(uuid, text, boolean, boolean, boolean, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_approve_agent(uuid, text, boolean, boolean, boolean, text);
CREATE OR REPLACE FUNCTION public.admin_approve_agent(
  p_application uuid, p_slug text, p_view_trades boolean, p_view_activity boolean, p_client_signup boolean,
  p_manage_clients boolean, p_note text DEFAULT '')
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

  INSERT INTO agents (user_id, slug, brand_name, contact, perm_view_trades, perm_view_activity, perm_client_signup, perm_manage_clients)
  VALUES (v_app.user_id, lower(p_slug), v_app.brand_name, v_app.contact, coalesce(p_view_trades, true),
    coalesce(p_view_activity, false), coalesce(p_client_signup, true), coalesce(p_manage_clients, true))
  RETURNING id INTO v_agent;

  UPDATE app_members SET role = 'agent', status = 'active', agent_id = NULL WHERE user_id = v_app.user_id;
  UPDATE agent_applications SET status = 'approved', handled_by = auth.uid(), admin_note = left(coalesce(p_note, ''), 1000)
    WHERE id = p_application;
  RETURN v_agent;
END $$;
REVOKE ALL ON FUNCTION public.admin_approve_agent(uuid, text, boolean, boolean, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_agent(uuid, text, boolean, boolean, boolean, boolean, text) TO authenticated;