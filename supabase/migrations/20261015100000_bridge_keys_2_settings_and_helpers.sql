/*
# Bridge keys (step 2): enforcement switch + check functions

## Modified table `app_settings`
- `bridge_key_required` (boolean, default false).
  false = transition mode: a terminal sending NO key is still accepted (old EA keeps working),
  but a WRONG key is always rejected. true = every bridge request must carry the correct key.

## New functions
- `bridge_key_ok(account_name)` true if header `x-bridge-key` matches that account's key,
  or (transition mode only) no key was sent and the account exists. Used by row policies.
- `bridge_assert(account_name)` raises permission error (42501) when the account exists but
  the key check fails. Used inside every ea_* RPC. Not callable by clients.
- `regenerate_bridge_key(account_id)` operator-only key rotation, returns the new key.

## Security
- Only operators (`can_operate()`) can rotate keys; anon cannot execute it.
*/

SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='bridge_key_required') THEN
    ALTER TABLE app_settings ADD COLUMN bridge_key_required boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION bridge_key_ok(p_account text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  BEGIN
    v_key := nullif(trim(nullif(current_setting('request.headers', true), '')::json->>'x-bridge-key'), '');
  EXCEPTION WHEN others THEN v_key := NULL;
  END;
  IF v_key IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM account_bridge_keys k JOIN accounts a ON a.id = k.account_id
                   WHERE a.account_name = p_account AND k.bridge_key = v_key);
  END IF;
  RETURN NOT coalesce((SELECT bridge_key_required FROM app_settings LIMIT 1), false)
         AND EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account);
END $$;
REVOKE EXECUTE ON FUNCTION bridge_key_ok(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bridge_key_ok(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION bridge_assert(p_account text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_account IS NOT NULL AND EXISTS (SELECT 1 FROM accounts WHERE account_name = p_account)
     AND NOT bridge_key_ok(p_account) THEN
    RAISE EXCEPTION 'bridge key rejected' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION bridge_assert(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION regenerate_bridge_key(p_account_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  IF NOT can_operate() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO account_bridge_keys (account_id) VALUES (p_account_id)
  ON CONFLICT (account_id) DO UPDATE
    SET bridge_key = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        rotated_at = now(), key_seen_at = NULL
  RETURNING bridge_key INTO v_key;
  RETURN v_key;
END $$;
REVOKE EXECUTE ON FUNCTION regenerate_bridge_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION regenerate_bridge_key(uuid) TO authenticated;