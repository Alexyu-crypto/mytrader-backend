/*
# Bridge keys (step 5): trade_history bridge rules require the terminal key

## Modified table `trade_history`
- bridge_insert / bridge_select policies (anon, authenticated) now use
  `bridge_key_ok(account_name)` instead of `account_exists(account_name)`.

## Security
- Fake closed-trade rows (which kick the copy engine) can no longer be written with the
  public app key alone; the bridge read is also limited to the key holder.
*/

SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS bridge_insert_trade_history ON trade_history;
CREATE POLICY bridge_insert_trade_history ON trade_history FOR INSERT TO anon, authenticated
  WITH CHECK (bridge_key_ok(account_name));
DROP POLICY IF EXISTS bridge_select_trade_history ON trade_history;
CREATE POLICY bridge_select_trade_history ON trade_history FOR SELECT TO anon, authenticated
  USING (bridge_key_ok(account_name));