/*
# Login IP log + IP allow list / block list

1. New Tables
- `login_events`: one row per website sign-in.
  - `id` (uuid PK), `user_id` (uuid, auth user), `email` (text), `ip` (text, detected from the request),
    `user_agent` (text), `result` ('ok' | 'ip_blocked'), `created_at`.
- `ip_access_rules`: IP allow list and block list.
  - `id` (uuid PK), `cidr` (cidr; a single IP like 1.2.3.4 or a range like 1.2.3.0/24),
    `list` ('allow' | 'deny'), `note` (text), `created_by` (uuid, default auth.uid()), `created_at`.
  - Unique on (cidr, list).

2. Modified Tables
- `app_settings.ip_whitelist_enabled` (boolean, default false): when true, only IPs on the allow list may sign in.

3. Functions
- `request_ip()` internal helper: caller IP from request headers (not callable by clients).
- `login_access_check(uid)` internal: 'ok' | 'ip_blocked'. Full admins are always allowed (prevents lockout).
  Block list always applies to everyone else; allow list only when `ip_whitelist_enabled`.
- `claim_login()` now returns text and records a `login_events` row. If the IP is blocked, every session of
  the caller is ended and 'ip_blocked' is returned. Otherwise, when multi-login is off, the caller's other
  sessions are ended. Returns 'ok'.
- `login_still_valid()` now returns text: 'ok' | 'replaced' (session ended elsewhere) | 'ip_blocked'.
- `my_ip()`: returns the caller's current IP (to help admins add themselves to the allow list).

4. Security
- RLS enabled on both tables.
- `login_events`: only full admins can read. No client insert/update/delete (written only by claim_login).
- `ip_access_rules`: only full admins can select/insert/update/delete.
- Functions run on the caller's own user id / session id only; EXECUTE revoked from anon.

5. Notes
1. Defaults keep today's behaviour: block list empty, allow list off.
*/

SET LOCAL lock_timeout = '5s';

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ip_whitelist_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  result text NOT NULL DEFAULT 'ok' CHECK (result IN ('ok', 'ip_blocked')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_events_created_idx ON login_events (created_at DESC);
CREATE INDEX IF NOT EXISTS login_events_user_idx ON login_events (user_id, created_at DESC);
ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_login_events" ON login_events;
CREATE POLICY "admins_select_login_events" ON login_events FOR SELECT TO authenticated USING (is_admin());

CREATE TABLE IF NOT EXISTS ip_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr cidr NOT NULL,
  list text NOT NULL CHECK (list IN ('allow', 'deny')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cidr, list)
);
ALTER TABLE ip_access_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_ip_rules" ON ip_access_rules;
CREATE POLICY "admins_select_ip_rules" ON ip_access_rules FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admins_insert_ip_rules" ON ip_access_rules;
CREATE POLICY "admins_insert_ip_rules" ON ip_access_rules FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admins_update_ip_rules" ON ip_access_rules;
CREATE POLICY "admins_update_ip_rules" ON ip_access_rules FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "admins_delete_ip_rules" ON ip_access_rules;
CREATE POLICY "admins_delete_ip_rules" ON ip_access_rules FOR DELETE TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION public.request_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE v_headers json; v_raw text;
BEGIN
  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_raw := coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-real-ip', split_part(v_headers->>'x-forwarded-for', ',', 1));
    RETURN host(trim(v_raw)::inet);
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.request_ip() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.login_access_check(p_uid uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ip inet;
BEGIN
  IF EXISTS (SELECT 1 FROM app_members WHERE user_id = p_uid AND role = 'admin' AND status = 'active') THEN
    RETURN 'ok';
  END IF;
  BEGIN
    v_ip := request_ip()::inet;
  EXCEPTION WHEN others THEN v_ip := NULL;
  END;
  IF v_ip IS NOT NULL AND EXISTS (SELECT 1 FROM ip_access_rules WHERE list = 'deny' AND v_ip <<= cidr) THEN
    RETURN 'ip_blocked';
  END IF;
  IF coalesce((SELECT ip_whitelist_enabled FROM app_settings LIMIT 1), false)
     AND (v_ip IS NULL OR NOT EXISTS (SELECT 1 FROM ip_access_rules WHERE list = 'allow' AND v_ip <<= cidr)) THEN
    RETURN 'ip_blocked';
  END IF;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.login_access_check(uuid) FROM public, anon, authenticated;

DROP FUNCTION IF EXISTS public.claim_login();
CREATE FUNCTION public.claim_login()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_result text;
  v_ua text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'ok';
  END IF;
  v_result := login_access_check(v_uid);
  BEGIN
    v_ua := left(coalesce(nullif(current_setting('request.headers', true), '')::json->>'user-agent', ''), 300);
  EXCEPTION WHEN others THEN v_ua := '';
  END;
  INSERT INTO login_events (user_id, email, ip, user_agent, result)
  VALUES (v_uid, coalesce(auth.jwt() ->> 'email', ''), coalesce(request_ip(), ''), v_ua, v_result);

  IF v_result = 'ip_blocked' THEN
    DELETE FROM auth.sessions WHERE user_id = v_uid;
    RETURN 'ip_blocked';
  END IF;
  IF v_sid IS NOT NULL AND NOT coalesce((SELECT allow_multi_login FROM app_settings LIMIT 1), true) THEN
    DELETE FROM auth.sessions WHERE user_id = v_uid AND id <> v_sid;
  END IF;
  RETURN 'ok';
END;
$$;

DROP FUNCTION IF EXISTS public.login_still_valid();
CREATE FUNCTION public.login_still_valid()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'ok';
  END IF;
  IF login_access_check(v_uid) = 'ip_blocked' THEN
    DELETE FROM auth.sessions WHERE user_id = v_uid AND id = v_sid;
    RETURN 'ip_blocked';
  END IF;
  IF v_sid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id = v_sid AND user_id = v_uid) THEN
    RETURN 'replaced';
  END IF;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.my_ip()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT request_ip() $$;

REVOKE ALL ON FUNCTION public.claim_login() FROM public, anon;
REVOKE ALL ON FUNCTION public.login_still_valid() FROM public, anon;
REVOKE ALL ON FUNCTION public.my_ip() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.login_still_valid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_ip() TO authenticated;
