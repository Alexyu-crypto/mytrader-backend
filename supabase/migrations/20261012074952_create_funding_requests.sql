/*
# Create funding_requests table for deposit/withdrawal reconciliation

1. New Tables
  - `funding_requests`
    - `id` (uuid, primary key)
    - `account_name` (text, FK to accounts) - which trading account
    - `request_type` (text) - 'deposit' or 'withdrawal'
    - `amount` (numeric, not null) - requested amount
    - `currency` (text, default 'USDT') - currency of the request
    - `reference_code` (text) - USDT hash ID or bank reference
    - `status` (text) - 'pending', 'confirmed', 'rejected'
    - `requested_at` (timestamptz) - when the request was submitted to broker
    - `confirmed_at` (timestamptz) - when confirmed/arrived
    - `notes` (text) - optional notes
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - RLS enabled, authenticated-only CRUD (admin app).

3. Notes
  - Tracks funding requests sent to brokers so admins can reconcile
    which deposits/withdrawals have arrived and which are still pending.
  - `reference_code` stores USDT transaction hash or bank transfer reference.
*/

CREATE TABLE IF NOT EXISTS funding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL REFERENCES accounts(account_name) ON UPDATE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('deposit', 'withdrawal')),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USDT',
  reference_code text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funding_requests_account ON funding_requests (account_name);
CREATE INDEX IF NOT EXISTS idx_funding_requests_status ON funding_requests (status);

ALTER TABLE funding_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_funding_requests" ON funding_requests;
CREATE POLICY "select_funding_requests" ON funding_requests FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_funding_requests" ON funding_requests;
CREATE POLICY "insert_funding_requests" ON funding_requests FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_funding_requests" ON funding_requests;
CREATE POLICY "update_funding_requests" ON funding_requests FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_funding_requests" ON funding_requests;
CREATE POLICY "delete_funding_requests" ON funding_requests FOR DELETE
  TO authenticated USING (true);
