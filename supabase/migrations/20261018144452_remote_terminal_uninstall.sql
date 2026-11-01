/*
# Remote uninstall of VPS terminal installations

Lets an operator ask a VPS to remove an installed group of MT terminals (with the EA)
from the website, instead of logging in to the PC and clicking the Uninstall shortcut.

1. Modified Tables
- `terminal_installations`
  - `uninstall_requested_at` (timestamptz, nullable): when an operator asked for remote removal. NULL = no request.
  - `uninstall_picked_at` (timestamptz, nullable): when the VPS received the request and started removing.

2. New Functions
- `set_remote_uninstall(p_id uuid, p_on boolean)` SECURITY DEFINER
  - Only callers passing `can_operate()`.
  - p_on = true: records a new request (clears picked time). Only for installations that are not already uninstalled.
  - p_on = false: cancels a request the VPS has not picked up yet.
  - Writes a line to `engine_log`.

3. Security
- EXECUTE revoked from PUBLIC/anon, granted to authenticated only; operator check is inside the function.
- No RLS policy changes.

4. Notes
1. The VPS checks every 2-5 minutes; when it finishes it reports status `uninstalled` through the existing report action.
*/

ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS uninstall_requested_at timestamptz;
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS uninstall_picked_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_remote_uninstall(p_id uuid, p_on boolean)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_at timestamptz := now();
  v_name text;
BEGIN
  IF NOT can_operate() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF p_on THEN
    UPDATE terminal_installations
       SET uninstall_requested_at = v_at, uninstall_picked_at = NULL
     WHERE id = p_id AND status <> 'uninstalled'
     RETURNING coalesce(machine_name, group_name) INTO v_name;
  ELSE
    UPDATE terminal_installations
       SET uninstall_requested_at = NULL
     WHERE id = p_id AND uninstall_picked_at IS NULL
     RETURNING coalesce(machine_name, group_name) INTO v_name;
    v_at := NULL;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'installation not available';
  END IF;
  INSERT INTO engine_log(message)
  VALUES (format('Remote uninstall %s: %s', CASE WHEN p_on THEN 'requested' ELSE 'cancelled' END, v_name));
  RETURN v_at;
END $$;

REVOKE ALL ON FUNCTION public.set_remote_uninstall(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_remote_uninstall(uuid, boolean) TO authenticated;
