/*
# Telegram copy alerts skip paused followers

1. Changes
- `send_copy_alerts()` now only reports failed or stuck copies for followers that
  still have at least one enabled copy link (`copy_settings.enabled = true`).
- Followers whose copying is fully paused, or that are no longer linked to any
  master, no longer trigger Telegram alerts. This matches the EA Health page.

2. Security
- No change. Function stays SECURITY DEFINER with EXECUTE revoked from public roles.
*/

CREATE OR REPLACE FUNCTION public.send_copy_alerts()
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

WITH fresh AS (
SELECT s.id, s.action, s.follower_account, s.master_account, s.symbol, s.lots, s.created_at,
CASE WHEN s.status = 'failed' THEN 'failed' ELSE 'stuck' END AS kind
FROM copy_signals s
WHERE s.action IN ('open', 'close')
AND s.created_at > greatest(cfg.enabled_at, now() - interval '30 minutes')
AND (s.status = 'failed'
OR (s.status IN ('pending', 'processing') AND s.created_at < now() - interval '15 seconds'))
AND EXISTS (SELECT 1 FROM copy_settings c WHERE c.follower_account = s.follower_account AND c.enabled)
AND NOT EXISTS (SELECT 1 FROM copy_signal_alerts a WHERE a.signal_id = s.id)
ORDER BY s.created_at
LIMIT 20
), marked AS (
INSERT INTO copy_signal_alerts (signal_id, kind)
SELECT id, kind FROM fresh
ON CONFLICT DO NOTHING
RETURNING signal_id
)
SELECT jsonb_agg(f ORDER BY f.created_at), count(*)
INTO items, n
FROM fresh f JOIN marked m ON m.signal_id = f.id;

IF n IS NULL OR n = 0 THEN
RETURN;
END IF;

SELECT 'MyTrader Tools - 跟單警報 (' || n || ')' || E'\n' ||
string_agg(
CASE WHEN i->>'kind' = 'failed' THEN '[失敗] ' ELSE '[卡住] ' END ||
CASE WHEN i->>'action' = 'close' THEN '平倉 ' ELSE '開倉 ' END ||
(i->>'symbol') || ' ' || (i->>'lots') || ' 手' || E'\n' ||
'  ' || (i->>'master_account') || ' -> ' || (i->>'follower_account') || '  ' ||
to_char((i->>'created_at')::timestamptz AT TIME ZONE 'Asia/Hong_Kong', 'HH24:MI:SS'),
E'\n')
INTO msg
FROM jsonb_array_elements(items) i;

msg := msg || E'\n\n請到 EA Health 頁面查看。';

FOREACH chat IN ARRAY cfg.chat_ids LOOP
PERFORM net.http_post(
url := 'https://api.telegram.org/bot' || cfg.bot_token || '/sendMessage',
body := jsonb_build_object('chat_id', chat, 'text', left(msg, 4000), 'disable_web_page_preview', true),
headers := '{"Content-Type": "application/json"}'::jsonb
);
END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_copy_alerts() FROM PUBLIC, anon, authenticated;
