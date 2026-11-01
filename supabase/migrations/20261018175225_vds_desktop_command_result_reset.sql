/*
# Clear the previous window-command result on each new request

1. Changes
- `request_desktop_command` now also clears `desktop_command_result`, so the card shows only the
  answer to the latest button press.
2. Security
- Unchanged: still requires can_operate().
*/
CREATE OR REPLACE FUNCTION public.request_desktop_command(p_ids uuid[], p_command text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_count integer;
BEGIN
IF NOT can_operate() THEN
RAISE EXCEPTION 'not allowed';
END IF;
IF p_command NOT IN ('arrange', 'nextpage') THEN
RAISE EXCEPTION 'unknown command';
END IF;
UPDATE terminal_installations
SET desktop_command = p_command, desktop_command_at = now(), desktop_command_picked_at = NULL, desktop_command_result = NULL
WHERE id = ANY(p_ids) AND status <> 'uninstalled';
GET DIAGNOSTICS v_count = ROW_COUNT;
RETURN v_count;
END $function$;
