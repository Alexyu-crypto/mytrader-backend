/*
# Account archive status options

Adds a status choice to the archive mark so an account can be labelled as one of:
- `frozen`      - Frozen / under dispute
- `removed_vm`  - Removed from VM (terminal no longer running on the server)
- `stopped`     - Stop use AC (account retired, no longer used)
- `active`      - Normal (default)

1. Modified Tables
- `accounts`
  - `archive_status` (text, not null, default 'active', one of the values above)

2. Behaviour
- A trigger keeps the existing `frozen` flag in sync: `frozen` is true whenever
  `archive_status` is not 'active'. This keeps the existing delete protection working
  for all three marked statuses.
- Existing frozen accounts are backfilled to `archive_status = 'frozen'`.

3. Security
- No policy changes. The column is edited through the existing operator-only update policy.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'archive_status') THEN
    ALTER TABLE accounts ADD COLUMN archive_status text NOT NULL DEFAULT 'active'
      CHECK (archive_status IN ('active', 'frozen', 'removed_vm', 'stopped'));
  END IF;
END $$;

UPDATE accounts SET archive_status = 'frozen' WHERE frozen AND archive_status = 'active';

CREATE OR REPLACE FUNCTION sync_account_frozen_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.frozen := NEW.archive_status <> 'active';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_account_frozen_flag ON accounts;
CREATE TRIGGER sync_account_frozen_flag
  BEFORE INSERT OR UPDATE OF archive_status, frozen ON accounts
  FOR EACH ROW EXECUTE FUNCTION sync_account_frozen_flag();
