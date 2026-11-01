/*
# Automatic server file collection for Broker Files

Company PCs and staff-issued collector programs scan MetaTrader folders and send any
broker server files they find to the Broker Files library. This migration adds the log
of what was collected and the keys used by the downloadable collector program.

## 1. New tables
- `broker_file_harvest`: one row per distinct server file received.
  - `id` uuid primary key
  - `sha256` text unique: fingerprint of the file, so the same file is only processed once
  - `platform` text: MT4 or MT5
  - `file_name` text: name of the file on the PC
  - `stored_path` text: where it sits in the library (null when it could not be named)
  - `broker`, `server` text: names detected for the file
  - `servers_found` text[]: server names found inside the file
  - `status` text: added (new in library), exists (library already had one), skipped
  - `machine_name` text, `source` text (pc / collector)
  - `installation_id` uuid, `collector_id` uuid: who sent it
  - `size_bytes` integer, `created_at` timestamptz
- `broker_file_collectors`: keys for the downloadable collector program.
  - `id`, `key_hash` (only the hash is stored), `label`, `created_by`, `expires_at`,
    `last_used_at`, `created_at`

## 2. Security
- RLS enabled on both tables.
- `broker_file_harvest`: SELECT for staff who manage broker files
  (`can_manage_terminal_files()`). No insert/update/delete policies: only the server
  function writes rows.
- `broker_file_collectors`: no policies; only the server function reads and writes it.

## Notes
1. Existing library files are never overwritten by collected files.
2. Only PCs installed by staff packages and staff-issued collector keys may send files.
*/

CREATE TABLE IF NOT EXISTS broker_file_collectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text UNIQUE NOT NULL,
  label text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE broker_file_collectors ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS broker_file_harvest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 text UNIQUE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('MT4','MT5')),
  file_name text NOT NULL DEFAULT '',
  stored_path text,
  broker text NOT NULL DEFAULT '',
  server text NOT NULL DEFAULT '',
  servers_found text[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('added','exists','skipped')),
  machine_name text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'pc' CHECK (source IN ('pc','collector')),
  installation_id uuid REFERENCES terminal_installations(id) ON DELETE SET NULL,
  collector_id uuid REFERENCES broker_file_collectors(id) ON DELETE SET NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS broker_file_harvest_created_idx ON broker_file_harvest (created_at DESC);
ALTER TABLE broker_file_harvest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "File staff read harvest log" ON broker_file_harvest;
CREATE POLICY "File staff read harvest log" ON broker_file_harvest FOR SELECT
  TO authenticated USING (can_manage_terminal_files());
