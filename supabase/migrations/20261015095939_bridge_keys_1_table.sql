/*
# Bridge keys (step 1): per-account secret key table

## Summary
Each trading account gets its own secret "bridge key" that its MT4/MT5 EA must send
(header `x-bridge-key`) so the database can tell a genuine terminal from someone who
only has the public app key.

## New table `account_bridge_keys`
- `account_id` (uuid, PK, FK accounts.id, cascade delete)
- `bridge_key` (text) random 64-hex secret
- `created_at`, `rotated_at` (timestamptz)
- `key_seen_at` (timestamptz) last check-in with the correct key (shows which terminals run the new EA)

## Security
- RLS enabled. Only operators (`can_operate()`) can read keys. No client writes:
  keys are created by trigger and rotated through an operator-only function (later step).

## Notes
1. Keys are generated for all existing accounts.
2. A trigger creates a key for every new account.
*/

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS account_bridge_keys (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  bridge_key text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  key_seen_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS account_bridge_keys_key_idx ON account_bridge_keys (bridge_key);

ALTER TABLE account_bridge_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_bridge_keys FROM anon;
REVOKE INSERT, UPDATE, DELETE ON account_bridge_keys FROM authenticated;

DROP POLICY IF EXISTS "operator_select_bridge_keys" ON account_bridge_keys;
CREATE POLICY "operator_select_bridge_keys" ON account_bridge_keys FOR SELECT
  TO authenticated USING (can_operate());

INSERT INTO account_bridge_keys (account_id)
SELECT id FROM accounts ON CONFLICT (account_id) DO NOTHING;

CREATE OR REPLACE FUNCTION create_bridge_key_for_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO account_bridge_keys (account_id) VALUES (NEW.id) ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION create_bridge_key_for_account() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_accounts_bridge_key ON accounts;
CREATE TRIGGER trg_accounts_bridge_key AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION create_bridge_key_for_account();