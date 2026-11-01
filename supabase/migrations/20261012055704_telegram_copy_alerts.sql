/*
# Telegram alerts for missed copy trades

Sends a Telegram message from the server whenever a copy trade fails or stays
stuck (pending/processing for 15+ seconds). Works even when nobody has the
website open.

1. New Tables
- `telegram_alert_config` (single row, id = 1)
  - `bot_token` (text) - Telegram bot token, never readable from the browser
  - `bot_username` (text) - bot @name for display
  - `chat_ids` (text[]) - Telegram chats that receive alerts
  - `enabled` (boolean)
  - `enabled_at` (timestamptz) - alerts only cover signals created after this
  - `updated_at` (timestamptz)
- `copy_signal_alerts`
  - `signal_id` (uuid, PK, references copy_signals) - signal already alerted
  - `kind` (text) - 'failed' or 'stuck'
  - `sent_at` (timestamptz)

2. New Functions
- `send_copy_alerts()` - finds new failed/stuck signals, posts one combined
  Telegram message, and records them so each signal alerts only once.
  SECURITY DEFINER, not callable by anon/authenticated.

3. Scheduling
- Enables pg_net (async HTTP) and schedules `send_copy_alerts()` every 10 seconds via pg_cron.

4. Security
- RLS enabled on both tables with NO policies: only the server (service role
  and the scheduled function) can read or write. The website manages the
  config through an admin-only edge function and never sees the bot token.
*/

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS telegram_alert_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token text NOT NULL,
  bot_username text NOT NULL DEFAULT '',
  chat_ids text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE telegram_alert_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS copy_signal_alerts (
  signal_id uuid PRIMARY KEY REFERENCES copy_signals(id) ON DELETE CASCADE,
  kind text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE copy_signal_alerts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS copy_signals_alert_scan_idx
  ON copy_signals (created_at) WHERE status IN ('failed', 'pending', 'processing');

CREATE OR REPLACE FUNCTION public.send_copy_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.send_copy_alerts() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-copy-alerts') THEN
    PERFORM cron.unschedule('send-copy-alerts');
  END IF;
  PERFORM cron.schedule('send-copy-alerts', '10 seconds', 'SELECT public.send_copy_alerts()');
END $$;