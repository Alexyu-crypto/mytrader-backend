/*
# Manual assistant daily usage limit

1. New Tables
- `assistant_usage`
  - `user_id` (uuid, references auth.users, part of primary key)
  - `day` (date, UTC day, part of primary key)
  - `count` (integer, number of questions asked that day)

2. New Functions
- `assistant_take_quota(p_user uuid, p_limit int)`: atomically adds one question for today and returns true
  if the user is still within the limit. Only the server (service role) may call it.

3. Security
- RLS enabled with no policies: browsers cannot read or write this table. Only the server function uses it.
- EXECUTE on the function is revoked from public, anon and authenticated.
*/

CREATE TABLE IF NOT EXISTS assistant_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE assistant_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.assistant_take_quota(p_user uuid, p_limit int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO assistant_usage (user_id, day, count) VALUES (p_user, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = assistant_usage.count + 1
  RETURNING count INTO v_count;
  RETURN v_count <= p_limit;
END $$;
REVOKE ALL ON FUNCTION public.assistant_take_quota(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_take_quota(uuid, int) TO service_role;