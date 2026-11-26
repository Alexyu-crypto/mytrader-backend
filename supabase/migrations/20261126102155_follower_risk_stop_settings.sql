/*
# Follower risk stop (風控設定)

Lets agents and clients set a stop-loss % when requesting a follower account. When the
account's equity falls that far below its starting balance, copying is stopped
automatically, with one of two actions:
- `stop_new`: stop opening new copied trades; existing positions stay open and still close
  normally when the master closes them.
- `close_all`: stop copying AND close every open position on the account immediately.

1. Modified Tables
- `account_requests`: `risk_stop_pct` (numeric 1-100, nullable = no stop), `risk_action` (stop_new | close_all).
- `accounts`: `risk_stop_pct`, `risk_action`, `risk_base_equity` (starting balance captured on
  the first sync after approval), `risk_triggered_at` (when the stop fired).

2. Functions
- `submit_account_request(...)` gains `p_risk_pct`, `p_risk_action` (old 8-arg version dropped).
- `review_account_request(...)` copies the risk settings onto the new account.
- `enforce_account_risk_stop()` BEFORE UPDATE trigger on accounts: captures the base, checks
  equity, and on breach disables the copy pair(s), optionally queues closes, logs to engine_log.
- `reset_risk_on_copy_reenable()` trigger on copy_settings: when an operator re-enables a
  stopped follower, the stop re-arms using the current equity as the new base.

3. Security
- Trigger functions are not callable as RPCs (EXECUTE revoked from PUBLIC/anon/authenticated).
- Risk columns on accounts can only be changed through existing operator-only update policies.
*/

ALTER TABLE account_requests ADD COLUMN IF NOT EXISTS risk_stop_pct numeric;
ALTER TABLE account_requests ADD COLUMN IF NOT EXISTS risk_action text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS risk_stop_pct numeric;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS risk_action text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS risk_base_equity numeric;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS risk_triggered_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_requests_risk_chk') THEN
    ALTER TABLE account_requests ADD CONSTRAINT account_requests_risk_chk CHECK (
      (risk_stop_pct IS NULL AND risk_action IS NULL)
      OR (risk_stop_pct > 0 AND risk_stop_pct <= 100 AND risk_action IN ('stop_new','close_all')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_risk_chk') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_risk_chk CHECK (
      (risk_stop_pct IS NULL AND risk_action IS NULL)
      OR (risk_stop_pct > 0 AND risk_stop_pct <= 100 AND risk_action IN ('stop_new','close_all')));
  END IF;
END $$;

GRANT SELECT (risk_stop_pct, risk_action) ON account_requests TO authenticated;

DROP FUNCTION IF EXISTS submit_account_request(text, text, text, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION submit_account_request(
  p_holder_name text, p_account_number text, p_broker text, p_broker_server text,
  p_platform text, p_master_account text, p_password text, p_for_user uuid DEFAULT NULL,
  p_risk_pct numeric DEFAULT NULL, p_risk_action text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_target uuid;
  v_initials text;
  v_broker_short text;
  v_name text;
  v_id uuid;
BEGIN
  SELECT role INTO v_role FROM app_members WHERE user_id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('client','agent') THEN RAISE EXCEPTION 'not_allowed'; END IF;

  v_target := coalesce(p_for_user, v_uid);
  IF v_target <> v_uid THEN
    IF v_role <> 'agent' OR my_agent_id() IS NULL
       OR NOT EXISTS (SELECT 1 FROM agents a WHERE a.id = my_agent_id() AND a.perm_manage_clients)
       OR NOT EXISTS (SELECT 1 FROM app_members m WHERE m.user_id = v_target AND m.agent_id = my_agent_id() AND m.role = 'client')
    THEN RAISE EXCEPTION 'not_your_client'; END IF;
  ELSIF v_role = 'agent' AND my_agent_id() IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  p_holder_name := btrim(coalesce(p_holder_name,''));
  p_account_number := btrim(coalesce(p_account_number,''));
  p_broker := btrim(coalesce(p_broker,''));
  p_broker_server := nullif(btrim(coalesce(p_broker_server,'')), '');
  IF length(p_holder_name) = 0 OR length(p_holder_name) > 100 THEN RAISE EXCEPTION 'invalid_holder'; END IF;
  IF p_account_number !~ '^[0-9]{3,12}$' THEN RAISE EXCEPTION 'invalid_number'; END IF;
  IF length(p_broker) = 0 OR length(p_broker) > 60 THEN RAISE EXCEPTION 'invalid_broker'; END IF;
  IF p_broker_server IS NOT NULL AND length(p_broker_server) > 120 THEN RAISE EXCEPTION 'invalid_server'; END IF;
  IF p_platform NOT IN ('MT4','MT5') THEN RAISE EXCEPTION 'invalid_platform'; END IF;
  IF length(coalesce(p_password,'')) = 0 OR length(p_password) > 64 THEN RAISE EXCEPTION 'invalid_password'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_master_account AND type = 'master') THEN RAISE EXCEPTION 'invalid_master'; END IF;
  IF p_risk_pct IS NOT NULL OR p_risk_action IS NOT NULL THEN
    IF p_risk_pct IS NULL OR p_risk_pct <= 0 OR p_risk_pct > 100 OR coalesce(p_risk_action,'') NOT IN ('stop_new','close_all')
    THEN RAISE EXCEPTION 'invalid_risk'; END IF;
    p_risk_pct := round(p_risk_pct, 2);
  END IF;

  SELECT left(string_agg(upper(left(regexp_replace(w, '[^A-Za-z]', '', 'g'), 1)), '' ), 4)
    INTO v_initials FROM regexp_split_to_table(p_holder_name, '[\s\-_.]+') AS w;
  v_broker_short := left(regexp_replace(p_broker, '[^A-Za-z0-9]', '', 'g'), 16);
  IF coalesce(v_initials,'') = '' THEN RAISE EXCEPTION 'invalid_holder'; END IF;
  IF v_broker_short = '' THEN RAISE EXCEPTION 'invalid_broker'; END IF;
  v_name := 'F-' || v_initials || '-' || p_account_number || '-' || v_broker_short;
  IF length(v_name) > 28 THEN RAISE EXCEPTION 'name_too_long'; END IF;

  IF EXISTS (SELECT 1 FROM accounts WHERE account_name = v_name)
     OR EXISTS (SELECT 1 FROM account_requests WHERE account_name = v_name AND status = 'pending')
  THEN RAISE EXCEPTION 'already_exists'; END IF;

  INSERT INTO account_requests (requested_by, for_user_id, holder_name, account_number, broker, broker_server, platform,
    account_name, master_account, password, risk_stop_pct, risk_action)
  VALUES (v_uid, v_target, p_holder_name, p_account_number, p_broker, p_broker_server, p_platform,
    v_name, p_master_account, p_password, p_risk_pct, p_risk_action)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION review_account_request(p_id uuid, p_approve boolean, p_note text DEFAULT '')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r account_requests%ROWTYPE;
  v_account_id uuid;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO r FROM account_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  IF NOT p_approve THEN
    UPDATE account_requests SET status = 'rejected', password = '', review_note = left(coalesce(p_note,''), 500),
      reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
    RETURN r.account_name;
  END IF;

  IF EXISTS (SELECT 1 FROM accounts WHERE account_name = r.account_name) THEN RAISE EXCEPTION 'already_exists'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = r.master_account AND type = 'master') THEN RAISE EXCEPTION 'invalid_master'; END IF;

  INSERT INTO accounts (account_name, broker, broker_server, platform, type, holder_name, connection_method, risk_stop_pct, risk_action)
  VALUES (r.account_name, r.broker, r.broker_server, r.platform, 'follower', r.holder_name, 'ea', r.risk_stop_pct, r.risk_action)
  RETURNING id INTO v_account_id;

  INSERT INTO account_credentials (account_id, password, updated_by) VALUES (v_account_id, r.password, auth.uid())
  ON CONFLICT (account_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now(), updated_by = auth.uid();

  INSERT INTO client_accounts (user_id, account_name, created_by)
  SELECT r.for_user_id, r.account_name, auth.uid()
  WHERE NOT EXISTS (SELECT 1 FROM client_accounts WHERE user_id = r.for_user_id AND account_name = r.account_name);

  INSERT INTO copy_settings (master_account, follower_account, enabled)
  SELECT r.master_account, r.account_name, true
  WHERE NOT EXISTS (SELECT 1 FROM copy_settings WHERE master_account = r.master_account AND follower_account = r.account_name);

  UPDATE account_requests SET status = 'approved', password = '', review_note = left(coalesce(p_note,''), 500),
    reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
  RETURN r.account_name;
END $$;

CREATE OR REPLACE FUNCTION enforce_account_risk_stop()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acct text := NEW.account_name;
  v_rows int := 0;
BEGIN
  IF NEW.risk_base_equity IS NULL OR NEW.risk_base_equity <= 0 THEN
    IF coalesce(NEW.balance, 0) > 0 THEN NEW.risk_base_equity := NEW.balance; END IF;
    RETURN NEW;
  END IF;
  IF coalesce(NEW.equity, 0) <= 0 OR NEW.equity > NEW.risk_base_equity * (1 - NEW.risk_stop_pct / 100) THEN
    RETURN NEW;
  END IF;

  NEW.risk_triggered_at := now();
  UPDATE copy_settings SET enabled = false WHERE follower_account = v_acct AND enabled;

  IF NEW.risk_action = 'close_all' THEN
    UPDATE copy_trades ct SET status = 'pending_close'
    FROM live_positions lp
    WHERE lp.account_name = v_acct AND ct.follower_account = v_acct
      AND ct.follower_ticket = lp.ticket AND ct.status = 'open';

    INSERT INTO copy_signals (follower_account, master_account, master_ticket, symbol, order_type, lots,
      status, action, copy_id, close_ticket)
    SELECT v_acct, coalesce(ct.master_account, ''), coalesce(ct.master_ticket, 0), lp.symbol, lp.order_type, lp.lots,
      'pending', 'close', coalesce(ct.copy_id, 'risk:' || v_acct || ':' || lp.ticket), lp.ticket
    FROM live_positions lp
    LEFT JOIN LATERAL (
      SELECT * FROM copy_trades c
      WHERE c.follower_account = v_acct AND c.follower_ticket = lp.ticket AND c.status IN ('open', 'pending_close')
      ORDER BY c.created_at DESC LIMIT 1
    ) ct ON true
    WHERE lp.account_name = v_acct
      AND NOT EXISTS (
        SELECT 1 FROM copy_signals s
        WHERE s.copy_id = coalesce(ct.copy_id, 'risk:' || v_acct || ':' || lp.ticket)
          AND s.action = 'close' AND s.status IN ('pending', 'processing'))
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  INSERT INTO engine_log(message) VALUES (format(
    'Risk stop hit: %s equity %s <= %s%% below base %s. Copying stopped%s',
    v_acct, round(NEW.equity, 2), NEW.risk_stop_pct, round(NEW.risk_base_equity, 2),
    CASE WHEN NEW.risk_action = 'close_all' THEN format(', %s order(s) queued to close', v_rows) ELSE ', positions kept' END));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_account_risk_stop ON accounts;
CREATE TRIGGER trg_enforce_account_risk_stop
BEFORE UPDATE OF equity, balance ON accounts
FOR EACH ROW
WHEN (NEW.risk_stop_pct IS NOT NULL AND NEW.risk_triggered_at IS NULL AND NEW.type = 'follower')
EXECUTE FUNCTION enforce_account_risk_stop();

CREATE OR REPLACE FUNCTION reset_risk_on_copy_reenable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE accounts SET risk_triggered_at = NULL,
    risk_base_equity = CASE WHEN coalesce(equity, 0) > 0 THEN equity ELSE NULL END
  WHERE account_name = NEW.follower_account AND risk_triggered_at IS NOT NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reset_risk_on_copy_reenable ON copy_settings;
CREATE TRIGGER trg_reset_risk_on_copy_reenable
AFTER UPDATE OF enabled ON copy_settings
FOR EACH ROW
WHEN (NEW.enabled AND NOT OLD.enabled)
EXECUTE FUNCTION reset_risk_on_copy_reenable();

REVOKE EXECUTE ON FUNCTION enforce_account_risk_stop() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION reset_risk_on_copy_reenable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION submit_account_request(text, text, text, text, text, text, text, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_account_request(text, text, text, text, text, text, text, uuid, numeric, text) TO authenticated;
