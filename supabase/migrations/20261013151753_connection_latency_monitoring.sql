/*
# Connection latency monitoring

1. Modified Tables
- `accounts`
  - `broker_ping_ms` (integer, nullable): last ping from the MT4/MT5 terminal to the broker trade server, in milliseconds.
  - `cloud_rtt_ms` (integer, nullable): average round trip from the EA to this app's cloud, in milliseconds.
  - `latency_at` (timestamptz, nullable): when the EA last reported these numbers.

2. New Tables
- `latency_alerts` (internal): remembers when a Telegram slow-connection alert was last sent per account,
  so each account alerts at most once per hour.
  - `account_name` (text, primary key)
  - `alerted_at` (timestamptz)

3. New Functions
- `ea_report_latency(p_account_name, p_broker_ping_ms, p_cloud_ms)`: called by EA v2.7 every 15s.
  Values are clamped to 0..60000; negative values are stored as NULL (unknown). Only updates existing accounts.
- `send_latency_alerts()`: scheduled every minute. Sends one Telegram message listing accounts whose recent
  report shows broker ping >= 150 ms or cloud round trip >= 1000 ms. Paused / unlinked followers are skipped.

4. Security
- RLS enabled on `latency_alerts` with no policies (only server functions use it).
- `ea_report_latency` is SECURITY DEFINER, callable by anon/authenticated like the other EA functions.
- `send_latency_alerts` is not callable by public roles.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS broker_ping_ms integer;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cloud_rtt_ms integer;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS latency_at timestamptz;

CREATE TABLE IF NOT EXISTS latency_alerts (
  account_name text PRIMARY KEY,
  alerted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE latency_alerts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ea_report_latency(p_account_name text, p_broker_ping_ms integer, p_cloud_ms integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_id uuid;
BEGIN
UPDATE accounts
SET broker_ping_ms = CASE WHEN p_broker_ping_ms IS NULL OR p_broker_ping_ms < 0 THEN NULL ELSE least(p_broker_ping_ms, 60000) END,
    cloud_rtt_ms = CASE WHEN p_cloud_ms IS NULL OR p_cloud_ms < 0 THEN NULL ELSE least(p_cloud_ms, 60000) END,
    latency_at = now()
WHERE account_name = p_account_name
RETURNING id INTO v_id;
RETURN v_id IS NOT NULL;
END $function$;

REVOKE ALL ON FUNCTION public.ea_report_latency(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ea_report_latency(text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_latency_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
cfg telegram_alert_config;
items jsonb;
n int;
msg text;
chat text;
BEGIN
SELECT * INTO cfg FROM telegram_alert_config WHERE id = 1;
IF cfg IS NULL OR NOT cfg.enabled OR cardinality(cfg.chat_ids) = 0 THEN
RETURN;
END IF;

WITH slow AS (
SELECT a.account_name, a.broker, a.broker_ping_ms, a.cloud_rtt_ms
FROM accounts a
WHERE a.latency_at > now() - interval '2 minutes'
AND (a.broker_ping_ms >= 150 OR a.cloud_rtt_ms >= 1000)
AND (a.type = 'master' OR EXISTS (SELECT 1 FROM copy_settings c WHERE c.follower_account = a.account_name AND c.enabled))
AND NOT EXISTS (SELECT 1 FROM latency_alerts l WHERE l.account_name = a.account_name AND l.alerted_at > now() - interval '1 hour')
ORDER BY a.account_name
LIMIT 20
), marked AS (
INSERT INTO latency_alerts (account_name, alerted_at)
SELECT account_name, now() FROM slow
ON CONFLICT (account_name) DO UPDATE SET alerted_at = EXCLUDED.alerted_at
RETURNING account_name
)
SELECT jsonb_agg(s ORDER BY s.account_name), count(*)
INTO items, n
FROM slow s JOIN marked m ON m.account_name = s.account_name;

IF n IS NULL OR n = 0 THEN
RETURN;
END IF;

SELECT 'MyTrader Tools - 連線延遲警報 (' || n || ')' || E'\n' ||
string_agg(
(i->>'account_name') || '  ' || coalesce(i->>'broker', '') || E'\n' ||
'  券商 ' || coalesce((i->>'broker_ping_ms') || ' ms', '-') ||
' / 雲端 ' || coalesce((i->>'cloud_rtt_ms') || ' ms', '-'),
E'\n')
INTO msg
FROM jsonb_array_elements(items) i;

msg := msg || E'\n\n請在終端機重新掃描伺服器，或把戶口搬到較近的 VPS。詳情請到 EA Health 頁面。';

FOREACH chat IN ARRAY cfg.chat_ids LOOP
PERFORM net.http_post(
url := 'https://api.telegram.org/bot' || cfg.bot_token || '/sendMessage',
body := jsonb_build_object('chat_id', chat, 'text', left(msg, 4000), 'disable_web_page_preview', true),
headers := '{"Content-Type": "application/json"}'::jsonb
);
END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_latency_alerts() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-latency-alerts') THEN
PERFORM cron.schedule('send-latency-alerts', '* * * * *', 'SELECT public.send_latency_alerts()');
END IF;
END $$;
