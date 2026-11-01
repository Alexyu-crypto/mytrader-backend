/*
# Add ea_prune_positions (POST replacement for the bridge's DELETE)

Some MT4 builds (e.g. FxPro) reject WebRequest DELETE with error 4029, which
stalled the bridge before its heartbeat ever ran. This function lets the MT4
bridge remove positions that are no longer open via a plain POST.

1. New function
- `ea_prune_positions(p_account_name text, p_open_tickets bigint[])`
  deletes rows in `live_positions` for that account whose ticket is not in
  the list (empty list = remove all). Returns number of rows removed.
2. Security
- SECURITY DEFINER, but raises 42501 unless the caller's bridge key is valid
  for the account (`bridge_key_ok`), same rule as the existing DELETE policy.
- EXECUTE granted to anon and authenticated only (the EA uses the anon key).
*/

CREATE OR REPLACE FUNCTION public.ea_prune_positions(p_account_name text, p_open_tickets bigint[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  IF NOT bridge_key_ok(p_account_name) THEN
    RAISE EXCEPTION 'bridge key rejected' USING ERRCODE = '42501';
  END IF;
  DELETE FROM live_positions
  WHERE account_name = p_account_name
    AND NOT (ticket = ANY (coalesce(p_open_tickets, '{}'::bigint[])));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.ea_prune_positions(text, bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ea_prune_positions(text, bigint[]) TO anon, authenticated;
