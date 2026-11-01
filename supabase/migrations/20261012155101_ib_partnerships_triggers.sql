/*
# IB partnership housekeeping triggers

1. `ib_events`: author email is always set from the signed-in session (cannot be typed in by the client).
2. `ib_brokers`: `updated_at` refreshes on every change.
3. `ib_portal_secrets`: `updated_at` / `updated_by` refresh on every change.
*/

CREATE OR REPLACE FUNCTION public.ib_events_stamp_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  NEW.actor_id := auth.uid();
  NEW.actor_email := coalesce(auth.jwt() ->> 'email', '');
  NEW.created_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ib_events_stamp_author() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ib_events_stamp_author ON ib_events;
CREATE TRIGGER ib_events_stamp_author BEFORE INSERT ON ib_events FOR EACH ROW EXECUTE FUNCTION ib_events_stamp_author();

CREATE OR REPLACE FUNCTION public.ib_touch_updated()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ib_brokers_touch ON ib_brokers;
CREATE TRIGGER ib_brokers_touch BEFORE UPDATE ON ib_brokers FOR EACH ROW EXECUTE FUNCTION ib_touch_updated();

CREATE OR REPLACE FUNCTION public.ib_secrets_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ib_secrets_touch ON ib_portal_secrets;
CREATE TRIGGER ib_secrets_touch BEFORE INSERT OR UPDATE ON ib_portal_secrets FOR EACH ROW EXECUTE FUNCTION ib_secrets_touch();
