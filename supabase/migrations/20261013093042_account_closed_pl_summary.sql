/*
# Per-account closed P&L summary

1. New Functions
- `account_closed_pl()` returns one row per account with the net closed profit
  (profit + commission + swap) summed across all of its trade history.
  Used by the Dashboard "Total P&L" card so the browser does not have to download every trade.

2. Security
- SECURITY INVOKER: runs with the caller's permissions, so the existing row level
  security on `trade_history` decides which accounts a user can see.
- Executable by signed-in users only.
*/

CREATE OR REPLACE FUNCTION public.account_closed_pl()
RETURNS TABLE (account_name text, net_profit double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.account_name, sum(coalesce(t.profit, 0) + coalesce(t.commission, 0) + coalesce(t.swap, 0))
  FROM trade_history t
  GROUP BY t.account_name;
$$;

REVOKE ALL ON FUNCTION public.account_closed_pl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_closed_pl() TO authenticated;
