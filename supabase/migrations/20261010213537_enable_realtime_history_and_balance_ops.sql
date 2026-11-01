/*
# Live updates for trade history and deposits/withdrawals

## Plain-English summary
Lets the account report and Trade History pages refresh automatically when an EA
uploads a newly closed trade or a deposit/withdrawal.

## Changes
1. Adds `trade_history` and `balance_operations` to the `supabase_realtime` publication
   (skipped if already present).

## Security
- No policy changes. Realtime respects the existing SELECT policies.
*/

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trade_history', 'balance_operations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
