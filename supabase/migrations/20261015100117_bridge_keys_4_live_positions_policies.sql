/*
# Bridge keys (step 4): live_positions bridge rules require the terminal key

## Modified table `live_positions`
- bridge_insert / bridge_select / bridge_update / bridge_delete policies (anon, authenticated)
  now use `bridge_key_ok(account_name)` instead of `account_exists(account_name)`.

## Security
- A request carrying only the public app key can no longer fake master positions once
  enforcement is on; a wrong key is rejected immediately even in transition mode.
- Operator / member read policies are untouched.
*/

SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS bridge_insert_live_positions ON live_positions;
CREATE POLICY bridge_insert_live_positions ON live_positions FOR INSERT TO anon, authenticated
  WITH CHECK (bridge_key_ok(account_name));
DROP POLICY IF EXISTS bridge_select_live_positions ON live_positions;
CREATE POLICY bridge_select_live_positions ON live_positions FOR SELECT TO anon, authenticated
  USING (bridge_key_ok(account_name));
DROP POLICY IF EXISTS bridge_update_live_positions ON live_positions;
CREATE POLICY bridge_update_live_positions ON live_positions FOR UPDATE TO anon, authenticated
  USING (bridge_key_ok(account_name)) WITH CHECK (bridge_key_ok(account_name));
DROP POLICY IF EXISTS bridge_delete_live_positions ON live_positions;
CREATE POLICY bridge_delete_live_positions ON live_positions FOR DELETE TO anon, authenticated
  USING (bridge_key_ok(account_name));