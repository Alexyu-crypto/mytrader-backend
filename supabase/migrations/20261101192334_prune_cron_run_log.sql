/*
  # Auto-prune background job run log
  The cron run log grew to 726 MB (one row per run of 1s/3s jobs) and stalled the database.
  Keeps only the last hour of run history; also trims old pg_net responses.
*/
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'prune-cron-log';
END $$;

SELECT cron.schedule(
  'prune-cron-log',
  '*/10 * * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '1 hour';
    DELETE FROM net._http_response WHERE created < now() - interval '1 hour';$$
);