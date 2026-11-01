/*
# Change an account's role (Master <-> Follower)

1. Overview
- Adds `change_account_role(p_account_id, p_new_type, p_remove_links)`, which switches an
  account between master and follower in one atomic step.
- The role letter is part of the account name (M-... / F-...), so the account is renamed
  (e.g. M-CTM-123-Broker -> F-CTM-123-Broker) and every table that stores the name is updated
  so trade history, positions, snapshots, funding records and copy links stay attached.

2. Safety rules (raised as errors, nothing changes)
- Only operators (`can_operate()`) may call it.
- Archived / frozen accounts are protected.
- Master -> Follower is refused while the master still has followers
  (move them first with "Change master" on Copy Groups).
- Follower -> Master is refused while it still follows a master, unless
  `p_remove_links` is true, in which case those follower links are removed.
- Refused while copy signals for the account are still pending/processing.
- Refused if the new name already exists.

3. Security
- SECURITY DEFINER with fixed search_path; EXECUTE granted to authenticated only.
*/

CREATE OR REPLACE FUNCTION public.change_account_role(p_account_id uuid, p_new_type text, p_remove_links boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc accounts%ROWTYPE;
  old_name text;
  new_name text;
  n int;
BEGIN
  IF NOT can_operate() THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF p_new_type NOT IN ('master', 'follower') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;

  SELECT * INTO acc FROM accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF acc.type = p_new_type THEN RAISE EXCEPTION 'same_type'; END IF;
  IF coalesce(acc.archive_status, 'active') <> 'active' OR coalesce(acc.frozen, false) THEN
    RAISE EXCEPTION 'archived';
  END IF;

  old_name := acc.account_name;
  IF old_name ~ '^[MF]-' THEN
    new_name := CASE WHEN p_new_type = 'master' THEN 'M' ELSE 'F' END || substr(old_name, 2);
  ELSE
    new_name := old_name;
  END IF;

  IF new_name <> old_name AND EXISTS (SELECT 1 FROM accounts WHERE account_name = new_name) THEN
    RAISE EXCEPTION 'name_taken';
  END IF;

  IF p_new_type = 'follower' THEN
    SELECT count(*) INTO n FROM copy_settings WHERE master_account = old_name;
    IF n > 0 THEN RAISE EXCEPTION 'has_followers:%', n; END IF;
  ELSE
    SELECT count(*) INTO n FROM copy_settings WHERE follower_account = old_name;
    IF n > 0 THEN
      IF NOT p_remove_links THEN RAISE EXCEPTION 'has_masters:%', n; END IF;
      DELETE FROM copy_settings WHERE follower_account = old_name;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM copy_signals
    WHERE (master_account = old_name OR follower_account = old_name)
      AND status IN ('pending', 'processing')
  ) THEN
    RAISE EXCEPTION 'signals_busy';
  END IF;

  UPDATE accounts SET type = p_new_type, account_name = new_name WHERE id = p_account_id;

  IF new_name <> old_name THEN
    UPDATE account_snapshots SET account_name = new_name WHERE account_name = old_name;
    UPDATE balance_operations SET account_name = new_name WHERE account_name = old_name;
    UPDATE client_accounts SET account_name = new_name WHERE account_name = old_name;
    UPDATE copy_requests SET master_account = new_name WHERE master_account = old_name;
    UPDATE copy_settings SET master_account = new_name WHERE master_account = old_name;
    UPDATE copy_settings SET follower_account = new_name WHERE follower_account = old_name;
    UPDATE copy_signals SET master_account = new_name WHERE master_account = old_name;
    UPDATE copy_signals SET follower_account = new_name WHERE follower_account = old_name;
    UPDATE copy_trades SET master_account = new_name WHERE master_account = old_name;
    UPDATE copy_trades SET follower_account = new_name WHERE follower_account = old_name;
    UPDATE latency_alerts SET account_name = new_name WHERE account_name = old_name;
    UPDATE live_positions SET account_name = new_name WHERE account_name = old_name;
    UPDATE trade_history SET account_name = new_name WHERE account_name = old_name;
  END IF;

  RETURN new_name;
END;
$$;

REVOKE ALL ON FUNCTION public.change_account_role(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.change_account_role(uuid, text, boolean) TO authenticated;
