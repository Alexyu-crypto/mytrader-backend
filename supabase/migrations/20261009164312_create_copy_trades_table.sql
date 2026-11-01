/*
# Create copy_trades tracking table

1. New Table: copy_trades
- Tracks each copied trade with a unique copy_id (master_account + master_ticket + follower_account)
- Stores the follower's local ticket after execution so close signals can find the exact position
- Status flows: pending_open -> open -> pending_close -> closed (or cancelled)

2. Columns
- id: uuid PK
- copy_id: text UNIQUE NOT NULL — composite identity: "master_account:master_ticket:follower_account"
- master_account: text
- master_ticket: bigint
- follower_account: text
- follower_ticket: bigint — the follower's local order ticket (null until executed)
- symbol: text
- order_type: text
- lots: float
- open_price: float
- sl: float
- tp: float
- magic: int
- status: text — 'pending_open' | 'open' | 'pending_close' | 'closed' | 'cancelled'
- created_at: timestamptz
- opened_at: timestamptz
- closed_at: timestamptz

3. Security
- RLS enabled, anon + authenticated full CRUD (single-tenant, no auth)

4. Notes
- The copy_engine uses copy_id to deduplicate: before generating an open signal, it checks
  if a copy_trades row with that copy_id already exists. If so, no new signal is generated.
- When master closes, the engine sets status to 'pending_close' and creates a close signal.
- The follower EA reads the close signal, looks up copy_trades for the follower_ticket,
  closes that specific position, then updates status to 'closed'.
- If the follower position is already gone (manually closed), the EA marks it 'closed' without error.
*/

CREATE TABLE IF NOT EXISTS copy_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_id text UNIQUE NOT NULL,
  master_account text NOT NULL,
  master_ticket bigint NOT NULL,
  follower_account text NOT NULL,
  follower_ticket bigint,
  symbol text DEFAULT '',
  order_type text DEFAULT '',
  lots float DEFAULT 0,
  open_price float DEFAULT 0,
  sl float DEFAULT 0,
  tp float DEFAULT 0,
  magic int DEFAULT 0,
  status text DEFAULT 'pending_open',
  created_at timestamptz DEFAULT now(),
  opened_at timestamptz,
  closed_at timestamptz
);

ALTER TABLE copy_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_copy_trades" ON copy_trades;
CREATE POLICY "anon_select_copy_trades" ON copy_trades FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_copy_trades" ON copy_trades;
CREATE POLICY "anon_insert_copy_trades" ON copy_trades FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_copy_trades" ON copy_trades;
CREATE POLICY "anon_update_copy_trades" ON copy_trades FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_copy_trades" ON copy_trades;
CREATE POLICY "anon_delete_copy_trades" ON copy_trades FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_copy_trades_copy_id ON copy_trades(copy_id);
CREATE INDEX IF NOT EXISTS idx_copy_trades_master ON copy_trades(master_account, master_ticket);
CREATE INDEX IF NOT EXISTS idx_copy_trades_follower ON copy_trades(follower_account);
CREATE INDEX IF NOT EXISTS idx_copy_trades_status ON copy_trades(status);
