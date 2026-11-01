/*
# Collected server files: keep the newest version, clean old log rows

## 1. Modified table `broker_file_harvest`
- New column `file_modified_at` (timestamptz, nullable): when the file was last changed on the PC.
  Used to decide whether a collected file is newer than the one in the library.
- `status` may now also be `replaced` (a newer version replaced the library file).
- New index on `stored_path` to find the current version of a library file quickly.

## 2. New function `cleanup_broker_file_harvest()`
- Deletes log rows with status `exists` older than 30 days (these only say "library already had it").
- Rows with status added / replaced / skipped are kept.

## 3. Scheduled job
- `broker-file-harvest-cleanup` runs the cleanup every night at 03:20.

## Security
- No policy changes. The cleanup function is SECURITY DEFINER and EXECUTE is revoked from
  public, anon and authenticated; only the scheduler runs it.
*/

ALTER TABLE broker_file_harvest ADD COLUMN IF NOT EXISTS file_modified_at timestamptz;

ALTER TABLE broker_file_harvest DROP CONSTRAINT IF EXISTS broker_file_harvest_status_check;
ALTER TABLE broker_file_harvest ADD CONSTRAINT broker_file_harvest_status_check
  CHECK (status IN ('added','exists','replaced','skipped'));

CREATE INDEX IF NOT EXISTS broker_file_harvest_path_idx ON broker_file_harvest (stored_path, created_at DESC);

CREATE OR REPLACE FUNCTION public.cleanup_broker_file_harvest()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM broker_file_harvest WHERE status = 'exists' AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_broker_file_harvest() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('broker-file-harvest-cleanup')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'broker-file-harvest-cleanup');
  PERFORM cron.schedule('broker-file-harvest-cleanup', '20 3 * * *', 'SELECT public.cleanup_broker_file_harvest()');
END $$;
