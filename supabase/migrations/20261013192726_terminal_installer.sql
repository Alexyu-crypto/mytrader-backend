/*
# Terminal auto-installer

1. New Tables
- `terminal_installer_settings` (single row, id = 1)
  - `mt4_installer_url`, `mt5_installer_url` (text): official broker setup links used when a PC has no MT terminal yet
  - `updated_at`
- `terminal_installations`: one row per downloaded install package
  - `master_account` (text, FK accounts.account_name): the copy group
  - `group_name`, `account_names text[]`: accounts included in the package
  - `token_hash` (text, unique): SHA-256 of the one-time install code embedded in the package
  - `expires_at`: install code expiry (1 hour or 7 days)
  - `install_key_hash` (text, unique): SHA-256 of the key the installed PC uses for status reports and uninstall checks
  - `machine_id`, `machine_name`: the PC the package was first run on (package is locked to it)
  - `status`: pending | checking | blocked | installing | installed | failed | uninstalled
  - `capacity` (int): max safe terminals computed on the PC
  - `hardware` (jsonb): CPU / RAM / disk / screen snapshot
  - `message`, `created_by`, `created_at`, `claimed_at`, `updated_at`

2. Storage
- Private bucket `terminal-servers` holding broker server files (MT4 .srv, MT5 servers.dat) copied into new terminals.

3. Security
- RLS on both tables. Only active admins/traders (`can_operate()`) can read or change settings and view / revoke installations.
- Installation rows are created and updated only by the `terminal-installer` server function (service role); no client insert/update policy.
- Storage objects in `terminal-servers` are readable/writable only by `can_operate()` users.
*/

CREATE TABLE IF NOT EXISTS terminal_installer_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mt4_installer_url text NOT NULL DEFAULT '' CHECK (char_length(mt4_installer_url) <= 500),
  mt5_installer_url text NOT NULL DEFAULT '' CHECK (char_length(mt5_installer_url) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE terminal_installer_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators_select_installer_settings" ON terminal_installer_settings;
CREATE POLICY "operators_select_installer_settings" ON terminal_installer_settings FOR SELECT
  TO authenticated USING (can_operate());
DROP POLICY IF EXISTS "operators_insert_installer_settings" ON terminal_installer_settings;
CREATE POLICY "operators_insert_installer_settings" ON terminal_installer_settings FOR INSERT
  TO authenticated WITH CHECK (can_operate());
DROP POLICY IF EXISTS "operators_update_installer_settings" ON terminal_installer_settings;
CREATE POLICY "operators_update_installer_settings" ON terminal_installer_settings FOR UPDATE
  TO authenticated USING (can_operate()) WITH CHECK (can_operate());

CREATE TABLE IF NOT EXISTS terminal_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_account text NOT NULL REFERENCES accounts(account_name) ON UPDATE CASCADE ON DELETE CASCADE,
  group_name text NOT NULL DEFAULT '',
  account_names text[] NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  install_key_hash text UNIQUE,
  machine_id text,
  machine_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','checking','blocked','installing','installed','failed','uninstalled')),
  capacity int,
  hardware jsonb,
  message text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS terminal_installations_master_idx ON terminal_installations (master_account, created_at DESC);

ALTER TABLE terminal_installations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON terminal_installations FROM anon;

DROP POLICY IF EXISTS "operators_select_installations" ON terminal_installations;
CREATE POLICY "operators_select_installations" ON terminal_installations FOR SELECT
  TO authenticated USING (can_operate());
DROP POLICY IF EXISTS "operators_delete_installations" ON terminal_installations;
CREATE POLICY "operators_delete_installations" ON terminal_installations FOR DELETE
  TO authenticated USING (can_operate());

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('terminal-servers', 'terminal-servers', false, 5242880)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "operators_select_terminal_servers" ON storage.objects;
CREATE POLICY "operators_select_terminal_servers" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'terminal-servers' AND can_operate());
DROP POLICY IF EXISTS "operators_insert_terminal_servers" ON storage.objects;
CREATE POLICY "operators_insert_terminal_servers" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'terminal-servers' AND can_operate());
DROP POLICY IF EXISTS "operators_update_terminal_servers" ON storage.objects;
CREATE POLICY "operators_update_terminal_servers" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'terminal-servers' AND can_operate()) WITH CHECK (bucket_id = 'terminal-servers' AND can_operate());
DROP POLICY IF EXISTS "operators_delete_terminal_servers" ON storage.objects;
CREATE POLICY "operators_delete_terminal_servers" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'terminal-servers' AND can_operate());
