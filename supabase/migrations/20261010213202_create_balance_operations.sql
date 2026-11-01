/*
# Deposits and withdrawals per account

## Plain-English summary
Records every money movement on a trading account that is not a trade: deposits,
withdrawals and broker credit. The MT4/MT5 EA uploads them from the account history,
so Trade History and the account report can show them and calculate true growth.

## 1. New table `balance_operations`
- `id` (uuid, primary key)
- `account_name` (text) - website account the EA reports for
- `ticket` (bigint) - broker ticket / deal number of the operation
- `op_type` (text) - 'deposit', 'withdrawal' or 'credit'
- `amount` (double precision) - signed amount (withdrawals are negative)
- `comment` (text) - broker comment, e.g. "Deposit via card"
- `op_time` (timestamptz) - when the broker booked it
- `created_at` (timestamptz)
- Unique on (account_name, ticket) so repeated uploads never create duplicates.

## 2. Security
- RLS enabled.
- Same single-tenant model as `trade_history` (no sign-in): anon + authenticated may read
  and insert. No update/delete policies, so uploaded records cannot be altered through the API.

## 3. Notes
- Kept separate from `trade_history` on purpose: the copy engine watches master
  `trade_history` inserts, and money movements must never be mistaken for closed trades.
*/

CREATE TABLE IF NOT EXISTS balance_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  ticket bigint NOT NULL,
  op_type text NOT NULL CHECK (op_type IN ('deposit', 'withdrawal', 'credit')),
  amount double precision NOT NULL,
  comment text NOT NULL DEFAULT '',
  op_time timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_name, ticket)
);

CREATE INDEX IF NOT EXISTS idx_balance_operations_account_time ON balance_operations(account_name, op_time);

ALTER TABLE balance_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_balance_operations" ON balance_operations;
CREATE POLICY "anon_select_balance_operations" ON balance_operations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_balance_operations" ON balance_operations;
CREATE POLICY "anon_insert_balance_operations" ON balance_operations FOR INSERT
  TO anon, authenticated WITH CHECK (
    length(account_name) BETWEEN 1 AND 200 AND length(comment) <= 500
  );
