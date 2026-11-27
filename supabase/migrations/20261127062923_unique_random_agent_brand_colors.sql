/*
# Unique random brand colour per agent

1. Overview
- Every agent web page must have its own main colour; layouts stay the same.
- New agents automatically get a random colour that is clearly different from every other agent
  and never in the cyan/teal/sky family used by the main site.
- Agents may still change their colour, but the database rejects a colour that is too close to
  another agent's colour, belongs to the main-site cyan family, or is too grey/dark/light.

2. New functions
- `brand_color_hsl(hex)` -> numeric[] {hue 0-360, saturation 0-1, lightness 0-1} (internal helper).
- `hsl_to_brand_color(h, s, l)` -> '#rrggbb' (internal helper).
- `brand_color_problem(hex, exclude_agent)` -> null when OK, otherwise 'color_main', 'color_dull' or 'color_taken'.
- `random_agent_brand_color(exclude_agent)` -> a free random colour (avoids cyan and violet hues).
- `suggest_agent_brand_color()` RPC for agents/admins to get a new random colour.

3. Triggers on `agents`
- BEFORE INSERT: always assigns a random unique colour.
- BEFORE UPDATE OF brand_color: validates the new colour, raising one of the codes above.

4. Data
- Existing agents whose colour clashes with an earlier agent or the main site are re-coloured randomly.

5. Security
- Helper functions are not callable by anon/authenticated; only `suggest_agent_brand_color` is granted to authenticated.
*/

CREATE OR REPLACE FUNCTION public.brand_color_hsl(p_hex text)
RETURNS numeric[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r numeric := ('x' || substr(p_hex, 2, 2))::bit(8)::int / 255.0;
  g numeric := ('x' || substr(p_hex, 4, 2))::bit(8)::int / 255.0;
  b numeric := ('x' || substr(p_hex, 6, 2))::bit(8)::int / 255.0;
  mx numeric := greatest(r, g, b);
  mn numeric := least(r, g, b);
  d numeric := mx - mn;
  h numeric := 0;
  s numeric := 0;
  l numeric := (mx + mn) / 2;
BEGIN
  IF d > 0 THEN
    s := d / (1 - abs(2 * l - 1));
    IF mx = r THEN h := 60 * mod((g - b) / d + 6, 6);
    ELSIF mx = g THEN h := 60 * ((b - r) / d + 2);
    ELSE h := 60 * ((r - g) / d + 4);
    END IF;
  END IF;
  RETURN ARRAY[h, s, l];
END;
$$;

CREATE OR REPLACE FUNCTION public.hsl_to_brand_color(p_h numeric, p_s numeric, p_l numeric)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  c numeric := (1 - abs(2 * p_l - 1)) * p_s;
  x numeric := c * (1 - abs(mod(p_h / 60, 2) - 1));
  m numeric := p_l - c / 2;
  r numeric; g numeric; b numeric;
BEGIN
  IF p_h < 60 THEN r := c; g := x; b := 0;
  ELSIF p_h < 120 THEN r := x; g := c; b := 0;
  ELSIF p_h < 180 THEN r := 0; g := c; b := x;
  ELSIF p_h < 240 THEN r := 0; g := x; b := c;
  ELSIF p_h < 300 THEN r := x; g := 0; b := c;
  ELSE r := c; g := 0; b := x;
  END IF;
  RETURN '#' || lpad(to_hex(round((r + m) * 255)::int), 2, '0')
             || lpad(to_hex(round((g + m) * 255)::int), 2, '0')
             || lpad(to_hex(round((b + m) * 255)::int), 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.brand_color_problem(p_hex text, p_exclude uuid)
RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric[];
BEGIN
  IF p_hex IS NULL OR p_hex !~ '^#[0-9a-fA-F]{6}$' THEN
    RETURN 'color_dull';
  END IF;
  v := brand_color_hsl(lower(p_hex));
  IF v[2] < 0.35 OR v[3] < 0.35 OR v[3] > 0.75 THEN
    RETURN 'color_dull';
  END IF;
  IF v[1] >= 160 AND v[1] <= 220 THEN
    RETURN 'color_main';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM agents a, LATERAL (SELECT brand_color_hsl(lower(a.brand_color)) AS o) x
    WHERE a.id IS DISTINCT FROM p_exclude
      AND least(abs(x.o[1] - v[1]), 360 - abs(x.o[1] - v[1])) < 15
      AND abs(x.o[3] - v[3]) < 0.12
  ) THEN
    RETURN 'color_taken';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.random_agent_brand_color(p_exclude uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h numeric;
  cand text;
  i int;
BEGIN
  FOR i IN 1..400 LOOP
    LOOP
      h := floor(random()::numeric * 360);
      EXIT WHEN NOT (h BETWEEN 155 AND 225) AND NOT (h BETWEEN 245 AND 295);
    END LOOP;
    cand := hsl_to_brand_color(h, 0.65 + random()::numeric * 0.25, 0.45 + random()::numeric * 0.2);
    IF brand_color_problem(cand, p_exclude) IS NULL THEN
      RETURN cand;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'no_free_color';
END;
$$;

CREATE OR REPLACE FUNCTION public.suggest_agent_brand_color()
RETURNS text
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF my_agent_id() IS NULL AND NOT is_admin() THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  RETURN random_agent_brand_color(my_agent_id());
END;
$$;

CREATE OR REPLACE FUNCTION public.agents_brand_color_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_problem text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agents_brand_color'));
  IF TG_OP = 'INSERT' THEN
    NEW.brand_color := random_agent_brand_color(NEW.id);
    RETURN NEW;
  END IF;
  IF lower(NEW.brand_color) IS DISTINCT FROM lower(OLD.brand_color) THEN
    NEW.brand_color := lower(NEW.brand_color);
    v_problem := brand_color_problem(NEW.brand_color, NEW.id);
    IF v_problem IS NOT NULL THEN
      RAISE EXCEPTION '%', v_problem;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agents_brand_color_insert ON agents;
CREATE TRIGGER trg_agents_brand_color_insert
BEFORE INSERT ON agents
FOR EACH ROW EXECUTE FUNCTION agents_brand_color_guard();

DROP TRIGGER IF EXISTS trg_agents_brand_color_update ON agents;
CREATE TRIGGER trg_agents_brand_color_update
BEFORE UPDATE OF brand_color ON agents
FOR EACH ROW EXECUTE FUNCTION agents_brand_color_guard();

REVOKE EXECUTE ON FUNCTION public.brand_color_hsl(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hsl_to_brand_color(numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.brand_color_problem(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.random_agent_brand_color(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agents_brand_color_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suggest_agent_brand_color() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_agent_brand_color() TO authenticated;

DO $$
DECLARE
  r record;
  v_problem text;
  v_earlier_clash boolean;
BEGIN
  FOR r IN SELECT id, brand_color, created_at FROM agents ORDER BY created_at LOOP
    v_problem := brand_color_problem(r.brand_color, r.id);
    IF v_problem = 'color_taken' THEN
      SELECT EXISTS (
        SELECT 1 FROM agents a, LATERAL (SELECT brand_color_hsl(lower(a.brand_color)) o, brand_color_hsl(lower(r.brand_color)) v) x
        WHERE a.id <> r.id
          AND a.created_at <= r.created_at
          AND least(abs(x.o[1] - x.v[1]), 360 - abs(x.o[1] - x.v[1])) < 15
          AND abs(x.o[3] - x.v[3]) < 0.12
      ) INTO v_earlier_clash;
      IF v_earlier_clash THEN
        UPDATE agents SET brand_color = random_agent_brand_color(r.id) WHERE id = r.id;
      END IF;
    ELSIF v_problem IS NOT NULL THEN
      UPDATE agents SET brand_color = random_agent_brand_color(r.id) WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
