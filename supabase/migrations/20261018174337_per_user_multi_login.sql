/*
# Per-user multi-login exception

When the global "Allow multi-login" setting is OFF, admins can still let chosen users
stay signed in on several devices at the same time.

1. Modified Tables
- `app_members`
  - `allow_multi_login` (boolean, not null, default false): this user may stay signed in
    on several devices even when multi-login is switched off for everyone else.

2. New Functions
- `admin_set_multi_login(p_user uuid, p_on boolean)` SECURITY DEFINER
  - Only full admins (`is_admin()`).

3. Modified Functions
- `claim_login()`: skips removing other sessions for users with the exception.
- `enforce_single_login_on_change()`: same skip when the global switch is turned off.

4. Security
- `app_members` has no INSERT/UPDATE policy, so users cannot set the flag on themselves;
  only the admin-checked function can change it.
- EXECUTE on the new function revoked from PUBLIC/anon, granted to authenticated.
*/

ALTER TABLE app_members ADD COLUMN IF NOT EXISTS allow_multi_login boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_set_multi_login(p_user uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE app_members SET allow_multi_login = p_on WHERE user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_multi_login(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_multi_login(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_login()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
v_uid uuid := auth.uid();
v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
v_result text;
v_ua text;
v_removed int;
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
PERFORM notify_session_revoked(v_uid);
RETURN 'ip_blocked';
END IF;
IF v_sid IS NOT NULL
   AND NOT coalesce((SELECT allow_multi_login FROM app_settings LIMIT 1), true)
   AND NOT coalesce((SELECT allow_multi_login FROM app_members WHERE user_id = v_uid), false) THEN
DELETE FROM auth.sessions WHERE user_id = v_uid AND id <> v_sid;
GET DIAGNOSTICS v_removed = ROW_COUNT;
IF v_removed > 0 THEN
PERFORM notify_session_revoked(v_uid);
END IF;
END IF;
RETURN 'ok';
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_single_login_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
v_user uuid;
BEGIN
IF coalesce(OLD.allow_multi_login, true) AND NOT coalesce(NEW.allow_multi_login, true) THEN
FOR v_user IN
WITH ranked AS (
SELECT id, user_id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
FROM auth.sessions
WHERE user_id NOT IN (SELECT user_id FROM app_members WHERE allow_multi_login)
), removed AS (
DELETE FROM auth.sessions s USING ranked
WHERE s.id = ranked.id AND ranked.rn > 1
RETURNING s.user_id
)
SELECT DISTINCT user_id FROM removed
LOOP
PERFORM notify_session_revoked(v_user);
END LOOP;
END IF;
RETURN NEW;
END;
$function$;
