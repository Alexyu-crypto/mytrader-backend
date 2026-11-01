/*
# Auto-detect each MT terminal's public IP (refreshed hourly)

1. Modified Tables
- `account_credentials`
  - `detected_ip` (text, optional): public IP address the account's EA connects from,
    captured automatically from the EA heartbeat request.
  - `detected_ip_at` (timestamptz, optional): when that IP was last checked.

2. Modified Functions
- `ea_heartbeat` now also reads the caller's IP from the request headers and stores it in
  `account_credentials`, at most once per hour per account (or immediately when the IP changes).
  Creates the credentials row if the account has none yet (password left empty).

3. Security
- No policy changes: `account_credentials` stays readable only by active admin/trader members.
- The EA (anon) never reads this table; the heartbeat function writes it server-side.
- Invalid header values are ignored (must parse as an IP address).
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_credentials' AND column_name = 'detected_ip') THEN
    ALTER TABLE account_credentials ADD COLUMN detected_ip text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_credentials' AND column_name = 'detected_ip_at') THEN
    ALTER TABLE account_credentials ADD COLUMN detected_ip_at timestamptz;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ea_heartbeat(p_account_name text, p_balance double precision, p_equity double precision)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_headers json;
  v_raw text;
  v_ip text;
BEGIN
  UPDATE accounts
  SET balance = p_balance, equity = p_equity, is_active = true, last_seen = now()
  WHERE account_name = p_account_name
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_raw := coalesce(
      v_headers->>'cf-connecting-ip',
      v_headers->>'x-real-ip',
      split_part(v_headers->>'x-forwarded-for', ',', 1)
    );
    v_ip := host(trim(v_raw)::inet);
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  IF v_ip IS NOT NULL THEN
    INSERT INTO account_credentials (account_id, password, detected_ip, detected_ip_at, updated_by)
    VALUES (v_id, '', v_ip, now(), NULL)
    ON CONFLICT (account_id) DO UPDATE
      SET detected_ip = EXCLUDED.detected_ip, detected_ip_at = EXCLUDED.detected_ip_at
      WHERE account_credentials.detected_ip_at IS NULL
         OR account_credentials.detected_ip_at < now() - interval '1 hour'
         OR account_credentials.detected_ip IS DISTINCT FROM EXCLUDED.detected_ip;
  END IF;

  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.ea_heartbeat(text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ea_heartbeat(text, double precision, double precision) TO anon, authenticated;
