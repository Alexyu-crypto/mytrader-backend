/*
# Staff-only MT4/MT5 account passwords

1. New Tables
- `account_credentials`
  - `account_id` (uuid, primary key, references accounts, removed with the account)
  - `password` (text, not null) – the MT4/MT5 login password
  - `updated_at` (timestamptz)
  - `updated_by` (uuid, defaults to the signed-in user)

2. Security
- Kept apart from `accounts` because `accounts` is publicly readable (EA + report links).
- RLS enabled; separate select/insert/update/delete policies, all limited to active
  admin/trader members via `can_operate()`.
- All privileges revoked from `anon`.

3. Notes
1. Clients, agents, viewers and visitors cannot read or change passwords.
*/

CREATE TABLE IF NOT EXISTS account_credentials (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  password text NOT NULL CHECK (char_length(password) BETWEEN 1 AND 64),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

ALTER TABLE account_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON account_credentials FROM anon;

DROP POLICY IF EXISTS "operator_select_credentials" ON account_credentials;
CREATE POLICY "operator_select_credentials" ON account_credentials FOR SELECT
  TO authenticated USING (can_operate());

DROP POLICY IF EXISTS "operator_insert_credentials" ON account_credentials;
CREATE POLICY "operator_insert_credentials" ON account_credentials FOR INSERT
  TO authenticated WITH CHECK (can_operate());

DROP POLICY IF EXISTS "operator_update_credentials" ON account_credentials;
CREATE POLICY "operator_update_credentials" ON account_credentials FOR UPDATE
  TO authenticated USING (can_operate()) WITH CHECK (can_operate());

DROP POLICY IF EXISTS "operator_delete_credentials" ON account_credentials;
CREATE POLICY "operator_delete_credentials" ON account_credentials FOR DELETE
  TO authenticated USING (can_operate());
