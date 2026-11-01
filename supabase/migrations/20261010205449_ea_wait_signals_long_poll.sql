/*
# Follower "wait for signal" call (long poll)

Followers no longer have to ask "anything new?" every 0.2 seconds. They call
`ea_wait_signals` and the call stays open until a copy signal is ready (checked every
25 ms on the server), then answers immediately. If nothing arrives within the wait
window it returns an empty list and the follower simply calls again.

1. New function `ea_wait_signals(p_follower text, p_limit int, p_wait_ms int)`
- Waits at most `p_wait_ms` (clamped to 0..2000 ms; anon requests time out at 3 s).
- Only follower accounts wait. Any other account (e.g. a master) gets an instant
  answer, so a master bot is never held up.
- As soon as a pending signal exists it delegates to `ea_take_signals`, so claiming,
  pre-validation and the returned JSON are exactly the same as before.

2. Security
- SECURITY INVOKER, same privileges as `ea_take_signals`. EXECUTE granted to anon and
  authenticated (the bots use the anon key), revoked from PUBLIC.

3. Notes
- The function is VOLATILE, so every check sees signals committed by other
  transactions (e.g. the master's write that triggered the copy engine).
*/

CREATE OR REPLACE FUNCTION public.ea_wait_signals(p_follower text, p_limit int DEFAULT 10, p_wait_ms int DEFAULT 1500)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  v_deadline timestamptz := clock_timestamp()
    + make_interval(secs => least(greatest(coalesce(p_wait_ms, 0), 0), 2000) / 1000.0);
  v_is_follower boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_follower AND type = 'follower')
    INTO v_is_follower;

  LOOP
    IF EXISTS (SELECT 1 FROM copy_signals WHERE follower_account = p_follower AND status = 'pending') THEN
      RETURN ea_take_signals(p_follower, p_limit);
    END IF;
    EXIT WHEN NOT v_is_follower OR clock_timestamp() >= v_deadline;
    PERFORM pg_sleep(0.025);
  END LOOP;
  RETURN '[]'::jsonb;
END $$;

REVOKE EXECUTE ON FUNCTION public.ea_wait_signals(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ea_wait_signals(text, int, int) TO anon, authenticated;
