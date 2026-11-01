/*
# Encrypt IB backend portal passwords and log every reveal

1. Changes
  - A random encryption key is stored in the Supabase Vault as `ib_portal_key` (created once).
  - `ib_portal_secrets.password_enc` (bytea): new encrypted password column.
  - Existing plain-text passwords are encrypted into `password_enc`, then the plain `password`
    column is cleared and made nullable. A check now forbids any plain-text value being stored again.
  - `ib_events.kind` may now also be 'reveal' (password viewed) and 'document' (file uploaded/removed).

2. New Functions (SECURITY DEFINER, authenticated only, caller must pass can_manage_ib())
  - `ib_set_portal_password(p_broker, p_password)`: encrypts and saves, logs a timeline entry.
  - `ib_reveal_portal_password(p_broker)`: decrypts, logs "password viewed" with who/when, returns text.

3. Security
  - All direct table access to `ib_portal_secrets` is revoked from anon and authenticated and its
    policies removed; the two functions above are the only way in.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ib_portal_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'ib_portal_key', 'Encryption key for IB backend portal passwords');
  END IF;
END $$;

ALTER TABLE ib_portal_secrets ADD COLUMN IF NOT EXISTS password_enc bytea;
ALTER TABLE ib_portal_secrets DROP CONSTRAINT IF EXISTS ib_portal_secrets_password_check;
ALTER TABLE ib_portal_secrets ALTER COLUMN password DROP NOT NULL;

UPDATE ib_portal_secrets
SET password_enc = extensions.pgp_sym_encrypt(password, (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ib_portal_key')),
    password = NULL
WHERE password IS NOT NULL;

ALTER TABLE ib_portal_secrets DROP CONSTRAINT IF EXISTS ib_portal_secrets_no_plaintext;
ALTER TABLE ib_portal_secrets ADD CONSTRAINT ib_portal_secrets_no_plaintext CHECK (password IS NULL);

DROP POLICY IF EXISTS "ib_select_secrets" ON ib_portal_secrets;
DROP POLICY IF EXISTS "ib_insert_secrets" ON ib_portal_secrets;
DROP POLICY IF EXISTS "ib_update_secrets" ON ib_portal_secrets;
DROP POLICY IF EXISTS "ib_delete_secrets" ON ib_portal_secrets;
REVOKE ALL ON ib_portal_secrets FROM anon, authenticated;

ALTER TABLE ib_events DROP CONSTRAINT IF EXISTS ib_events_kind_check;
ALTER TABLE ib_events ADD CONSTRAINT ib_events_kind_check CHECK (kind IN ('note', 'stage', 'follow_up', 'created', 'reveal', 'document'));

CREATE OR REPLACE FUNCTION public.ib_set_portal_password(p_broker uuid, p_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_key text;
BEGIN
  IF NOT can_manage_ib() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_password IS NULL OR char_length(p_password) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'invalid password'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ib_brokers WHERE id = p_broker) THEN RAISE EXCEPTION 'broker not found'; END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'ib_portal_key';
  INSERT INTO ib_portal_secrets (broker_id, password_enc)
  VALUES (p_broker, extensions.pgp_sym_encrypt(p_password, v_key))
  ON CONFLICT (broker_id) DO UPDATE SET password_enc = EXCLUDED.password_enc;
  INSERT INTO ib_events (broker_id, kind, body) VALUES (p_broker, 'note', 'Backend portal password updated 已更新代理後台密碼');
END $$;

CREATE OR REPLACE FUNCTION public.ib_reveal_portal_password(p_broker uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_enc bytea; v_key text;
BEGIN
  IF NOT can_manage_ib() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT password_enc INTO v_enc FROM ib_portal_secrets WHERE broker_id = p_broker;
  IF v_enc IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'ib_portal_key';
  INSERT INTO ib_events (broker_id, kind, body) VALUES (p_broker, 'reveal', 'Backend portal password viewed 查看了代理後台密碼');
  RETURN extensions.pgp_sym_decrypt(v_enc, v_key);
END $$;

REVOKE ALL ON FUNCTION public.ib_set_portal_password(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ib_reveal_portal_password(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ib_set_portal_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ib_reveal_portal_password(uuid) TO authenticated;
