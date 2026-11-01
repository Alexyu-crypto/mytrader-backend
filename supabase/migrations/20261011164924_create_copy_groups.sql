/*
# Copy groups: custom names for each master's follower group

1. New Tables
- `copy_groups`
  - `master_account` (text, primary key, references accounts.account_name; cascades on rename/delete)
  - `name` (text, not null, 1-60 chars) - custom group name chosen by operators, e.g. "Flying Tigers"
  - `updated_at` (timestamptz)

2. Security
- RLS enabled.
- SELECT: any signed-in user (group names are shown alongside copy settings, which are readable).
- INSERT / UPDATE / DELETE: operators only (`can_operate()`), same as copy_settings.

3. Notes
- A master with no row simply has no custom name; the UI falls back to the master's account name.
*/

CREATE TABLE IF NOT EXISTS copy_groups (
  master_account text PRIMARY KEY REFERENCES accounts(account_name) ON UPDATE CASCADE ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE copy_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_select_copy_groups" ON copy_groups;
CREATE POLICY "member_select_copy_groups" ON copy_groups FOR SELECT
  TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "operator_insert_copy_groups" ON copy_groups;
CREATE POLICY "operator_insert_copy_groups" ON copy_groups FOR INSERT
  TO authenticated WITH CHECK (can_operate());

DROP POLICY IF EXISTS "operator_update_copy_groups" ON copy_groups;
CREATE POLICY "operator_update_copy_groups" ON copy_groups FOR UPDATE
  TO authenticated USING (can_operate()) WITH CHECK (can_operate());

DROP POLICY IF EXISTS "operator_delete_copy_groups" ON copy_groups;
CREATE POLICY "operator_delete_copy_groups" ON copy_groups FOR DELETE
  TO authenticated USING (can_operate());
