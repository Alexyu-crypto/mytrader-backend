/*
# Read-only (investor password) detection

## Summary
The bridge EA reports whether its terminal is allowed to trade. A terminal logged in
with the investor (read-only) password cannot place orders, so the website flags it.

## 1. Modified table: accounts
- `mt_trade_allowed` (boolean, nullable): last report from MT. false = read-only login.
  NULL = not reported yet (older EA).
- `mt_trade_allowed_at` (timestamptz, nullable): when MT last reported it.

## 2. New function
- `ea_report_trade_access(p_account_name, p_allowed)`: called by the bridge EA, guarded
  by the bridge key like every other EA function. Only writes the two columns above.

## Security
- Existing accounts RLS policies unchanged; they cover the new columns.

## Notes
1. Safe to re-run.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mt_trade_allowed boolean;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mt_trade_allowed_at timestamptz;

CREATE OR REPLACE FUNCTION public.ea_report_trade_access(p_account_name text, p_allowed boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
PERFORM bridge_assert(p_account_name);
IF p_allowed IS NULL THEN RETURN false; END IF;
UPDATE accounts
SET mt_trade_allowed = p_allowed, mt_trade_allowed_at = now()
WHERE account_name = p_account_name;
RETURN FOUND;
END $function$;

REVOKE ALL ON FUNCTION public.ea_report_trade_access(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.ea_report_trade_access(text, boolean) TO anon, authenticated;