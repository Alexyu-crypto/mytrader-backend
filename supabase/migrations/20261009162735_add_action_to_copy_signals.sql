/*
# Add action column to copy_signals

1. Changes
- Add `action` column to `copy_signals` (text, default 'open')
  - 'open' = signal to open a new position (existing behavior)
  - 'close' = signal to close an existing copied position

2. Notes
- Existing rows default to 'open' which preserves backward compatibility
- The copy engine now generates close signals when a master position disappears from live_positions
- Follower EAs poll for both open and close signals and act accordingly
*/

ALTER TABLE copy_signals ADD COLUMN IF NOT EXISTS action text DEFAULT 'open';

-- Update the existing index to include action for efficient filtering
DROP INDEX IF EXISTS idx_copy_signals_status;
CREATE INDEX IF NOT EXISTS idx_copy_signals_status_action ON copy_signals(status, action);
