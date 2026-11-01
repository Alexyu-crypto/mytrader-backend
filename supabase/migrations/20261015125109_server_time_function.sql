/*
# Server time function

1. Purpose
- Returns the database server's current time so the website can correct for a wrong clock on the viewer's computer when deciding if an EA is online.

2. New Functions
- `server_time()` returns timestamptz (read-only, no data access).

3. Security
- Exposes no data; callable by signed-in users and anon.
*/

CREATE OR REPLACE FUNCTION public.server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT now() $$;

REVOKE ALL ON FUNCTION public.server_time() FROM public;
GRANT EXECUTE ON FUNCTION public.server_time() TO anon, authenticated;
