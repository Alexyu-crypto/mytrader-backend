/*
# Planned broker list for Broker Files

## Summary
Lets the Broker Files team list brokers / servers they plan to use in the future,
even before any account exists, so they appear in the "Needed" checklist.

## 1. New table: broker_file_targets
- `id` (uuid, primary key)
- `platform` (text, 'MT4' or 'MT5')
- `broker` (text, required, max 60)
- `server` (text, optional, max 80): exact server name if known
- `note` (text, optional, max 200)
- `created_by` (uuid, defaults to the signed-in user)
- `created_at` (timestamptz)
- Unique per platform + broker + server (case-insensitive).

## Security
- RLS enabled. Only active admin / trader / broker files staff
  (`can_manage_terminal_files()`) can read, add, edit or remove rows.

## Notes
1. No existing data is touched. Safe to re-run.
*/

CREATE TABLE IF NOT EXISTS broker_file_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('MT4', 'MT5')),
  broker text NOT NULL CHECK (length(trim(broker)) BETWEEN 1 AND 60),
  server text NOT NULL DEFAULT '' CHECK (length(server) <= 80),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS broker_file_targets_unique
  ON broker_file_targets (platform, lower(trim(broker)), lower(trim(server)));

ALTER TABLE broker_file_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "file_staff_select_targets" ON broker_file_targets;
CREATE POLICY "file_staff_select_targets" ON broker_file_targets FOR SELECT
  TO authenticated USING (can_manage_terminal_files());

DROP POLICY IF EXISTS "file_staff_insert_targets" ON broker_file_targets;
CREATE POLICY "file_staff_insert_targets" ON broker_file_targets FOR INSERT
  TO authenticated WITH CHECK (can_manage_terminal_files());

DROP POLICY IF EXISTS "file_staff_update_targets" ON broker_file_targets;
CREATE POLICY "file_staff_update_targets" ON broker_file_targets FOR UPDATE
  TO authenticated USING (can_manage_terminal_files()) WITH CHECK (can_manage_terminal_files());

DROP POLICY IF EXISTS "file_staff_delete_targets" ON broker_file_targets;
CREATE POLICY "file_staff_delete_targets" ON broker_file_targets FOR DELETE
  TO authenticated USING (can_manage_terminal_files());
