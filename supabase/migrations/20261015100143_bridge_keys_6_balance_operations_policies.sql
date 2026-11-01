/*
# Bridge keys (step 6): balance_operations bridge rules require the terminal key

## Modified table `balance_operations`
- bridge_insert policy now uses `bridge_key_ok(account_name)` (length checks kept).
- bridge_select policy now uses `bridge_key_ok(account_name)`.

## Security
- Deposits/withdrawals can only be reported by the terminal holding the account key.
*/

SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS bridge_insert_balance_operations ON balance_operations;
CREATE POLICY bridge_insert_balance_operations ON balance_operations FOR INSERT TO anon, authenticated
  WITH CHECK (bridge_key_ok(account_name) AND length(account_name) BETWEEN 1 AND 200
              AND (comment IS NULL OR length(comment) <= 500));
DROP POLICY IF EXISTS bridge_select_balance_operations ON balance_operations;
CREATE POLICY bridge_select_balance_operations ON balance_operations FOR SELECT TO anon, authenticated
  USING (bridge_key_ok(account_name));