/*
# Bridge keys (step 3): every EA function checks the terminal's secret key

## Summary
All `ea_*` functions the MT4/MT5 EA calls now start with `bridge_assert(account)`.
If the account exists and the request does not carry its correct bridge key (or, in
transition mode, carries a wrong key), the call is refused with a permission error.

## Modified functions (logic otherwise unchanged)
- ea_heartbeat, ea_push_symbols, ea_report_holder, ea_report_latency (by account name)
- ea_poll_desk, ea_finish_desk_order (by account)
- ea_take_signals, ea_wait_signals (by follower account)
- ea_claim_signal, ea_set_signal_status (by the signal's follower account)
- ea_update_copy_trade (by the copy trade's follower account)
- ea_heartbeat also stamps `account_bridge_keys.key_seen_at` (at most once a minute)
  when the terminal sent a key, so operators can see which terminals are upgraded.

## Security
- Closes the gap where anyone with the public app key could act as any terminal.
*/

CREATE OR REPLACE FUNCTION public.ea_claim_signal(p_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
PERFORM bridge_assert((SELECT follower_account FROM copy_signals WHERE id = p_id));
UPDATE copy_signals SET status = 'processing', processed_at = now()
WHERE id = p_id AND status = 'pending';
RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_finish_desk_order(p_id uuid, p_account text, p_status text, p_ticket bigint DEFAULT NULL::bigint, p_error text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
PERFORM bridge_assert(p_account);
IF p_status NOT IN ('filled','failed') THEN RAISE EXCEPTION 'invalid status'; END IF;
UPDATE desk_orders SET status = p_status, ticket = p_ticket, error = left(p_error, 300), processed_at = now()
WHERE id = p_id AND account_name = p_account AND status = 'processing';
END $function$;

CREATE OR REPLACE FUNCTION public.ea_heartbeat(p_account_name text, p_balance double precision, p_equity double precision)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
v_id uuid;
v_headers json;
v_raw text;
v_ip text;
BEGIN
PERFORM bridge_assert(p_account_name);
UPDATE accounts
SET balance = p_balance, equity = p_equity, is_active = true, last_seen = now()
WHERE account_name = p_account_name
RETURNING id INTO v_id;

IF v_id IS NULL THEN
RETURN false;
END IF;

BEGIN
v_headers := nullif(current_setting('request.headers', true), '')::json;
v_raw := coalesce(
v_headers->>'cf-connecting-ip',
v_headers->>'x-real-ip',
split_part(v_headers->>'x-forwarded-for', ',', 1)
);
v_ip := host(trim(v_raw)::inet);
EXCEPTION WHEN others THEN
v_ip := NULL;
END;

IF nullif(trim(v_headers->>'x-bridge-key'), '') IS NOT NULL THEN
UPDATE account_bridge_keys SET key_seen_at = now()
WHERE account_id = v_id AND (key_seen_at IS NULL OR key_seen_at < now() - interval '1 minute');
END IF;

IF v_ip IS NOT NULL THEN
INSERT INTO account_credentials (account_id, password, detected_ip, detected_ip_at, updated_by)
VALUES (v_id, '', v_ip, now(), NULL)
ON CONFLICT (account_id) DO UPDATE
SET detected_ip = EXCLUDED.detected_ip, detected_ip_at = EXCLUDED.detected_ip_at
WHERE account_credentials.detected_ip_at IS NULL
OR account_credentials.detected_ip_at < now() - interval '1 hour'
OR account_credentials.detected_ip IS DISTINCT FROM EXCLUDED.detected_ip;
END IF;

RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_poll_desk(p_account text, p_quotes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_watch jsonb; v_orders jsonb;
BEGIN
PERFORM bridge_assert(p_account);
IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account AND type = 'master') THEN
RETURN jsonb_build_object('watch', '[]'::jsonb, 'orders', '[]'::jsonb, 'active', false, 'is_master', false);
END IF;

INSERT INTO desk_terminals (account_name, polled_at) VALUES (p_account, now())
ON CONFLICT (account_name) DO UPDATE SET polled_at = now();

IF jsonb_typeof(p_quotes) = 'array' AND jsonb_array_length(p_quotes) > 0 THEN
INSERT INTO account_quotes (account_name, symbol, bid, ask, digits, vol_min, vol_step, vol_max, quoted_at)
SELECT p_account, q->>'s', (q->>'b')::float8, (q->>'a')::float8, coalesce((q->>'d')::int, 5),
coalesce((q->>'mn')::float8, 0.01), coalesce((q->>'st')::float8, 0.01), coalesce((q->>'mx')::float8, 0), now()
FROM (SELECT q FROM jsonb_array_elements(p_quotes) q LIMIT 20) t
WHERE EXISTS (SELECT 1 FROM desk_watch w WHERE w.account_name = p_account AND w.symbol = q->>'s' AND w.until > now())
ON CONFLICT (account_name, symbol) DO UPDATE SET
bid = EXCLUDED.bid, ask = EXCLUDED.ask, digits = EXCLUDED.digits, vol_min = EXCLUDED.vol_min,
vol_step = EXCLUDED.vol_step, vol_max = EXCLUDED.vol_max, quoted_at = EXCLUDED.quoted_at;
END IF;

UPDATE desk_orders SET status = 'expired', processed_at = now(), error = 'Terminal did not pick up the order within 30 seconds'
WHERE account_name = p_account AND status = 'pending' AND created_at < now() - interval '30 seconds';

WITH c AS (
SELECT id FROM desk_orders WHERE account_name = p_account AND status = 'pending'
ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
), u AS (
UPDATE desk_orders d SET status = 'processing', processed_at = now() FROM c WHERE d.id = c.id
RETURNING d.id, d.symbol, d.order_type, d.lots, d.price, d.sl, d.tp, d.comment, d.created_at
)
SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'symbol', symbol, 'order_type', order_type, 'lots', lots,
'price', price, 'sl', sl, 'tp', tp, 'comment', comment) ORDER BY created_at), '[]'::jsonb)
INTO v_orders FROM u;

SELECT coalesce(jsonb_agg(symbol), '[]'::jsonb) INTO v_watch
FROM (SELECT symbol FROM desk_watch WHERE account_name = p_account AND until > now() LIMIT 20) w;

RETURN jsonb_build_object('watch', v_watch, 'orders', v_orders, 'active', jsonb_array_length(v_watch) > 0, 'is_master', true);
END $function$;

CREATE OR REPLACE FUNCTION public.ea_push_symbols(p_account_name text, p_symbols text[])
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
v_clean text[];
BEGIN
PERFORM bridge_assert(p_account_name);
IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account_name) THEN
RETURN false;
END IF;

SELECT coalesce(array_agg(s ORDER BY s), '{}') INTO v_clean
FROM (
SELECT DISTINCT trim(x) AS s
FROM unnest(coalesce(p_symbols, '{}')) AS x
WHERE length(trim(x)) BETWEEN 1 AND 64
LIMIT 10000
) t;

INSERT INTO account_symbols (account_name, symbols, updated_at)
VALUES (p_account_name, v_clean, now())
ON CONFLICT (account_name) DO UPDATE
SET symbols = EXCLUDED.symbols, updated_at = EXCLUDED.updated_at;

RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_report_holder(p_account_name text, p_holder text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
v_name text := trim(coalesce(p_holder, ''));
BEGIN
PERFORM bridge_assert(p_account_name);
IF length(v_name) = 0 OR length(v_name) > 100 THEN RETURN false; END IF;
UPDATE accounts
SET mt_holder_name = v_name, mt_holder_at = now()
WHERE account_name = p_account_name;
RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_report_latency(p_account_name text, p_broker_ping_ms integer, p_cloud_ms integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
v_id uuid;
BEGIN
PERFORM bridge_assert(p_account_name);
UPDATE accounts
SET broker_ping_ms = CASE WHEN p_broker_ping_ms IS NULL OR p_broker_ping_ms < 0 THEN NULL ELSE least(p_broker_ping_ms, 60000) END,
cloud_rtt_ms = CASE WHEN p_cloud_ms IS NULL OR p_cloud_ms < 0 THEN NULL ELSE least(p_cloud_ms, 60000) END,
latency_at = now()
WHERE account_name = p_account_name
RETURNING id INTO v_id;
RETURN v_id IS NOT NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_set_signal_status(p_id uuid, p_status text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
PERFORM bridge_assert((SELECT follower_account FROM copy_signals WHERE id = p_id));
IF p_status NOT IN ('pending', 'processing', 'executed', 'failed', 'cancelled') THEN
RAISE EXCEPTION 'invalid signal status';
END IF;
UPDATE copy_signals
SET status = p_status, processed_at = now()
WHERE id = p_id AND status IN ('pending', 'processing');
END $function$;

CREATE OR REPLACE FUNCTION public.ea_take_signals(p_follower text, p_limit integer DEFAULT 10)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
r record;
v_out jsonb := '[]'::jsonb;
BEGIN
PERFORM bridge_assert(p_follower);
FOR r IN
WITH c AS (
SELECT s.id FROM copy_signals s
WHERE s.follower_account = p_follower AND s.status = 'pending'
ORDER BY s.created_at
LIMIT least(greatest(coalesce(p_limit, 10), 1), 20)
FOR UPDATE SKIP LOCKED
), u AS (
UPDATE copy_signals s SET status = 'processing', processed_at = now()
FROM c WHERE s.id = c.id
RETURNING s.*
)
SELECT u.*, ct.status AS ct_status, ct.follower_ticket
FROM u LEFT JOIN copy_trades ct ON ct.copy_id = u.copy_id
ORDER BY u.created_at
LOOP
IF r.action = 'open' THEN
IF r.ct_status IS DISTINCT FROM 'pending_open' THEN
UPDATE copy_signals SET status = 'cancelled', processed_at = now() WHERE id = r.id;
CONTINUE;
END IF;
IF NOT EXISTS (SELECT 1 FROM live_positions lp WHERE lp.account_name = r.master_account AND lp.ticket = r.master_ticket) THEN
UPDATE copy_signals SET status = 'cancelled', processed_at = now() WHERE id = r.id;
PERFORM ea_update_copy_trade(r.copy_id, 'cancelled', NULL, 'master_closed', NULL);
CONTINUE;
END IF;
END IF;

v_out := v_out || jsonb_build_object(
'id', r.id, 'action', coalesce(r.action, 'open'), 'copy_id', r.copy_id,
'master_account', r.master_account, 'master_ticket', r.master_ticket,
'symbol', r.symbol, 'order_type', r.order_type, 'lots', r.lots,
'open_price', r.open_price, 'sl', r.sl, 'tp', r.tp, 'magic', r.magic,
'follower_ticket', coalesce(r.close_ticket, r.follower_ticket));
END LOOP;
RETURN v_out;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_update_copy_trade(p_copy_id text, p_status text, p_follower_ticket bigint DEFAULT NULL::bigint, p_cancel_reason text DEFAULT NULL::text, p_lots double precision DEFAULT NULL::double precision)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
PERFORM bridge_assert((SELECT follower_account FROM copy_trades WHERE copy_id = p_copy_id LIMIT 1));
IF p_status NOT IN ('open', 'closed', 'cancelled') THEN
RAISE EXCEPTION 'invalid copy trade status';
END IF;
UPDATE copy_trades
SET status          = p_status,
follower_ticket = COALESCE(p_follower_ticket, follower_ticket),
cancel_reason   = COALESCE(p_cancel_reason, cancel_reason),
lots            = COALESCE(p_lots, lots),
opened_at       = CASE WHEN p_status = 'open' THEN now() ELSE opened_at END,
closed_at       = CASE WHEN p_status IN ('closed', 'cancelled') THEN now() ELSE closed_at END
WHERE copy_id = p_copy_id;
END $function$;

CREATE OR REPLACE FUNCTION public.ea_wait_signals(p_follower text, p_limit integer DEFAULT 10, p_wait_ms integer DEFAULT 1500)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
v_deadline timestamptz := clock_timestamp()
+ make_interval(secs => least(greatest(coalesce(p_wait_ms, 0), 0), 2000) / 1000.0);
v_is_follower boolean;
BEGIN
PERFORM bridge_assert(p_follower);
SELECT EXISTS (SELECT 1 FROM accounts WHERE account_name = p_follower AND type = 'follower')
INTO v_is_follower;

LOOP
IF EXISTS (SELECT 1 FROM copy_signals WHERE follower_account = p_follower AND status = 'pending') THEN
RETURN ea_take_signals(p_follower, p_limit);
END IF;
EXIT WHEN NOT v_is_follower OR clock_timestamp() >= v_deadline;
PERFORM pg_sleep(0.025);
END LOOP;
RETURN '[]'::jsonb;
END $function$;