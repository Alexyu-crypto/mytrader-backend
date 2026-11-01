/*
# Account holder names

## Summary
Stores the account holder's name two ways, so the evidence Excel can show both:
1. The name staff type when adding / importing / editing an account.
2. The name the MT4 / MT5 terminal itself reports (the broker's registered name).

## 1. Modified table: accounts
- `holder_name` (text, nullable, max 100 chars): typed by staff.
- `mt_holder_name` (text, nullable, max 100 chars): reported by the EA from MT.
- `mt_holder_at` (timestamptz, nullable): when MT last reported it.

## 2. New function
- `ea_report_holder(p_account_name, p_holder)`: called by the bridge EA. Only
  writes `mt_holder_name` / `mt_holder_at` on an existing account; ignores blank
  or over-long names. Same access as the other EA reporting functions.

## Security
- Existing accounts RLS policies are unchanged and cover the new columns.
- The EA function can only touch the two MT-reported columns.

## Notes
1. Existing accounts start with empty names; the MT name fills in once the updated EA runs.
2. Safe to re-run.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS holder_name text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mt_holder_name text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mt_holder_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_holder_name_len') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_holder_name_len CHECK (holder_name IS NULL OR length(holder_name) <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_mt_holder_name_len') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_mt_holder_name_len CHECK (mt_holder_name IS NULL OR length(mt_holder_name) <= 100);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ea_report_holder(p_account_name text, p_holder text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_name text := trim(coalesce(p_holder, ''));
BEGIN
  IF length(v_name) = 0 OR length(v_name) > 100 THEN RETURN false; END IF;
  UPDATE accounts
  SET mt_holder_name = v_name, mt_holder_at = now()
  WHERE account_name = p_account_name;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.ea_report_holder(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ea_report_holder(text, text) TO anon, authenticated;
