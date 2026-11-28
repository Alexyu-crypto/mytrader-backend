/*
# Relay Gateway link (Windows Gateway for the Relay Test group)

Lets the Windows Relay Gateway program report that it is connected and write copy-log rows for the
"Copy Group - Relay Test" group. Nothing here touches copy_settings, copy_groups, the live copy
engine, MetaAPI or any cron job.

1. Modified tables
- `relay_groups`
  - `gateway_key_hash` (text): SHA-256 of the gateway key. The key itself is never stored.
  - `gateway_seen_at` (timestamptz): last heartbeat from the gateway. Fresh = "Relay 已接入".
  - `gateway_status` (jsonb): last status the gateway reported (which accounts are logged in).
- `relay_copy_log`
  - `gateway_received_at` (timestamptz): when the gateway saw the master trade.
  - `side` (text), `master_lots`, `follower_lots` (numeric): trade details.
  - Unique index (group_id, master_ticket, follower_account) so a resent row updates instead of duplicating.

2. New functions
- `relay_gateway_rotate_key(group_id)`: operators only. Creates a new key, stores its hash,
  returns the key once.
- `relay_gateway_heartbeat(key, status)`: called by the gateway. Marks the group connected and
  returns the group's master + follower copy settings.
- `relay_gateway_log(...)`: called by the gateway. Writes / updates one copy-log row.

3. Security
- The two gateway functions run with owner rights but only act when the key hash matches a group;
  a wrong key raises a permission error. They only ever write to the matching Relay test group.
- The key-rotation function checks can_operate() and is not callable by anon.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='relay_groups' AND column_name='gateway_key_hash') THEN
    ALTER TABLE relay_groups ADD COLUMN gateway_key_hash text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='relay_groups' AND column_name='gateway_seen_at') THEN
    ALTER TABLE relay_groups ADD COLUMN gateway_seen_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='relay_groups' AND column_name='gateway_status') THEN
    ALTER TABLE relay_groups ADD COLUMN gateway_status jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='relay_copy_log' AND column_name='gateway_received_at') THEN
    ALTER TABLE relay_copy_log ADD COLUMN gateway_received_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='relay_copy_log' AND column_name='side') THEN
    ALTER TABLE relay_copy_log ADD COLUMN side text NOT NULL DEFAULT '' CHECK (side IN ('', 'buy', 'sell'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='relay_copy_log' AND column_name='master_lots') THEN
    ALTER TABLE relay_copy_log ADD COLUMN master_lots numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='relay_copy_log' AND column_name='follower_lots') THEN
    ALTER TABLE relay_copy_log ADD COLUMN follower_lots numeric;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS relay_copy_log_trade_uidx ON relay_copy_log(group_id, master_ticket, follower_account);
CREATE UNIQUE INDEX IF NOT EXISTS relay_groups_gateway_key_uidx ON relay_groups(gateway_key_hash) WHERE gateway_key_hash IS NOT NULL;

REVOKE UPDATE ON relay_groups FROM authenticated;
GRANT UPDATE (engine, backfill_days, updated_at) ON relay_groups TO authenticated;

CREATE OR REPLACE FUNCTION relay_gateway_rotate_key(p_group_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  v_key := 'rgw_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  UPDATE relay_groups SET gateway_key_hash = encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), gateway_seen_at = NULL, updated_at = now()
  WHERE id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group not found'; END IF;
  RETURN v_key;
END $$;
REVOKE EXECUTE ON FUNCTION relay_gateway_rotate_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION relay_gateway_rotate_key(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION relay_gateway_heartbeat(p_key text, p_status jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group relay_groups%ROWTYPE; v_members jsonb;
BEGIN
  SELECT * INTO v_group FROM relay_groups
  WHERE gateway_key_hash IS NOT NULL AND gateway_key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  IF NOT FOUND THEN RAISE EXCEPTION 'gateway key rejected' USING ERRCODE = '42501'; END IF;
  IF pg_column_size(p_status) > 4000 THEN p_status := '{}'::jsonb; END IF;

  UPDATE relay_groups SET gateway_seen_at = now(), gateway_status = coalesce(p_status, '{}'::jsonb) WHERE id = v_group.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'slot', m.slot, 'role', m.role, 'account_name', m.account_name, 'broker', m.broker,
      'enabled', m.enabled, 'mode', m.mode, 'lot_multiplier', m.lot_multiplier, 'fixed_lot', m.fixed_lot,
      'min_lot', m.min_lot, 'max_lot', m.max_lot, 'reverse', m.reverse, 'copy_sl', m.copy_sl, 'copy_tp', m.copy_tp,
      'allowed_symbols', m.allowed_symbols, 'blocked_symbols', m.blocked_symbols, 'symbol_map', m.symbol_map,
      'strip_suffix', m.strip_suffix, 'add_prefix', m.add_prefix, 'add_suffix', m.add_suffix,
      'broker_server', a.broker_server) ORDER BY m.slot), '[]'::jsonb)
  INTO v_members
  FROM relay_group_members m LEFT JOIN accounts a ON a.account_name = m.account_name
  WHERE m.group_id = v_group.id AND m.account_name IS NOT NULL;

  RETURN jsonb_build_object('group_id', v_group.id, 'group', v_group.name, 'engine', v_group.engine,
                            'server_time', now(), 'members', v_members);
END $$;
REVOKE EXECUTE ON FUNCTION relay_gateway_heartbeat(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION relay_gateway_heartbeat(text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION relay_gateway_log(
  p_key text, p_master_ticket bigint, p_follower text, p_symbol text, p_side text,
  p_master_lots numeric, p_follower_lots numeric, p_master_opened_at timestamptz,
  p_gateway_received_at timestamptz, p_follower_received_at timestamptz,
  p_follower_ticket bigint, p_status text, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group uuid; v_master text; v_broker text; v_id uuid;
BEGIN
  SELECT id INTO v_group FROM relay_groups
  WHERE gateway_key_hash IS NOT NULL AND gateway_key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  IF v_group IS NULL THEN RAISE EXCEPTION 'gateway key rejected' USING ERRCODE = '42501'; END IF;
  IF p_master_ticket IS NULL OR p_master_opened_at IS NULL THEN RAISE EXCEPTION 'master ticket and open time required'; END IF;
  IF p_status NOT IN ('pending', 'copied', 'missed', 'failed') THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF coalesce(p_side, '') NOT IN ('', 'buy', 'sell') THEN RAISE EXCEPTION 'invalid side'; END IF;

  SELECT account_name INTO v_master FROM relay_group_members WHERE group_id = v_group AND slot = 1;
  SELECT broker INTO v_broker FROM relay_group_members
  WHERE group_id = v_group AND role = 'follower' AND account_name = p_follower;
  IF v_master IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'account not in this group'; END IF;

  INSERT INTO relay_copy_log (group_id, master_account, follower_account, broker, symbol, side, master_ticket,
    follower_ticket, master_lots, follower_lots, master_opened_at, gateway_received_at, follower_received_at, status, reason)
  VALUES (v_group, v_master, p_follower, coalesce(v_broker, ''), left(coalesce(p_symbol, ''), 30), coalesce(p_side, ''),
    p_master_ticket, p_follower_ticket, p_master_lots, p_follower_lots, p_master_opened_at, p_gateway_received_at,
    p_follower_received_at, p_status, left(p_reason, 300))
  ON CONFLICT (group_id, master_ticket, follower_account) DO UPDATE SET
    follower_ticket = coalesce(EXCLUDED.follower_ticket, relay_copy_log.follower_ticket),
    follower_lots = coalesce(EXCLUDED.follower_lots, relay_copy_log.follower_lots),
    gateway_received_at = coalesce(relay_copy_log.gateway_received_at, EXCLUDED.gateway_received_at),
    follower_received_at = coalesce(EXCLUDED.follower_received_at, relay_copy_log.follower_received_at),
    status = EXCLUDED.status, reason = EXCLUDED.reason
  RETURNING id INTO v_id;

  UPDATE relay_groups SET gateway_seen_at = now() WHERE id = v_group;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION relay_gateway_log(text, bigint, text, text, text, numeric, numeric, timestamptz, timestamptz, timestamptz, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION relay_gateway_log(text, bigint, text, text, text, numeric, numeric, timestamptz, timestamptz, timestamptz, bigint, text, text) TO anon, authenticated;
