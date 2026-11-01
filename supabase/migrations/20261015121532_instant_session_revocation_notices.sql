/*
# Instant forced sign-out notices

1. New Tables
- `session_revocations`: a short-lived notice row written whenever the server ends one or more
  website sign-ins for a user.
  - `id` (bigint, primary key)
  - `user_id` (uuid) - whose sign-ins were ended
  - `created_at` (timestamptz)
  The table is broadcast over Realtime, so a signed-in browser learns instantly that it must
  re-check its sign-in (no more waiting for the periodic check).

2. Modified Functions
- `notify_session_revoked(uuid)` (new helper): writes a notice and prunes notices older than 1 day.
- `claim_login()`: writes a notice after ending the user's other sign-ins (single-login or IP block).
- `enforce_single_login_on_change()`: writes a notice for every user whose extra sign-ins were ended
  when multi-login is switched off.
- `admin_end_user_sessions(uuid)`: writes a notice after an admin ends a user's sign-ins.

3. Security
- RLS enabled. Signed-in users can only SELECT their own notices. No client INSERT/UPDATE/DELETE;
  rows are written only by the SECURITY DEFINER functions above.
- Helper EXECUTE revoked from public, anon and authenticated.
*/

CREATE TABLE IF NOT EXISTS public.session_revocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_revocations_user_idx ON public.session_revocations (user_id);

ALTER TABLE public.session_revocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_session_revocations" ON public.session_revocations;
CREATE POLICY "select_own_session_revocations" ON public.session_revocations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'session_revocations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.session_revocations;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_session_revoked(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM session_revocations WHERE created_at < now() - interval '1 day';
  INSERT INTO session_revocations (user_id) VALUES (p_user);
$$;
REVOKE ALL ON FUNCTION public.notify_session_revoked(uuid) FROM public, anon, authenticated;

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
  IF v_sid IS NOT NULL AND NOT coalesce((SELECT allow_multi_login FROM app_settings LIMIT 1), true) THEN
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

CREATE OR REPLACE FUNCTION public.admin_end_user_sessions(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user;
  PERFORM notify_session_revoked(p_user);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_end_user_sessions(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_end_user_sessions(uuid) TO service_role;
