/*
# Let the trading bridge upload closed trades and funding for private accounts

1. Problem
- The MT4/MT5 bridge uploads closed trades (`trade_history`) and deposits/withdrawals
  (`balance_operations`) with an "insert, skip duplicates" request. The server reads
  back what it inserted, so the bridge (anon key) also needs read access. It had read
  access only for accounts with a public report. Private accounts got a permission
  error, which the bridge shows as "HTTP 401 - invalid SupabaseKey", and the terminal
  never reached its heartbeat, so the account showed offline.

2. Security changes
- `trade_history`: new SELECT policy `bridge_select_trade_history` for anon, limited to
  rows of accounts registered in the app (`account_exists`).
- `balance_operations`: same, `bridge_select_balance_operations`.

3. Notes
- Same scope as the bridge's existing write access and `bridge_select_live_positions`.
- The report "private" switch still hides the account from public report pages and
  from signed-in members who are not allowed to see it.
- Making the data fully private requires per-terminal bridge credentials (open audit
  items F1/F2/F4).
*/

DROP POLICY IF EXISTS bridge_select_trade_history ON public.trade_history;
CREATE POLICY bridge_select_trade_history ON public.trade_history
  FOR SELECT TO anon
  USING (account_exists(account_name));

DROP POLICY IF EXISTS bridge_select_balance_operations ON public.balance_operations;
CREATE POLICY bridge_select_balance_operations ON public.balance_operations
  FOR SELECT TO anon
  USING (account_exists(account_name));