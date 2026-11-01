/*
# Trader Manager: saved trading windows

1. New Tables
- `desk_tickets` - one pre-configured order window on the Trader Manager page, owned by the trader who made it
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to the signed-in user)
  - `position` (int, sort order on screen)
  - `account_name` (text, master account, nullable until chosen)
  - `symbol` (text), `lots` (numeric), `sl` / `tp` (numeric, 0 = none)
  - `side` (text, BUY or SELL - direction used when sending all windows together)
  - `armed` (boolean, included in "send all")
  - `created_at`, `updated_at`

2. Security
- RLS enabled. Each trader/admin can only see and change their own windows,
  and only while they still hold the trader/admin role (`can_operate()`).
- Placing orders still goes through `desk_place_order`, which re-checks everything server-side.
*/

CREATE TABLE IF NOT EXISTS desk_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  account_name text REFERENCES accounts(account_name) ON DELETE SET NULL ON UPDATE CASCADE,
  symbol text NOT NULL DEFAULT '' CHECK (length(symbol) <= 64),
  lots numeric NOT NULL DEFAULT 0.01 CHECK (lots >= 0),
  sl numeric NOT NULL DEFAULT 0 CHECK (sl >= 0),
  tp numeric NOT NULL DEFAULT 0 CHECK (tp >= 0),
  side text NOT NULL DEFAULT 'BUY' CHECK (side IN ('BUY', 'SELL')),
  armed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS desk_tickets_user_idx ON desk_tickets (user_id, position);

ALTER TABLE desk_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_desk_tickets" ON desk_tickets;
CREATE POLICY "select_own_desk_tickets" ON desk_tickets FOR SELECT
  TO authenticated USING (auth.uid() = user_id AND can_operate());

DROP POLICY IF EXISTS "insert_own_desk_tickets" ON desk_tickets;
CREATE POLICY "insert_own_desk_tickets" ON desk_tickets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND can_operate());

DROP POLICY IF EXISTS "update_own_desk_tickets" ON desk_tickets;
CREATE POLICY "update_own_desk_tickets" ON desk_tickets FOR UPDATE
  TO authenticated USING (auth.uid() = user_id AND can_operate()) WITH CHECK (auth.uid() = user_id AND can_operate());

DROP POLICY IF EXISTS "delete_own_desk_tickets" ON desk_tickets;
CREATE POLICY "delete_own_desk_tickets" ON desk_tickets FOR DELETE
  TO authenticated USING (auth.uid() = user_id AND can_operate());
