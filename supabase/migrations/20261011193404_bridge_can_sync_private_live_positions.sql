/*
# Let the trading bridge sync open positions for private accounts

1. Problem
- The MT4/MT5 bridge refreshes open positions with an "insert or update" request and
  clears closed ones with a delete. The database only lets those touch rows the caller
  can read, and the bridge (anon key) could read live positions only for accounts with
  a public report. Private accounts (e.g. new follower accounts) therefore got a
  permission error, which the bridge shows as "HTTP 401 - invalid SupabaseKey".

2. Security changes
- `live_positions`: new SELECT policy `bridge_select_live_positions` for anon, limited
  to rows that belong to an account registered in the app (`account_exists`).
- No other table changes. Trade history and funding stay private.

3. Notes
- This matches the write access the bridge already has on this table. Removing it fully
  requires per-terminal bridge credentials (open audit items F1/F2/F4).
*/

DROP POLICY IF EXISTS bridge_select_live_positions ON public.live_positions;
CREATE POLICY bridge_select_live_positions ON public.live_positions
  FOR SELECT TO anon
  USING (account_exists(account_name));