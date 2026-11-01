/*
# Broker server choices for the account form

1. New function `broker_server_choices()`
   - Returns one row per known broker server: platform, broker, server.
   - Sources:
     - MT4 server files in the broker library (file name = server name)
     - MT5 library files named Broker__Server.dat
     - MT4 server names collected from PCs (broker_file_harvest.servers_found)
     - Server names recorded on harvest rows and planned brokers
   - MT5 names collected from PCs are skipped because they are not readable server names.

2. Security
   - SECURITY DEFINER so account operators can see the server list without
     getting access to the library files or the collection log themselves.
   - Returns nothing unless the caller passes can_operate() (the same rule that
     lets a user add or edit accounts).
   - EXECUTE revoked from public/anon, granted to authenticated only.
*/

CREATE OR REPLACE FUNCTION public.broker_server_choices()
RETURNS TABLE (platform text, broker text, server text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH src AS (
    SELECT 'MT4'::text AS platform,
           split_part(regexp_replace(substr(o.name, 5), '\.srv$', '', 'i'), '-', 1) AS broker,
           regexp_replace(substr(o.name, 5), '\.srv$', '', 'i') AS server
    FROM storage.objects o
    WHERE o.bucket_id = 'terminal-servers' AND o.name ILIKE 'mt4/%.srv'
    UNION ALL
    SELECT 'MT5',
           split_part(regexp_replace(substr(o.name, 5), '\.dat$', '', 'i'), '__', 1),
           split_part(regexp_replace(substr(o.name, 5), '\.dat$', '', 'i'), '__', 2)
    FROM storage.objects o
    WHERE o.bucket_id = 'terminal-servers' AND o.name ILIKE 'mt5/%\_\_%.dat'
    UNION ALL
    SELECT h.platform, coalesce(h.broker, ''), s
    FROM broker_file_harvest h, unnest(h.servers_found) s
    WHERE h.platform = 'MT4'
    UNION ALL
    SELECT h.platform, coalesce(h.broker, ''), h.server FROM broker_file_harvest h
    UNION ALL
    SELECT t.platform, t.broker, t.server FROM broker_file_targets t
  )
  SELECT DISTINCT ON (src.platform, lower(trim(src.server))) src.platform, src.broker, trim(src.server)
  FROM src
  WHERE public.can_operate()
    AND src.platform IN ('MT4', 'MT5')
    AND src.server IS NOT NULL
    AND length(trim(src.server)) BETWEEN 3 AND 64
    AND trim(src.server) ~ '^[A-Za-z0-9][A-Za-z0-9 ._()-]*$'
  ORDER BY src.platform, lower(trim(src.server));
$$;

REVOKE ALL ON FUNCTION public.broker_server_choices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_server_choices() TO authenticated;
