/*
# Add VPS / IP address to staff-only account credentials

1. Modified Tables
- `account_credentials`
  - New column `ip_address` (text, optional, max 64 chars): the VPS / PC IP address where the
    account's MT4/MT5 terminal runs, so staff can log in quickly to fix it.
  - `password` now defaults to an empty string and may be empty, so an IP address can be saved
    before a password is known.

2. Security
- No policy changes. The table stays readable/writable only by active admin/trader members
  (`can_operate()`), and remains fully revoked from `anon`.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_credentials' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE account_credentials ADD COLUMN ip_address text CHECK (ip_address IS NULL OR char_length(ip_address) <= 64);
  END IF;
END $$;

ALTER TABLE account_credentials ALTER COLUMN password SET DEFAULT '';
ALTER TABLE account_credentials DROP CONSTRAINT IF EXISTS account_credentials_password_check;
ALTER TABLE account_credentials ADD CONSTRAINT account_credentials_password_check CHECK (char_length(password) <= 64);
