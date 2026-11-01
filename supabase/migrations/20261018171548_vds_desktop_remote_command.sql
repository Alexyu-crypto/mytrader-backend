/*
# Remote desktop commands for VDS (重新排位 / NEXT PAGE)

Lets an operator press "重新排位" (arrange MT windows) or "NEXT PAGE" (show the next
page of MT windows) on the website, instead of clicking the desktop shortcuts on the
VDS, which are often hidden behind the MT windows.

1. Modified Tables
- `terminal_installations`
  - `desktop_command` (text, nullable): 'arrange' or 'nextpage'. Latest request only.
  - `desktop_command_at` (timestamptz, nullable): when the operator pressed the button.
  - `desktop_command_picked_at` (timestamptz, nullable): when the VDS received and ran it.

2. New Functions
- `request_desktop_command(p_ids uuid[], p_command text)` SECURITY DEFINER
  - Only callers passing `can_operate()`.
  - Stores the command on every listed installation that is still on a PC.
  - Returns the number of installations updated.

3. Security
- EXECUTE revoked from PUBLIC/anon, granted to authenticated; operator check inside.
- No RLS policy changes.

4. Notes
1. The VDS hands the command over through the existing installer edge function and
   ignores requests older than 3 minutes.
*/

ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS desktop_command text;
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS desktop_command_at timestamptz;
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS desktop_command_picked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terminal_installations_desktop_command_check') THEN
    ALTER TABLE terminal_installations
      ADD CONSTRAINT terminal_installations_desktop_command_check
      CHECK (desktop_command IS NULL OR desktop_command IN ('arrange', 'nextpage'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_desktop_command(p_ids uuid[], p_command text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
     SET desktop_command = p_command, desktop_command_at = now(), desktop_command_picked_at = NULL
   WHERE id = ANY(p_ids) AND status <> 'uninstalled';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.request_desktop_command(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_desktop_command(uuid[], text) TO authenticated;
