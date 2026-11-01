/*
# New sign-ups become active clients automatically

1. Modified Functions
- `handle_new_member()`: the very first user still becomes an active full admin.
  Every later sign-up is now created as an active 'client' (Signals page only)
  instead of a pending viewer, so no manual approval is needed.

2. Modified Tables
- `app_members.role` default changed to 'client'.

3. Notes
1. Existing members are not changed. A full admin can still raise a client to
   viewer, trader or admin on the user management page.
2. Clients cannot change anything: `can_operate()` remains admin/trader only.
*/

ALTER TABLE app_members ALTER COLUMN role SET DEFAULT 'client';

CREATE OR REPLACE FUNCTION public.handle_new_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7340031);
  IF NOT EXISTS (SELECT 1 FROM app_members) THEN
    INSERT INTO app_members (user_id, email, role, status) VALUES (NEW.id, coalesce(NEW.email, ''), 'admin', 'active')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO app_members (user_id, email, role, status) VALUES (NEW.id, coalesce(NEW.email, ''), 'client', 'active')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_member() FROM PUBLIC, anon, authenticated;