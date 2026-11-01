/*
# Per-account public report switch

1. Modified Tables
- `accounts`
  - `report_public` (boolean, not null, default true): when true, anyone holding the
    report link can view the performance report without signing in. When false, the
    report page only shows to signed-in, approved members.

2. Security
- No policy changes. Editing the column is covered by the existing operator update policy
  (admins and traders only).

3. Notes
1. Defaults to true so report links that were already shared keep working.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'report_public'
  ) THEN
    ALTER TABLE accounts ADD COLUMN report_public boolean NOT NULL DEFAULT true;
  END IF;
END $$;