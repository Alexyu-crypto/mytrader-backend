/*
# Let agents view their own clients' activity (when permitted)

1. New Functions
- `agent_can_view_actor(p_actor uuid)` returns true when the caller is an ACTIVE agent whose
  `perm_view_activity` flag is on and `p_actor` is one of that agent's clients.
  SECURITY DEFINER with fixed search_path; anon cannot execute it.

2. Security
- New SELECT policy on `activity_log`: "agent_select_client_activity". Agents can read
  log rows only for actors that are their clients, and only if the admin granted the permission.
  Admins keep full access through the existing policy. Nothing becomes writable.
*/

CREATE OR REPLACE FUNCTION public.agent_can_view_actor(p_actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM agents a
    JOIN app_members m ON m.agent_id = a.id
    WHERE a.user_id = auth.uid()
      AND a.status = 'active'
      AND a.perm_view_activity
      AND m.user_id = p_actor
      AND m.role = 'client'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.agent_can_view_actor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_can_view_actor(uuid) TO authenticated;

DROP POLICY IF EXISTS "agent_select_client_activity" ON public.activity_log;
CREATE POLICY "agent_select_client_activity" ON public.activity_log FOR SELECT
  TO authenticated
  USING (actor_id IS NOT NULL AND public.agent_can_view_actor(actor_id));
