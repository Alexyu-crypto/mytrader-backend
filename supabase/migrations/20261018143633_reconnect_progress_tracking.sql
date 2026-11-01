/*
# Track each step of a reconnect request so staff can see success or failure

1. Modified Tables
- `accounts`
  - `reconnect_picked_at` (timestamptz): when the VPS control program received the latest reconnect request.
  - `reconnect_done_at` (timestamptz): when the VPS confirmed it restarted the MT terminal.

2. Notes
1. `reconnect_requested_at` is no longer cleared on pickup; a request is pending while it is newer than `reconnect_picked_at`.
2. Success = the account reports in again after `reconnect_done_at`. The website works out each state from these three times.
3. A new request clears the previous done time so old results are not shown.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reconnect_picked_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reconnect_done_at timestamptz;

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
  UPDATE accounts SET reconnect_requested_at = v_at, reconnect_picked_at = NULL, reconnect_done_at = NULL
  WHERE account_name = p_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found';
  END IF;
  INSERT INTO engine_log(message) VALUES (format('Reconnect requested: %s', p_account));
  RETURN v_at;
END $$;

REVOKE ALL ON FUNCTION public.request_reconnect(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_reconnect(text) TO authenticated;
