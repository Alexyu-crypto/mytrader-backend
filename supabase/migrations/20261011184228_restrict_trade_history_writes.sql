-- The MT4/MT5 bridge only INSERTs history rows (Prefer: resolution=ignore-duplicates).
-- The open UPDATE/DELETE policies let anyone holding the public key rewrite or
-- erase a trader's record, so they are replaced with operator-only policies.
DROP POLICY IF EXISTS anon_update_trade_history ON public.trade_history;
DROP POLICY IF EXISTS anon_delete_trade_history ON public.trade_history;

CREATE POLICY operator_update_trade_history ON public.trade_history
  FOR UPDATE TO authenticated
  USING (can_operate())
  WITH CHECK (can_operate());

CREATE POLICY operator_delete_trade_history ON public.trade_history
  FOR DELETE TO authenticated
  USING (can_operate());
