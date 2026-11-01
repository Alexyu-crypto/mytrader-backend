/*
# Reconnect button: ask the VPS to restart one account's MT terminal

1. Modified Tables
- `accounts`
  - `reconnect_requested_at` (timestamptz, nullable): set when staff press the reconnect button; cleared once the VPS control program picks it up.

2. New function
- `request_reconnect(p_account text)`: marks the account so its VPS restarts the MT terminal on the next check-in. Returns the request time.

3. Security
- SECURITY DEFINER with fixed search_path; only staff passing `can_operate()` may call it.
- EXECUTE revoked from public/anon, granted to authenticated only.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reconnect_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.request_reconnect(p_account text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_at timestamptz := now();
BEGIN
  IF NOT can_operate() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE accounts SET reconnect_requested_at = v_at WHERE account_name = p_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found';
  END IF;
  INSERT INTO engine_log(message) VALUES (format('Reconnect requested: %s', p_account));
  RETURN v_at;
END $$;

REVOKE ALL ON FUNCTION public.request_reconnect(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_reconnect(text) TO authenticated;
