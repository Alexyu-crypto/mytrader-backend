-- Scope reads of account data to the people entitled to see them.
-- Previously accounts, trade_history, balance_operations and live_positions
-- were readable with USING (true) by anon and every signed-in user, and the
-- "private report" switch (accounts.report_public) was only honoured in the UI.

CREATE OR REPLACE FUNCTION public.can_view_all()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_members
    WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'trader', 'viewer')
  );
$$;

-- Accounts published as a public report (shared report links).
CREATE OR REPLACE FUNCTION public.account_report_public(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM accounts a WHERE a.account_name = p_name AND a.report_public);
$$;

-- Accounts every signed-in member may look at: public reports plus the master
-- accounts listed on the Signals page.
CREATE OR REPLACE FUNCTION public.account_member_visible(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.account_name = p_name AND (a.report_public OR a.type = 'master')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_all() TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_report_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_member_visible(text) TO anon, authenticated;

-- accounts ------------------------------------------------------------------
DROP POLICY IF EXISTS anon_select_accounts ON public.accounts;

CREATE POLICY public_report_select_accounts ON public.accounts
  FOR SELECT TO anon
  USING (report_public);

CREATE POLICY member_select_accounts ON public.accounts
  FOR SELECT TO authenticated
  USING (
    can_view_all()
    OR report_public
    OR type = 'master'
    OR account_name IN (SELECT l.account_name FROM my_linked_accounts() l)
  );

-- trade_history --------------------------------------------------------------
DROP POLICY IF EXISTS anon_select_trade_history ON public.trade_history;

CREATE POLICY public_report_select_trade_history ON public.trade_history
  FOR SELECT TO anon
  USING (account_report_public(account_name));

CREATE POLICY member_select_trade_history ON public.trade_history
  FOR SELECT TO authenticated
  USING (
    can_view_all()
    OR account_member_visible(account_name)
    OR account_name IN (SELECT l.account_name FROM my_linked_accounts() l)
  );

-- balance_operations ---------------------------------------------------------
DROP POLICY IF EXISTS anon_select_balance_operations ON public.balance_operations;

CREATE POLICY public_report_select_balance_operations ON public.balance_operations
  FOR SELECT TO anon
  USING (account_report_public(account_name));

CREATE POLICY member_select_balance_operations ON public.balance_operations
  FOR SELECT TO authenticated
  USING (
    can_view_all()
    OR account_member_visible(account_name)
    OR account_name IN (SELECT l.account_name FROM my_linked_accounts() l)
  );

-- live_positions -------------------------------------------------------------
DROP POLICY IF EXISTS anon_select_live_positions ON public.live_positions;

CREATE POLICY public_report_select_live_positions ON public.live_positions
  FOR SELECT TO anon
  USING (account_report_public(account_name));

CREATE POLICY member_select_live_positions ON public.live_positions
  FOR SELECT TO authenticated
  USING (
    can_view_all()
    OR account_member_visible(account_name)
    OR account_name IN (SELECT l.account_name FROM my_linked_accounts() l)
  );
