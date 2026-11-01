/*
# Client account links

Lets full admins link Client users to the trading accounts that belong to them, so a client's
Live positions and History pages only show their own accounts plus the signals they follow.

1. New Tables
- `client_accounts`
  - `id` (uuid, primary key)
  - `user_id` (uuid, the client user, removed with the user)
  - `account_name` (text, the trading account linked to that user)
  - `created_by` (uuid, admin who made the link, defaults to the signed-in user)
  - `created_at` (timestamp)
  - Unique per (user_id, account_name)

2. New Functions
- `my_linked_accounts()` returns the signed-in user's accounts with a relation:
  - 'own'    : accounts linked to the user by an admin
  - 'signal' : master accounts copied by any of the user's own accounts (from copy_settings),
               or masters from the user's approved copy applications
  Runs with the caller's own permissions (SECURITY INVOKER), so it can only see what RLS allows.

3. Security
- RLS enabled on `client_accounts`.
- SELECT: users see their own links; full admins see all.
- INSERT / UPDATE / DELETE: full admins only.
*/

CREATE TABLE IF NOT EXISTS client_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name text NOT NULL CHECK (char_length(account_name) BETWEEN 1 AND 200),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_name)
);

CREATE INDEX IF NOT EXISTS idx_client_accounts_user ON client_accounts(user_id);

ALTER TABLE client_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_or_admin_client_accounts" ON client_accounts;
CREATE POLICY "select_own_or_admin_client_accounts" ON client_accounts FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "admin_insert_client_accounts" ON client_accounts;
CREATE POLICY "admin_insert_client_accounts" ON client_accounts FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_client_accounts" ON client_accounts;
CREATE POLICY "admin_update_client_accounts" ON client_accounts FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_client_accounts" ON client_accounts;
CREATE POLICY "admin_delete_client_accounts" ON client_accounts FOR DELETE
  TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION public.my_linked_accounts()
RETURNS TABLE (account_name text, relation text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH own AS (
    SELECT ca.account_name FROM client_accounts ca WHERE ca.user_id = auth.uid()
  ),
  signals AS (
    SELECT cs.master_account AS account_name FROM copy_settings cs
      WHERE cs.follower_account IN (SELECT o.account_name FROM own o)
    UNION
    SELECT cr.master_account FROM copy_requests cr
      WHERE cr.user_id = auth.uid() AND cr.status = 'approved'
  )
  SELECT o.account_name, 'own'::text FROM own o
  UNION
  SELECT s.account_name, 'signal'::text FROM signals s
    WHERE s.account_name NOT IN (SELECT o.account_name FROM own o);
$$;
REVOKE ALL ON FUNCTION public.my_linked_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_linked_accounts() TO authenticated;