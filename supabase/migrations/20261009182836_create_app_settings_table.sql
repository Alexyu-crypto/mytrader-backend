/*
# Create app_settings table for configurable Friday close and crypto symbols

1. New Table: app_settings
   - id: uuid PK (single row, keyed by id)
   - friday_close_enabled: boolean DEFAULT true — whether to suppress new opens before Friday close
   - friday_close_utc_hour: int DEFAULT 21 — UTC hour the market closes (21 = 21:00 UTC)
   - friday_close_safe_minutes: int DEFAULT 15 — minutes before close to stop opening
   - weekend_pause_enabled: boolean DEFAULT true — whether to pause all signals on weekends
   - crypto_symbols: text[] DEFAULT '{BTCUSD, ETHUSD, BTCUSDT, ETHUSDT}' — symbols that trade 24/7, skip weekend pause
   - signal_max_age_sec: int DEFAULT 300 — pending signals older than this are auto-expired
   - created_at: timestamptz

2. Security
   - RLS enabled, anon + authenticated full CRUD (single-tenant, no auth)

3. Notes
   - The copy engine reads this table at the start of each cycle to decide
     whether to suppress new opens near Friday close or pause on weekends.
   - Crypto symbols (BTCUSD, ETHUSD, etc.) bypass the weekend pause so
     copy trading continues Saturday/Sunday for those pairs.
   - A seed row with defaults is inserted so the app has values immediately.
*/

CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  friday_close_enabled boolean DEFAULT true,
  friday_close_utc_hour int DEFAULT 21,
  friday_close_safe_minutes int DEFAULT 15,
  weekend_pause_enabled boolean DEFAULT true,
  crypto_symbols text[] DEFAULT '{BTCUSD, ETHUSD, BTCUSDT, ETHUSDT}',
  signal_max_age_sec int DEFAULT 300,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_app_settings" ON app_settings;
CREATE POLICY "anon_select_app_settings" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_app_settings" ON app_settings;
CREATE POLICY "anon_insert_app_settings" ON app_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_app_settings" ON app_settings;
CREATE POLICY "anon_update_app_settings" ON app_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_app_settings" ON app_settings;
CREATE POLICY "anon_delete_app_settings" ON app_settings FOR DELETE
  TO anon, authenticated USING (true);

-- Seed a single row with defaults if none exists
INSERT INTO app_settings (friday_close_enabled, friday_close_utc_hour, friday_close_safe_minutes, weekend_pause_enabled, crypto_symbols, signal_max_age_sec)
SELECT true, 21, 15, true, '{BTCUSD, ETHUSD, BTCUSDT, ETHUSDT}', 300
WHERE NOT EXISTS (SELECT 1 FROM app_settings);
