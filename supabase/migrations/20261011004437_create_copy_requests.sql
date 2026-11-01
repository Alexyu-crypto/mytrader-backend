/*
# Copy requests ("Copy this" applications)

Clients can apply to copy a master account's signal from the Signals page.
Full admins follow up on every application from the user management page.

1. New Tables
- `copy_requests`
  - `id` (uuid, primary key)
  - `user_id` (uuid, applicant, defaults to the signed-in user, forced by trigger)
  - `email` (text, applicant email, filled from the sign-in account by trigger, not user supplied)
  - `master_account` (text, the master account / signal applied for; must be an existing master)
  - `contact_name` (text, applicant's name)
  - `contact` (text, phone / WhatsApp / Telegram)
  - `platform` (text, 'MT4' or 'MT5')
  - `broker` (text, applicant's broker, optional)
  - `account_number` (text, applicant's trading account number, optional)
  - `capital` (numeric, planned capital, optional)
  - `message` (text, optional note from the applicant)
  - `status` (text: pending, contacted, approved, rejected, cancelled)
  - `admin_note` (text, private follow-up notes, admins only can change)
  - `handled_by` (uuid, admin who last changed the status)
  - `created_at`, `updated_at` (timestamps)

2. Security
- RLS enabled.
- SELECT: applicants see their own requests; full admins see all.
- INSERT: active members only, for themselves. A trigger forces user_id, email,
  status 'pending', empty admin note, and checks the master account exists.
- UPDATE / DELETE: full admins only. Applicant identity and creation time can't be changed.
- `cancel_copy_request(id)`: lets an applicant withdraw their own open request (pending/contacted).

3. Notes
1. Only one open (pending or contacted) request per user per master account.
2. Table added to realtime so the admin list updates live.
*/

CREATE TABLE IF NOT EXISTS copy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  master_account text NOT NULL CHECK (char_length(master_account) BETWEEN 1 AND 200),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 100),
  contact text NOT NULL CHECK (char_length(contact) BETWEEN 3 AND 150),
  platform text NOT NULL DEFAULT 'MT4' CHECK (platform IN ('MT4', 'MT5')),
  broker text NOT NULL DEFAULT '' CHECK (char_length(broker) <= 100),
  account_number text NOT NULL DEFAULT '' CHECK (char_length(account_number) <= 50),
  capital numeric CHECK (capital IS NULL OR (capital >= 0 AND capital <= 1000000000)),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'approved', 'rejected', 'cancelled')),
  admin_note text NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_requests_status_created ON copy_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_requests_user ON copy_requests(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_copy_requests_open
  ON copy_requests(user_id, master_account) WHERE status IN ('pending', 'contacted');

ALTER TABLE copy_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.copy_requests_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.email := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '');
  NEW.status := 'pending';
  NEW.admin_note := '';
  NEW.handled_by := NULL;
  NEW.created_at := now();
  NEW.updated_at := now();
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE account_name = NEW.master_account AND type = 'master') THEN
    RAISE EXCEPTION 'unknown_master';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.copy_requests_before_insert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.copy_requests_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.user_id := OLD.user_id;
  NEW.email := OLD.email;
  NEW.master_account := OLD.master_account;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL THEN
    NEW.handled_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.copy_requests_before_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_copy_requests_before_insert ON copy_requests;
CREATE TRIGGER trg_copy_requests_before_insert BEFORE INSERT ON copy_requests
  FOR EACH ROW EXECUTE FUNCTION public.copy_requests_before_insert();
DROP TRIGGER IF EXISTS trg_copy_requests_before_update ON copy_requests;
CREATE TRIGGER trg_copy_requests_before_update BEFORE UPDATE ON copy_requests
  FOR EACH ROW EXECUTE FUNCTION public.copy_requests_before_update();

DROP POLICY IF EXISTS "select_own_or_admin_copy_requests" ON copy_requests;
CREATE POLICY "select_own_or_admin_copy_requests" ON copy_requests FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_copy_requests" ON copy_requests;
CREATE POLICY "insert_own_copy_requests" ON copy_requests FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM app_members WHERE app_members.user_id = auth.uid() AND app_members.status = 'active')
  );

DROP POLICY IF EXISTS "admin_update_copy_requests" ON copy_requests;
CREATE POLICY "admin_update_copy_requests" ON copy_requests FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_copy_requests" ON copy_requests;
CREATE POLICY "admin_delete_copy_requests" ON copy_requests FOR DELETE
  TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION public.cancel_copy_request(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE copy_requests SET status = 'cancelled'
  WHERE id = p_id AND user_id = auth.uid() AND status IN ('pending', 'contacted');
  IF NOT FOUND THEN RAISE EXCEPTION 'not_cancellable'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.cancel_copy_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_copy_request(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'copy_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE copy_requests;
  END IF;
END $$;