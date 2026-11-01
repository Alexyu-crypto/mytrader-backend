/*
# Stop follower EAs from holding database connections while waiting

1. Problem
- `ea_wait_signals` slept inside the database (up to 1.5s per call) waiting for a copy signal.
- Each follower EA calls it continuously, so with ~50 followers every API connection
  (~10) was permanently busy sleeping. Website requests (login check, pages) queued and timed out.

2. Change
- `ea_wait_signals` now checks once and returns immediately (same signature, same result shape).
  EAs already re-check every 100ms, so copy speed is unchanged.
- Adds a partial index so the "any pending signal for this follower?" check is instant.

3. Security
- No permission changes; function remains SECURITY DEFINER with the same bridge_assert check.
*/

CREATE INDEX IF NOT EXISTS copy_signals_pending_follower_idx
  ON copy_signals (follower_account) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.ea_wait_signals(p_follower text, p_limit integer DEFAULT 10, p_wait_ms integer DEFAULT 1500)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
PERFORM bridge_assert(p_follower);
IF EXISTS (SELECT 1 FROM copy_signals WHERE follower_account = p_follower AND status = 'pending') THEN
RETURN ea_take_signals(p_follower, p_limit);
END IF;
RETURN '[]'::jsonb;
END $function$;