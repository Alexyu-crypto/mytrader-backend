/*
# Broker risk control for funding

Scores every broker from the funding reconciliation records and blocks new deposits
to risky brokers.

1. New Tables
- `broker_risk_rules` (one row per broker, optional)
  - `broker` (text, pk) - matches accounts.broker
  - `manual_block` (bool) - finance manually stops deposits
  - `block_deposits_after` (date) - deposits blocked from this date onwards
  - `auto_block` (bool, default true) - block automatically when risk is high
  - `max_pending_days` (int, default 14) - block when any withdrawal is pending longer than this
  - `restricts_profit` (bool) - broker only pays out principal / withholds profit
  - `notes`, `updated_by_email`, `updated_at`

2. Functions
- `_broker_risk_all()` internal, not callable by app users.
- `broker_risk_report()` returns the risk table, only for funding staff (admin, trader, finance).
- Trigger `enforce_broker_deposit_block` rejects new deposit records for blocked brokers.

3. Risk score (0-100)
- Withdrawal rejection rate x 40
- Average withdrawal arrival delay (capped at 14 days) x 25
- Overdue pending withdrawals (> 7 days, capped at 3) x 20
- Profit restriction flag + 15
- Level: high >= 60, medium >= 30, else low.

4. Security
- RLS on `broker_risk_rules`: read by funding staff, insert/update by admin+finance, delete by admin.
*/

CREATE TABLE IF NOT EXISTS broker_risk_rules (
  broker text PRIMARY KEY,
  manual_block boolean NOT NULL DEFAULT false,
  block_deposits_after date,
  auto_block boolean NOT NULL DEFAULT true,
  max_pending_days int NOT NULL DEFAULT 14 CHECK (max_pending_days > 0),
  restricts_profit boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  updated_by_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE broker_risk_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_broker_risk_rules" ON broker_risk_rules;
CREATE POLICY "select_broker_risk_rules" ON broker_risk_rules FOR SELECT
  TO authenticated USING (can_manage_funding());

DROP POLICY IF EXISTS "insert_broker_risk_rules" ON broker_risk_rules;
CREATE POLICY "insert_broker_risk_rules" ON broker_risk_rules FOR INSERT
  TO authenticated WITH CHECK (can_edit_funding());

DROP POLICY IF EXISTS "update_broker_risk_rules" ON broker_risk_rules;
CREATE POLICY "update_broker_risk_rules" ON broker_risk_rules FOR UPDATE
  TO authenticated USING (can_edit_funding()) WITH CHECK (can_edit_funding());

DROP POLICY IF EXISTS "delete_broker_risk_rules" ON broker_risk_rules;
CREATE POLICY "delete_broker_risk_rules" ON broker_risk_rules FOR DELETE
  TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION public._broker_risk_all()
RETURNS TABLE (
  broker text, account_count int,
  deposits_confirmed numeric, withdrawals_confirmed numeric, net_exposure numeric,
  wd_confirmed int, wd_rejected int, wd_pending int, wd_overdue int, wd_overdue_amount numeric,
  oldest_pending_days int, avg_wd_delay_days numeric, max_wd_delay_days numeric,
  risk_score int, risk_level text, deposit_blocked boolean, block_reason text,
  manual_block boolean, block_deposits_after date, auto_block boolean, max_pending_days int,
  restricts_profit boolean, notes text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH b AS (
  SELECT trim(a.broker) AS broker, count(*)::int AS account_count
  FROM accounts a GROUP BY trim(a.broker)
), f AS (
  SELECT trim(a.broker) AS broker, fr.*
  FROM funding_requests fr JOIN accounts a ON a.account_name = fr.account_name
), agg AS (
  SELECT f.broker,
    coalesce(sum(amount) FILTER (WHERE request_type='deposit' AND status='confirmed'),0) AS dep_c,
    coalesce(sum(amount) FILTER (WHERE request_type='withdrawal' AND status='confirmed'),0) AS wd_c_amt,
    count(*) FILTER (WHERE request_type='withdrawal' AND status='confirmed')::int AS wd_c,
    count(*) FILTER (WHERE request_type='withdrawal' AND status='rejected')::int AS wd_r,
    count(*) FILTER (WHERE request_type='withdrawal' AND status='pending')::int AS wd_p,
    count(*) FILTER (WHERE request_type='withdrawal' AND status='pending' AND requested_at < now() - interval '7 days')::int AS wd_o,
    coalesce(sum(amount) FILTER (WHERE request_type='withdrawal' AND status='pending' AND requested_at < now() - interval '7 days'),0) AS wd_o_amt,
    max(extract(epoch FROM now() - requested_at)/86400) FILTER (WHERE request_type='withdrawal' AND status='pending') AS oldest_p,
    avg(extract(epoch FROM confirmed_at - requested_at)/86400) FILTER (WHERE request_type='withdrawal' AND status='confirmed' AND confirmed_at IS NOT NULL) AS avg_d,
    max(extract(epoch FROM confirmed_at - requested_at)/86400) FILTER (WHERE request_type='withdrawal' AND status='confirmed' AND confirmed_at IS NOT NULL) AS max_d
  FROM f GROUP BY f.broker
), scored AS (
  SELECT b.broker, b.account_count,
    coalesce(agg.dep_c,0) AS dep_c, coalesce(agg.wd_c_amt,0) AS wd_c_amt,
    coalesce(agg.wd_c,0) AS wd_c, coalesce(agg.wd_r,0) AS wd_r, coalesce(agg.wd_p,0) AS wd_p,
    coalesce(agg.wd_o,0) AS wd_o, coalesce(agg.wd_o_amt,0) AS wd_o_amt,
    coalesce(floor(agg.oldest_p),0)::int AS oldest_p,
    round(coalesce(agg.avg_d,0)::numeric,1) AS avg_d, round(coalesce(agg.max_d,0)::numeric,1) AS max_d,
    r.manual_block, r.block_deposits_after, r.auto_block, r.max_pending_days, r.restricts_profit, r.notes,
    round(
      coalesce(agg.wd_r::numeric / nullif(agg.wd_r + agg.wd_c,0),0) * 40
      + least(coalesce(agg.avg_d,0)/14.0,1) * 25
      + least(coalesce(agg.wd_o,0)/3.0,1) * 20
      + CASE WHEN coalesce(r.restricts_profit,false) THEN 15 ELSE 0 END
    )::int AS score
  FROM b
  LEFT JOIN agg ON agg.broker = b.broker
  LEFT JOIN broker_risk_rules r ON r.broker = b.broker
)
SELECT s.broker, s.account_count, s.dep_c, s.wd_c_amt, s.dep_c - s.wd_c_amt,
  s.wd_c, s.wd_r, s.wd_p, s.wd_o, s.wd_o_amt, s.oldest_p, s.avg_d, s.max_d,
  s.score,
  CASE WHEN s.score >= 60 THEN 'high' WHEN s.score >= 30 THEN 'medium' ELSE 'low' END,
  x.reason IS NOT NULL, x.reason,
  coalesce(s.manual_block,false), s.block_deposits_after, coalesce(s.auto_block,true),
  coalesce(s.max_pending_days,14), coalesce(s.restricts_profit,false), coalesce(s.notes,'')
FROM scored s
CROSS JOIN LATERAL (SELECT CASE
  WHEN coalesce(s.manual_block,false) THEN 'manual'
  WHEN s.block_deposits_after IS NOT NULL AND s.block_deposits_after <= current_date THEN 'date'
  WHEN coalesce(s.auto_block,true) AND s.wd_p > 0 AND s.oldest_p > coalesce(s.max_pending_days,14) THEN 'overdue'
  WHEN coalesce(s.auto_block,true) AND s.score >= 60 THEN 'score'
END AS reason) x
ORDER BY s.score DESC, s.broker;
$$;

REVOKE EXECUTE ON FUNCTION public._broker_risk_all() FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.broker_risk_report()
RETURNS SETOF record
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT 1 $$;
DROP FUNCTION public.broker_risk_report();

CREATE FUNCTION public.broker_risk_report()
RETURNS TABLE (
  broker text, account_count int,
  deposits_confirmed numeric, withdrawals_confirmed numeric, net_exposure numeric,
  wd_confirmed int, wd_rejected int, wd_pending int, wd_overdue int, wd_overdue_amount numeric,
  oldest_pending_days int, avg_wd_delay_days numeric, max_wd_delay_days numeric,
  risk_score int, risk_level text, deposit_blocked boolean, block_reason text,
  manual_block boolean, block_deposits_after date, auto_block boolean, max_pending_days int,
  restricts_profit boolean, notes text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT * FROM _broker_risk_all() WHERE can_manage_funding() $$;

REVOKE EXECUTE ON FUNCTION public.broker_risk_report() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.broker_risk_report() TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_broker_deposit_block()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_broker text;
  v_reason text;
BEGIN
  IF NEW.request_type <> 'deposit' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.request_type = 'deposit' AND OLD.account_name = NEW.account_name THEN
    RETURN NEW;
  END IF;
  SELECT trim(broker) INTO v_broker FROM accounts WHERE account_name = NEW.account_name;
  SELECT block_reason INTO v_reason FROM _broker_risk_all() r WHERE r.broker = v_broker;
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'DEPOSIT_BLOCKED:%', v_reason USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_broker_deposit_block() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_enforce_broker_deposit_block ON funding_requests;
CREATE TRIGGER trg_enforce_broker_deposit_block
  BEFORE INSERT OR UPDATE OF request_type, account_name ON funding_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_broker_deposit_block();