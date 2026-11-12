/*
# Weekly MetaApi market-hours schedule (Hong Kong time)

1. Changes
- `metaapi-weekly-deploy`: every Monday 07:00 HKT (Sunday 23:00 UTC), with a retry at 23:10 UTC,
  asks the `metaapi` edge function to deploy (start) every linked, non-frozen MetaApi cloud account.
- `metaapi-weekly-suspend`: every Saturday 05:00 HKT (Friday 21:00 UTC), with a retry at 21:10 UTC,
  asks the `metaapi` edge function to undeploy (suspend) every linked MetaApi cloud account.

2. Notes
1. pg_cron runs in UTC; Hong Kong has no daylight saving so the times stay fixed year-round.
2. Deploy/undeploy are idempotent at MetaApi, so the retry run is harmless.
3. The scheduler key is read from the vault at run time; it is never stored in the job text.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metaapi-weekly-deploy') THEN
    PERFORM cron.unschedule('metaapi-weekly-deploy');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metaapi-weekly-suspend') THEN
    PERFORM cron.unschedule('metaapi-weekly-suspend');
  END IF;
END $$;

SELECT cron.schedule(
  'metaapi-weekly-deploy',
  '0,10 23 * * 0',
  $job$
  SELECT net.http_post(
    url := 'https://tsmjlfyygxcnghfcinzv.supabase.co/functions/v1/metaapi',
    body := '{"action":"schedule_deploy"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.metaapi_cron_key()),
    timeout_milliseconds := 60000
  );
  $job$
);

SELECT cron.schedule(
  'metaapi-weekly-suspend',
  '0,10 21 * * 5',
  $job$
  SELECT net.http_post(
    url := 'https://tsmjlfyygxcnghfcinzv.supabase.co/functions/v1/metaapi',
    body := '{"action":"schedule_suspend"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.metaapi_cron_key()),
    timeout_milliseconds := 60000
  );
  $job$
);
