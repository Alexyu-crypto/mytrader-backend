/*
# Public read of an agent's membership plans (for per-plan share links)

1. New Functions
- `agent_public_membership(p_slug text)`: returns title, subtitle, join_note and plans of an
  active agent's membership page, only when the agent has the page switched on.
  Used by the public "single plan" share page so visitors who are not signed in can see the plan.

2. Security
- SECURITY DEFINER, read-only, returns only the public pricing fields (no agent ids).
- Callable by anon and authenticated, because pricing is intentionally public marketing content.
- The underlying table keeps its existing RLS and grants unchanged.
*/

CREATE OR REPLACE FUNCTION agent_public_membership(p_slug text)
RETURNS TABLE(title text, subtitle text, join_note text, plans jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT p.title, p.subtitle, p.join_note, p.plans
FROM agents a
JOIN app_members m ON m.user_id = a.user_id
JOIN agent_membership_pages p ON p.agent_id = a.id
WHERE a.slug = lower(p_slug) AND a.status = 'active' AND m.role = 'agent' AND m.status = 'active'
  AND p.enabled AND jsonb_array_length(p.plans) > 0;
$$;

REVOKE EXECUTE ON FUNCTION agent_public_membership(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agent_public_membership(text) TO anon, authenticated;
