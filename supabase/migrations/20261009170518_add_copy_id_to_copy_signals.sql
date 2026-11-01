/*
# Add copy_id column to copy_signals

1. Problem
- The copy engine and both EAs (MT4/MT5) rely on `copy_signals.copy_id` to link
  a signal to its `copy_trades` record.
- The `copy_trades` table has `copy_id` but `copy_signals` was never given the column,
  so inserts from useCopyEngine silently dropped the field and EAs could not extract
  `copy_id` from the signal JSON.

2. Change
- Add `copy_id text` column to `copy_signals` (nullable, backfill not needed — old
  signals have no corresponding copy_trades row).
- Add an index on `copy_id` for faster lookups.

3. Security
- No RLS changes — existing policies already allow anon + authenticated full CRUD.
*/

ALTER TABLE copy_signals ADD COLUMN IF NOT EXISTS copy_id text;

CREATE INDEX IF NOT EXISTS idx_copy_signals_copy_id ON copy_signals(copy_id);
