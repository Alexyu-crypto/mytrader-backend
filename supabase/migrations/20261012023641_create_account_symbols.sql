/*
# Store each MT terminal's full symbol list (for symbol mapping)

1. New Tables
- `account_symbols`
  - `account_name` (text, primary key, references accounts.account_name, cascades on delete/rename)
  - `symbols` (text[], every symbol the broker offers on that terminal)
  - `updated_at` (timestamptz, last upload time)

2. New Functions
- `ea_push_symbols(p_account_name, p_symbols)` SECURITY DEFINER, callable by the EA (anon key).
  Only writes for an existing website account. Trims, de-duplicates, drops blanks/over-long names,
  and caps the list at 10000 entries.

3. Security
- RLS enabled. No direct writes for anon/authenticated (only via the function).
- SELECT for signed-in members who can view all accounts, or whose linked accounts include it.

4. Notes
- Used to preload master and follower symbol names on the Symbol Mapping editor.
*/

CREATE TABLE IF NOT EXISTS account_symbols (
  account_name text PRIMARY KEY REFERENCES accounts(account_name) ON DELETE CASCADE ON UPDATE CASCADE,
  symbols text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_symbols ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON account_symbols FROM anon, authenticated;
GRANT SELECT ON account_symbols TO authenticated;

DROP POLICY IF EXISTS "member_select_account_symbols" ON account_symbols;
CREATE POLICY "member_select_account_symbols" ON account_symbols FOR SELECT
  TO authenticated
  USING (
    can_view_all()
    OR account_name IN (SELECT l.account_name FROM my_linked_accounts() l(account_name, relation))
  );

CREATE OR REPLACE FUNCTION public.ea_push_symbols(p_account_name text, p_symbols text[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clean text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account_name) THEN
    RETURN false;
  END IF;

  SELECT coalesce(array_agg(s ORDER BY s), '{}') INTO v_clean
  FROM (
    SELECT DISTINCT trim(x) AS s
    FROM unnest(coalesce(p_symbols, '{}')) AS x
    WHERE length(trim(x)) BETWEEN 1 AND 64
    LIMIT 10000
  ) t;

  INSERT INTO account_symbols (account_name, symbols, updated_at)
  VALUES (p_account_name, v_clean, now())
  ON CONFLICT (account_name) DO UPDATE
    SET symbols = EXCLUDED.symbols, updated_at = EXCLUDED.updated_at;

  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.ea_push_symbols(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ea_push_symbols(text, text[]) TO anon, authenticated;