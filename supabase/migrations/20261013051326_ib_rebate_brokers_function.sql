/*
# Broker list for rebate reconciliation

New function `ib_rebate_brokers()` (SECURITY DEFINER, authenticated, caller must pass can_reconcile_rebates()):
returns approved brokers with only the fields needed to check rebates (name, rebate type, rate per lot,
payout cycle, number of referral accounts). Finance staff use this instead of reading `ib_brokers`.
*/

CREATE OR REPLACE FUNCTION public.ib_rebate_brokers()
RETURNS TABLE (id uuid, broker_name text, rebate_type text, rebate_per_lot numeric, payout_cycle text, referral_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT can_reconcile_rebates() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
  SELECT b.id, b.broker_name, b.rebate_type, b.rebate_per_lot, b.payout_cycle,
         (SELECT count(*)::integer FROM ib_referrals r WHERE r.broker_id = b.id AND r.status IN ('opened', 'funded'))
  FROM ib_brokers b
  WHERE b.stage = 'approved'
  ORDER BY b.broker_name;
END $$;
REVOKE ALL ON FUNCTION public.ib_rebate_brokers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ib_rebate_brokers() TO authenticated;
