/*
# Copy requests: only record admins as handlers

1. Modified Functions
- `copy_requests_before_update()`: `handled_by` is only set when a full admin changes the
  status, so an applicant cancelling their own request is not recorded as the handler.
*/

CREATE OR REPLACE FUNCTION public.copy_requests_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.user_id := OLD.user_id;
  NEW.email := OLD.email;
  NEW.master_account := OLD.master_account;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status AND is_admin() THEN
    NEW.handled_by := auth.uid();
  ELSIF NOT is_admin() THEN
    NEW.handled_by := OLD.handled_by;
    NEW.admin_note := OLD.admin_note;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.copy_requests_before_update() FROM PUBLIC, anon, authenticated;