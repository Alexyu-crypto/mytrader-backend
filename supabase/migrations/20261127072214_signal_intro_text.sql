/*
# Signal intro text per master account

1. Modified Tables
- `accounts`: new column `signal_intro` (text, nullable) - a short description shown on the
  Trading Signals card and detail panel for that account.

2. New Functions
- `set_signal_intro(p_account_name text, p_intro text)` - admin-only. Saves (or clears when blank)
  the intro text for a master account. Max 1000 characters.

3. Security
- The column is readable wherever the account row is already readable (existing policies).
- Writes go through the SECURITY DEFINER function, which checks `is_admin()`.
- EXECUTE revoked from PUBLIC/anon, granted to authenticated only.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS signal_intro text;

CREATE OR REPLACE FUNCTION set_signal_intro(p_account_name text, p_intro text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text := nullif(btrim(coalesce(p_intro, '')), '');
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_text IS NOT NULL AND char_length(v_text) > 1000 THEN
    RAISE EXCEPTION 'Intro is too long (max 1000 characters)';
  END IF;
  UPDATE accounts SET signal_intro = v_text WHERE account_name = p_account_name AND type = 'master';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signal account not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_signal_intro(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_signal_intro(text, text) TO authenticated;
