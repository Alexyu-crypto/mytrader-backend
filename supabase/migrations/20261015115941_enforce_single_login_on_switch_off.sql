/*
# Enforce single login immediately when multi-login is switched off

1. Changes
- New trigger function `enforce_single_login_on_change()` on `app_settings`.
- When `allow_multi_login` changes from true to false, every user keeps only their most
  recent sign-in session; all older sessions are removed right away.
  Devices holding a removed session are signed out by the site's periodic login check.

2. Security
- Trigger function is SECURITY DEFINER (needs access to auth.sessions); it is not callable
  directly by clients. EXECUTE is revoked from public, anon and authenticated.
- Only users already allowed to update app_settings (operators) can trigger it.

3. Notes
- Turning multi-login back on does nothing to existing sessions.
*/

CREATE OR REPLACE FUNCTION public.enforce_single_login_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  IF coalesce(OLD.allow_multi_login, true) AND NOT coalesce(NEW.allow_multi_login, true) THEN
    DELETE FROM auth.sessions s
    USING (
      SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
      FROM auth.sessions
    ) ranked
    WHERE s.id = ranked.id AND ranked.rn > 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_single_login_on_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_single_login_on_change ON public.app_settings;
CREATE TRIGGER enforce_single_login_on_change
AFTER UPDATE OF allow_multi_login ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_login_on_change();