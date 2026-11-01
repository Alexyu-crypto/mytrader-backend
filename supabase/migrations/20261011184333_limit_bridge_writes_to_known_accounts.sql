-- The MT4/MT5 bridge authenticates with the public anon key, so anyone can reach
-- these write paths. Until the terminals carry their own credential, at least
-- require the row to belong to an account that already exists in the system.

CREATE OR REPLACE FUNCTION public.account_exists(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM accounts a WHERE a.account_name = p_name);
$$;

GRANT EXECUTE ON FUNCTION public.account_exists(text) TO anon, authenticated;

DROP POLICY IF EXISTS anon_insert_trade_history ON public.trade_history;
CREATE POLICY bridge_insert_trade_history ON public.trade_history
  FOR INSERT TO anon, authenticated
  WITH CHECK (account_exists(account_name));

DROP POLICY IF EXISTS anon_insert_balance_operations ON public.balance_operations;
CREATE POLICY bridge_insert_balance_operations ON public.balance_operations
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    account_exists(account_name)
    AND length(account_name) BETWEEN 1 AND 200
    AND (comment IS NULL OR length(comment) <= 500)
  );

DROP POLICY IF EXISTS anon_insert_live_positions ON public.live_positions;
CREATE POLICY bridge_insert_live_positions ON public.live_positions
  FOR INSERT TO anon, authenticated
  WITH CHECK (account_exists(account_name));

DROP POLICY IF EXISTS anon_update_live_positions ON public.live_positions;
CREATE POLICY bridge_update_live_positions ON public.live_positions
  FOR UPDATE TO anon, authenticated
  USING (account_exists(account_name))
  WITH CHECK (account_exists(account_name));

DROP POLICY IF EXISTS anon_delete_live_positions ON public.live_positions;
CREATE POLICY bridge_delete_live_positions ON public.live_positions
  FOR DELETE TO anon, authenticated
  USING (account_exists(account_name));
