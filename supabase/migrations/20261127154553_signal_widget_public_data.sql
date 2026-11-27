/*
# Public signal widget data

1. New Functions
- `signal_widget(p_account text, p_since timestamptz)` returns a JSON summary for ONE master (signal) account,
  used by the embeddable website widget:
  - name, broker, platform, equity, balance, last_seen, signal_intro
  - net_profit, pnl_pct (same formula as the Signals page), profit_factor
  - total_opens (closed + currently open trades), today_opens (opened since p_since = viewer's local midnight)
  - first_time (first trade / funding time, for "weeks running")
  - total_funds (master equity + equity of enabled, active followers), follower_count
  - curve: cumulative closed profit per day (last 120 days with activity)
2. Security
- SECURITY DEFINER so the widget can be shown on outside websites without sign-in.
- Returns NULL for anything that is not a master account, so follower/client accounts are never exposed.
- Only summary figures are returned: no tickets, passwords, follower names or per-follower balances.
- EXECUTE granted to anon and authenticated (intentionally public).
*/

CREATE OR REPLACE FUNCTION public.signal_widget(p_account text, p_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m accounts%ROWTYPE;
  v_net double precision;
  v_gp double precision;
  v_gl double precision;
  v_closed integer;
  v_closed_today integer;
  v_open integer;
  v_open_today integer;
  v_dep double precision;
  v_wd double precision;
  v_est double precision;
  v_invested double precision;
  v_first timestamptz;
  v_fol_eq double precision;
  v_fol_n integer;
  v_curve jsonb;
BEGIN
  SELECT * INTO m FROM accounts WHERE account_name = p_account AND type = 'master';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(COALESCE(profit,0)+COALESCE(commission,0)+COALESCE(swap,0)),0),
         COALESCE(SUM(CASE WHEN COALESCE(profit,0)+COALESCE(commission,0)+COALESCE(swap,0) > 0 THEN COALESCE(profit,0)+COALESCE(commission,0)+COALESCE(swap,0) END),0),
         COALESCE(SUM(CASE WHEN COALESCE(profit,0)+COALESCE(commission,0)+COALESCE(swap,0) < 0 THEN COALESCE(profit,0)+COALESCE(commission,0)+COALESCE(swap,0) END),0),
         COUNT(*)::integer,
         COUNT(*) FILTER (WHERE open_time >= p_since)::integer,
         MIN(close_time)
    INTO v_net, v_gp, v_gl, v_closed, v_closed_today, v_first
  FROM trade_history WHERE account_name = p_account AND close_time IS NOT NULL;

  SELECT COUNT(*)::integer, COUNT(*) FILTER (WHERE open_time >= p_since)::integer
    INTO v_open, v_open_today
  FROM live_positions WHERE account_name = p_account;

  SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0),0), COALESCE(SUM(-amount) FILTER (WHERE amount < 0),0),
         LEAST(v_first, MIN(op_time))
    INTO v_dep, v_wd, v_first
  FROM balance_operations WHERE account_name = p_account AND op_type <> 'credit';

  v_est := COALESCE(m.balance,0) - v_net - (v_dep - v_wd);
  IF NOT (COALESCE(m.balance,0) > 0 AND v_est > 0.01) THEN
    v_est := 0;
  END IF;
  v_invested := v_dep + v_est;

  SELECT COALESCE(SUM(f.equity),0), COUNT(*)::integer INTO v_fol_eq, v_fol_n
  FROM (
    SELECT DISTINCT fa.account_name, fa.equity
    FROM copy_settings cs JOIN accounts fa ON fa.account_name = cs.follower_account
    WHERE cs.master_account = p_account AND cs.enabled AND COALESCE(fa.archive_status,'active') = 'active'
  ) f;

  SELECT COALESCE(jsonb_agg(c.cum ORDER BY c.d), '[]'::jsonb) INTO v_curve
  FROM (
    SELECT d, cum FROM (
      SELECT d, SUM(day_net) OVER (ORDER BY d) AS cum
      FROM (
        SELECT date_trunc('day', close_time) AS d, SUM(COALESCE(profit,0)+COALESCE(commission,0)+COALESCE(swap,0)) AS day_net
        FROM trade_history WHERE account_name = p_account AND close_time IS NOT NULL
        GROUP BY 1
      ) daily
    ) running
    ORDER BY d DESC LIMIT 120
  ) c;

  RETURN jsonb_build_object(
    'name', m.account_name,
    'broker', m.broker,
    'platform', m.platform,
    'equity', COALESCE(m.equity,0),
    'balance', COALESCE(m.balance,0),
    'last_seen', m.last_seen,
    'net_profit', v_net,
    'pnl_pct', CASE WHEN v_invested > 0 THEN ((v_wd + COALESCE(m.equity,0)) - v_invested) / v_invested * 100 END,
    'profit_factor', CASE WHEN v_gl < 0 THEN v_gp / abs(v_gl) END,
    'total_opens', v_closed + v_open,
    'today_opens', v_closed_today + v_open_today,
    'first_time', COALESCE(v_first, m.created_at),
    'total_funds', COALESCE(m.equity,0) + v_fol_eq,
    'follower_count', v_fol_n,
    'curve', v_curve
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.signal_widget(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signal_widget(text, timestamptz) TO anon, authenticated;
