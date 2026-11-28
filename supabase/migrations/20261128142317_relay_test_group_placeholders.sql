/*
# Relay Test copy group (placeholders only)

Prepares a standalone test copy group for the future Cloud Relay engine. Nothing here places
trades: the live copy engine (run_copy_engine, sync_copy_stops, metaapi relay) only reads
copy_settings / copy_groups, which this migration does NOT touch.

1. New Tables
- `relay_groups`: one row per relay test group.
  - `id` uuid PK, `name` text unique, `engine` text (metaapi | ea | cloud_relay, default cloud_relay),
    `backfill_days` int (30 | 90, default 30), `created_at`, `updated_at`.
- `relay_group_members`: up to 10 slots per group (slot 1 = master, 2-10 = followers).
  - `account_name` (nullable, references accounts; empty slot = placeholder for a future demo account),
    `broker` free-text label.
  - Same lot / filter / symbol columns as copy_settings (mode, lot_multiplier, fixed_lot, min_lot,
    max_lot, reverse, copy_pending_orders, copy_sl, copy_tp, max_open_trades, allowed_symbols,
    blocked_symbols, symbol_map, strip_suffix, add_prefix, add_suffix, enabled) so the existing
    copy settings editor can be reused.
- `relay_contract_sizes`: per follower slot and master symbol, the contract size on master vs follower
  (e.g. XAUUSD 100 oz vs GOLD 10 oz).
- `relay_backfill_jobs`: queued history backfill requests (30 / 90 days). Nothing processes them yet.
- `relay_copy_log`: future per-trade log (master open time, follower receive time, delay, missed / broker).
  `delay_ms` is computed automatically.

2. Seed
- Group "Copy Group - Relay Test" with engine cloud_relay and 10 empty slots (1 master + 9 followers).

3. Security
- RLS on every table. Read and write limited to operators (`can_operate()`: active admin / trader).
- `relay_copy_log` is read-only for operators; future relay service writes via service_role.

4. Notes
- No triggers, no cron jobs, no changes to existing tables or functions.
*/

CREATE TABLE IF NOT EXISTS relay_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  engine text NOT NULL DEFAULT 'cloud_relay' CHECK (engine IN ('metaapi', 'ea', 'cloud_relay')),
  backfill_days int NOT NULL DEFAULT 30 CHECK (backfill_days IN (30, 90)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS relay_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES relay_groups(id) ON DELETE CASCADE,
  slot int NOT NULL CHECK (slot BETWEEN 1 AND 10),
  role text NOT NULL CHECK (role IN ('master', 'follower')),
  account_name text REFERENCES accounts(account_name) ON UPDATE CASCADE ON DELETE SET NULL,
  broker text NOT NULL DEFAULT '' CHECK (char_length(broker) <= 60),
  enabled boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'multiplier' CHECK (mode IN ('multiplier', 'fixed', 'ratio')),
  lot_multiplier double precision NOT NULL DEFAULT 1.0,
  fixed_lot double precision NOT NULL DEFAULT 0.01,
  min_lot double precision NOT NULL DEFAULT 0.01,
  max_lot double precision NOT NULL DEFAULT 20,
  reverse boolean NOT NULL DEFAULT false,
  copy_pending_orders boolean NOT NULL DEFAULT false,
  copy_sl boolean NOT NULL DEFAULT true,
  copy_tp boolean NOT NULL DEFAULT true,
  max_open_trades int NOT NULL DEFAULT 0,
  allowed_symbols text[] NOT NULL DEFAULT '{}',
  blocked_symbols text[] NOT NULL DEFAULT '{}',
  symbol_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  strip_suffix text NOT NULL DEFAULT '',
  add_prefix text NOT NULL DEFAULT '',
  add_suffix text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, slot),
  UNIQUE (group_id, account_name),
  CHECK ((slot = 1) = (role = 'master'))
);

CREATE TABLE IF NOT EXISTS relay_contract_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES relay_group_members(id) ON DELETE CASCADE,
  master_symbol text NOT NULL CHECK (char_length(btrim(master_symbol)) BETWEEN 1 AND 30),
  master_contract_size numeric NOT NULL CHECK (master_contract_size > 0),
  follower_contract_size numeric NOT NULL CHECK (follower_contract_size > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, master_symbol)
);

CREATE TABLE IF NOT EXISTS relay_backfill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES relay_groups(id) ON DELETE CASCADE,
  days int NOT NULL CHECK (days IN (30, 90)),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  rows_imported int NOT NULL DEFAULT 0,
  requested_by uuid DEFAULT auth.uid(),
  requested_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS relay_copy_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES relay_groups(id) ON DELETE CASCADE,
  master_account text NOT NULL,
  follower_account text NOT NULL,
  broker text NOT NULL DEFAULT '',
  symbol text NOT NULL DEFAULT '',
  master_ticket bigint,
  follower_ticket bigint,
  master_opened_at timestamptz NOT NULL,
  follower_received_at timestamptz,
  delay_ms bigint GENERATED ALWAYS AS ((EXTRACT(EPOCH FROM (follower_received_at - master_opened_at)) * 1000)::bigint) STORED,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'copied', 'missed', 'failed')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relay_group_members_group_idx ON relay_group_members(group_id);
CREATE INDEX IF NOT EXISTS relay_backfill_jobs_group_idx ON relay_backfill_jobs(group_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS relay_copy_log_group_idx ON relay_copy_log(group_id, master_opened_at DESC);

ALTER TABLE relay_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_contract_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_backfill_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_copy_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON relay_groups TO authenticated;
GRANT SELECT, UPDATE ON relay_group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON relay_contract_sizes TO authenticated;
GRANT SELECT, INSERT ON relay_backfill_jobs TO authenticated;
GRANT SELECT ON relay_copy_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON relay_groups, relay_group_members, relay_contract_sizes, relay_backfill_jobs, relay_copy_log TO service_role;

DROP POLICY IF EXISTS "operator_select_relay_groups" ON relay_groups;
CREATE POLICY "operator_select_relay_groups" ON relay_groups FOR SELECT TO authenticated USING (can_operate());
DROP POLICY IF EXISTS "operator_update_relay_groups" ON relay_groups;
CREATE POLICY "operator_update_relay_groups" ON relay_groups FOR UPDATE TO authenticated USING (can_operate()) WITH CHECK (can_operate());

DROP POLICY IF EXISTS "operator_select_relay_members" ON relay_group_members;
CREATE POLICY "operator_select_relay_members" ON relay_group_members FOR SELECT TO authenticated USING (can_operate());
DROP POLICY IF EXISTS "operator_update_relay_members" ON relay_group_members;
CREATE POLICY "operator_update_relay_members" ON relay_group_members FOR UPDATE TO authenticated USING (can_operate()) WITH CHECK (can_operate());

DROP POLICY IF EXISTS "operator_select_relay_sizes" ON relay_contract_sizes;
CREATE POLICY "operator_select_relay_sizes" ON relay_contract_sizes FOR SELECT TO authenticated USING (can_operate());
DROP POLICY IF EXISTS "operator_insert_relay_sizes" ON relay_contract_sizes;
CREATE POLICY "operator_insert_relay_sizes" ON relay_contract_sizes FOR INSERT TO authenticated WITH CHECK (can_operate());
DROP POLICY IF EXISTS "operator_update_relay_sizes" ON relay_contract_sizes;
CREATE POLICY "operator_update_relay_sizes" ON relay_contract_sizes FOR UPDATE TO authenticated USING (can_operate()) WITH CHECK (can_operate());
DROP POLICY IF EXISTS "operator_delete_relay_sizes" ON relay_contract_sizes;
CREATE POLICY "operator_delete_relay_sizes" ON relay_contract_sizes FOR DELETE TO authenticated USING (can_operate());

DROP POLICY IF EXISTS "operator_select_relay_backfill" ON relay_backfill_jobs;
CREATE POLICY "operator_select_relay_backfill" ON relay_backfill_jobs FOR SELECT TO authenticated USING (can_operate());
DROP POLICY IF EXISTS "operator_insert_relay_backfill" ON relay_backfill_jobs;
CREATE POLICY "operator_insert_relay_backfill" ON relay_backfill_jobs FOR INSERT TO authenticated
  WITH CHECK (can_operate() AND status = 'queued' AND rows_imported = 0 AND finished_at IS NULL AND requested_by = auth.uid());

DROP POLICY IF EXISTS "operator_select_relay_log" ON relay_copy_log;
CREATE POLICY "operator_select_relay_log" ON relay_copy_log FOR SELECT TO authenticated USING (can_operate());

INSERT INTO relay_groups (name, engine) VALUES ('Copy Group - Relay Test', 'cloud_relay')
ON CONFLICT (name) DO NOTHING;

INSERT INTO relay_group_members (group_id, slot, role)
SELECT g.id, s, CASE WHEN s = 1 THEN 'master' ELSE 'follower' END
FROM relay_groups g CROSS JOIN generate_series(1, 10) AS s
WHERE g.name = 'Copy Group - Relay Test'
ON CONFLICT (group_id, slot) DO NOTHING;
