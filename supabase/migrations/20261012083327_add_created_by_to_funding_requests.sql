/*
# Add created_by_email to funding_requests

1. Modified Tables
  - `funding_requests`: new nullable column `created_by_email` (text).
    Stores the email of the user who created each request.

2. Notes
  - Existing rows will have NULL for this column (created before tracking).
  - The frontend sets this value at insert time from the current session.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'funding_requests' AND column_name = 'created_by_email'
  ) THEN
    ALTER TABLE funding_requests ADD COLUMN created_by_email text;
  END IF;
END $$;
