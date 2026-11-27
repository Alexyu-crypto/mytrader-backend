/*
# Per-agent membership pricing page (代理商會員收費頁)

Each agent can design their own "Membership 會員收費" page. Their clients see the
agent's version; everyone else (and agents who switch it off) sees the default plans.

1. New Tables
- `agent_membership_pages` (one row per agent)
  - `agent_id` uuid PK -> agents(id), cascade delete
  - `enabled` boolean: show this custom page to the agent's clients
  - `title`, `subtitle`, `join_note` text: page heading, intro and "how to join" text
  - `plans` jsonb: array of plans {name, zh, audience, price, period, features[], highlight}
  - `updated_at` timestamptz

2. Functions
- `save_agent_membership_page(p_enabled, p_title, p_subtitle, p_join_note, p_plans)`:
  the signed-in active agent saves their own page. Validates and normalises every field
  (max 6 plans, max 12 features each, length limits, price 0-100000).

3. Security
- RLS enabled. SELECT: the owning agent, clients assigned to that agent, or admins.
- No direct INSERT/UPDATE/DELETE (policies are false, no grants); writes go through the function.
*/

CREATE TABLE IF NOT EXISTS agent_membership_pages (
  agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  join_note text NOT NULL DEFAULT '',
  plans jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_membership_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_membership_pages FROM anon, authenticated;
GRANT SELECT ON agent_membership_pages TO authenticated;

DROP POLICY IF EXISTS "read_agent_membership_page" ON agent_membership_pages;
CREATE POLICY "read_agent_membership_page" ON agent_membership_pages FOR SELECT TO authenticated
USING (
  agent_id = my_agent_id()
  OR agent_id = (SELECT m.agent_id FROM app_members m WHERE m.user_id = auth.uid())
  OR is_admin()
);
DROP POLICY IF EXISTS "no_direct_insert_agent_membership_page" ON agent_membership_pages;
CREATE POLICY "no_direct_insert_agent_membership_page" ON agent_membership_pages FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "no_direct_update_agent_membership_page" ON agent_membership_pages;
CREATE POLICY "no_direct_update_agent_membership_page" ON agent_membership_pages FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "no_direct_delete_agent_membership_page" ON agent_membership_pages;
CREATE POLICY "no_direct_delete_agent_membership_page" ON agent_membership_pages FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION save_agent_membership_page(
  p_enabled boolean, p_title text, p_subtitle text, p_join_note text, p_plans jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent uuid := my_agent_id();
  v_plans jsonb := '[]'::jsonb;
  p jsonb;
  f jsonb;
  v_features jsonb;
  v_name text;
  v_price numeric;
BEGIN
  IF v_agent IS NULL THEN RAISE EXCEPTION 'not_allowed'; END IF;
  p_title := btrim(coalesce(p_title, ''));
  p_subtitle := btrim(coalesce(p_subtitle, ''));
  p_join_note := btrim(coalesce(p_join_note, ''));
  IF length(p_title) > 80 OR length(p_subtitle) > 300 OR length(p_join_note) > 600 THEN RAISE EXCEPTION 'text_too_long'; END IF;
  IF p_plans IS NULL OR jsonb_typeof(p_plans) <> 'array' THEN RAISE EXCEPTION 'invalid_plans'; END IF;
  IF jsonb_array_length(p_plans) > 6 THEN RAISE EXCEPTION 'too_many_plans'; END IF;
  IF coalesce(p_enabled, false) AND jsonb_array_length(p_plans) = 0 THEN RAISE EXCEPTION 'no_plans'; END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(p_plans) LOOP
    IF jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'invalid_plans'; END IF;
    v_name := btrim(coalesce(p->>'name', ''));
    IF length(v_name) = 0 OR length(v_name) > 40 THEN RAISE EXCEPTION 'invalid_plan_name'; END IF;
    IF length(coalesce(p->>'zh','')) > 40 OR length(coalesce(p->>'audience','')) > 200 OR length(coalesce(p->>'period','')) > 40
    THEN RAISE EXCEPTION 'text_too_long'; END IF;
    IF coalesce(p->>'price','') !~ '^\d{1,6}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_price'; END IF;
    v_price := (p->>'price')::numeric;
    IF v_price > 100000 THEN RAISE EXCEPTION 'invalid_price'; END IF;
    IF jsonb_typeof(coalesce(p->'features', '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p->'features', '[]'::jsonb)) > 12
    THEN RAISE EXCEPTION 'too_many_features'; END IF;
    v_features := '[]'::jsonb;
    FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p->'features', '[]'::jsonb)) LOOP
      IF jsonb_typeof(f) <> 'string' OR length(btrim(f #>> '{}')) > 120 THEN RAISE EXCEPTION 'text_too_long'; END IF;
      IF length(btrim(f #>> '{}')) > 0 THEN v_features := v_features || to_jsonb(btrim(f #>> '{}')); END IF;
    END LOOP;
    v_plans := v_plans || jsonb_build_object(
      'name', v_name,
      'zh', btrim(coalesce(p->>'zh', '')),
      'audience', btrim(coalesce(p->>'audience', '')),
      'price', v_price,
      'period', btrim(coalesce(p->>'period', '')),
      'features', v_features,
      'highlight', coalesce((p->>'highlight')::boolean, false));
  END LOOP;

  INSERT INTO agent_membership_pages (agent_id, enabled, title, subtitle, join_note, plans, updated_at)
  VALUES (v_agent, coalesce(p_enabled, false), p_title, p_subtitle, p_join_note, v_plans, now())
  ON CONFLICT (agent_id) DO UPDATE SET enabled = EXCLUDED.enabled, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
    join_note = EXCLUDED.join_note, plans = EXCLUDED.plans, updated_at = now();
END $$;

REVOKE EXECUTE ON FUNCTION save_agent_membership_page(boolean, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_agent_membership_page(boolean, text, text, text, jsonb) TO authenticated;
