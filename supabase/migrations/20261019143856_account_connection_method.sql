/*
# Account connection method (EA installer or MetaApi)

1. Modified Tables
- `accounts`
  - `connection_method` (text, not null, default 'ea'): how the account is connected.
    'ea' = VDS EA installer, 'metaapi' = MetaApi cloud.
  - `metaapi_account_id` (text, nullable): the account id inside MetaApi, used when connection_method = 'metaapi'.

2. Security
- No policy changes; existing accounts policies cover the new columns.

3. Notes
1. Existing rows default to 'ea'.
2. A check constraint limits connection_method to 'ea' or 'metaapi'.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS connection_method text NOT NULL DEFAULT 'ea';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_account_id text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_connection_method_check') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_connection_method_check CHECK (connection_method IN ('ea','metaapi'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS accounts_connection_method_idx ON accounts (connection_method);