/*
# Signal total funds (master + followers)

1. New Functions
- `signal_total_funds()` returns one row per master account:
  - `master_account` (text)
  - `master_equity` (double precision) the master's own equity
  - `follower_equity` (double precision) summed equity of distinct followers with an enabled copy setting to this master
  - `follower_count` (integer)
2. Security
- SECURITY DEFINER so signed-in clients can see the combined total without being able to read individual follower accounts or copy settings.
- Only aggregates are returned; no follower names or balances leak.
- EXECUTE revoked from PUBLIC and anon, granted to authenticated.
3. Notes
- Archived followers (archive_status other than 'active') are excluded.
*/

CREATE OR REPLACE FUNCTION public.signal_total_funds()
RETURNS TABLE (master_account text, master_equity double precision, follower_equity double precision, follower_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.account_name,
         COALESCE(m.equity, 0),
         COALESCE(SUM(f.equity), 0),
         COUNT(f.account_name)::integer
  FROM accounts m
  LEFT JOIN LATERAL (
    SELECT DISTINCT fa.account_name, fa.equity
    FROM copy_settings cs
    JOIN accounts fa ON fa.account_name = cs.follower_account
    WHERE cs.master_account = m.account_name
      AND cs.enabled
      AND COALESCE(fa.archive_status, 'active') = 'active'
  ) f ON true
  WHERE m.type = 'master'
  GROUP BY m.account_name, m.equity;
$$;

REVOKE EXECUTE ON FUNCTION public.signal_total_funds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signal_total_funds() TO authenticated;
