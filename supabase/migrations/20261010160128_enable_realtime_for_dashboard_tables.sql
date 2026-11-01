/*
# Enable Realtime for dashboard tables

The app subscribes to live changes, but no tables were in the realtime publication,
so no change events were ever delivered.

1. Changes
- Add `accounts`, `live_positions`, `copy_signals`, `engine_log`, `engine_state` to `supabase_realtime`.

2. Security
- No policy changes. Realtime only delivers rows the subscriber can already SELECT under existing RLS.
*/

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'live_positions', 'copy_signals', 'engine_log', 'engine_state'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
