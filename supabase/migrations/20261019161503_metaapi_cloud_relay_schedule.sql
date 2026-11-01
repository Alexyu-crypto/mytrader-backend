/*
# Schedule the MetaApi cloud relay (24/7)

1. Changes
- Adds pg_cron job `metaapi-relay` running every 3 seconds. It calls the `metaapi` edge function
  with the scheduler key from the vault, so cloud accounts sync positions and execute copy
  signals even when nobody has the web app open.

2. Security
- The key is read from vault at run time; it is never stored in the job text.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metaapi-relay') THEN
    PERFORM cron.unschedule('metaapi-relay');
  END IF;
END $$;

SELECT cron.schedule(
  'metaapi-relay',
  '3 seconds',
  $job$
  SELECT net.http_post(
    url := 'https://tsmjlfyygxcnghfcinzv.supabase.co/functions/v1/metaapi',
    body := '{"action":"tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.metaapi_cron_key()),
    timeout_milliseconds := 25000
  );
  $job$
);
