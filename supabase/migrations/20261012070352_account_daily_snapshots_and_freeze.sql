/*
# Daily account snapshots + frozen / dispute flag

Keeps a permanent day-by-day record of every trading account so the balance and funding
totals are never lost, even if a broker disables the account and the EA can no longer connect.

1. New Tables
- `account_snapshots` - one row per account per day (Hong Kong date)
  - `id` (uuid, primary key)
  - `account_name` (text) - account the row belongs to (no foreign key on purpose, so the
    record survives even if the account is later removed)
  - `snapshot_date` (date) - Hong Kong calendar day
  - `broker`, `broker_server`, `platform`, `type` - account details at that time
  - `balance`, `equity` - last values reported by the EA
  - `total_deposits`, `total_withdrawals`, `total_credit` - lifetime funding totals
  - `open_positions`, `floating_pl` - open trades at snapshot time
  - `closed_trades`, `closed_profit` - lifetime closed-trade totals (profit + commission + swap)
  - `last_seen` - when the EA last connected
  - `connected` (boolean) - EA connected within the last 24 hours
  - `updated_at` - last time the row was refreshed during that day
  - unique (`account_name`, `snapshot_date`)

2. Modified Tables
- `accounts`
  - `frozen` (boolean, default false) - account marked as frozen / under dispute
  - `frozen_reason` (text, nullable, max 500 chars) - note about the case
  - `frozen_at` (timestamptz, nullable) - when it was marked

3. Functions & Jobs
- `take_account_snapshots()` (SECURITY DEFINER, not callable by app roles) upserts today's row
  for every account. Scheduled hourly via pg_cron (`account-snapshots`), so each day's row
  holds that day's latest figures. Accounts that stopped connecting keep getting a daily row
  with their last known values and `connected = false`.
- Trigger `prevent_frozen_account_delete` blocks deleting a frozen account.

4. Security
- RLS enabled on `account_snapshots`.
- SELECT only for signed-in users who may already see that account's funding records
  (same rule as `balance_operations`).
- No INSERT / UPDATE / DELETE policies: only the scheduled job writes snapshots, so nobody
  can alter the evidence from the app.
- Frozen columns are edited through the existing operator-only update policy on `accounts`.

5. Notes
1. Snapshots only contain what the EA has already uploaded; they cannot recover data that was never sent.
2. A first snapshot is taken immediately when this migration runs.
*/

CREATE TABLE IF NOT EXISTS account_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  snapshot_date date NOT NULL,
  broker text,
  broker_server text,
  platform text,
  type text,
  balance double precision NOT NULL DEFAULT 0,
  equity double precision NOT NULL DEFAULT 0,
  total_deposits double precision NOT NULL DEFAULT 0,
  total_withdrawals double precision NOT NULL DEFAULT 0,
  total_credit double precision NOT NULL DEFAULT 0,
  open_positions integer NOT NULL DEFAULT 0,
  floating_pl double precision NOT NULL DEFAULT 0,
  closed_trades integer NOT NULL DEFAULT 0,
  closed_profit double precision NOT NULL DEFAULT 0,
  last_seen timestamptz,
  connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_name, snapshot_date)
);

CREATE INDEX IF NOT EXISTS account_snapshots_account_date_idx ON account_snapshots (account_name, snapshot_date DESC);

ALTER TABLE account_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_select_account_snapshots" ON account_snapshots;
CREATE POLICY "member_select_account_snapshots" ON account_snapshots FOR SELECT
  TO authenticated
  USING (
    can_view_all()
    OR account_member_visible(account_name)
    OR account_name IN (SELECT l.account_name FROM my_linked_accounts() l(account_name, relation))
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'frozen') THEN
    ALTER TABLE accounts ADD COLUMN frozen boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'frozen_reason') THEN
    ALTER TABLE accounts ADD COLUMN frozen_reason text CHECK (frozen_reason IS NULL OR length(frozen_reason) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'frozen_at') THEN
    ALTER TABLE accounts ADD COLUMN frozen_at timestamptz;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_frozen_account_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.frozen THEN
    RAISE EXCEPTION 'Account % is frozen and cannot be deleted', OLD.account_name;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_frozen_account_delete ON accounts;
CREATE TRIGGER prevent_frozen_account_delete
  BEFORE DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_frozen_account_delete();

CREATE OR REPLACE FUNCTION take_account_snapshots()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO account_snapshots (
    account_name, snapshot_date, broker, broker_server, platform, type,
    balance, equity, total_deposits, total_withdrawals, total_credit,
    open_positions, floating_pl, closed_trades, closed_profit, last_seen, connected, updated_at
  )
  SELECT
    a.account_name,
    (now() AT TIME ZONE 'Asia/Hong_Kong')::date,
    a.broker, a.broker_server, a.platform, a.type,
    coalesce(a.balance, 0), coalesce(a.equity, 0),
    coalesce(f.deposits, 0), coalesce(f.withdrawals, 0), coalesce(f.credit, 0),
    coalesce(p.cnt, 0), coalesce(p.pl, 0),
    coalesce(t.cnt, 0), coalesce(t.pl, 0),
    a.last_seen,
    a.last_seen IS NOT NULL AND a.last_seen > now() - interval '24 hours',
    now()
  FROM accounts a
  LEFT JOIN LATERAL (
    SELECT
      sum(amount) FILTER (WHERE op_type = 'deposit') AS deposits,
      sum(abs(amount)) FILTER (WHERE op_type = 'withdrawal') AS withdrawals,
      sum(amount) FILTER (WHERE op_type = 'credit') AS credit
    FROM balance_operations b WHERE b.account_name = a.account_name
  ) f ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt, sum(coalesce(profit, 0) + coalesce(swap, 0)) AS pl
    FROM live_positions lp WHERE lp.account_name = a.account_name
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt, sum(coalesce(profit, 0) + coalesce(commission, 0) + coalesce(swap, 0)) AS pl
    FROM trade_history th WHERE th.account_name = a.account_name
  ) t ON true
  ON CONFLICT (account_name, snapshot_date) DO UPDATE SET
    broker = EXCLUDED.broker,
    broker_server = EXCLUDED.broker_server,
    platform = EXCLUDED.platform,
    type = EXCLUDED.type,
    balance = EXCLUDED.balance,
    equity = EXCLUDED.equity,
    total_deposits = EXCLUDED.total_deposits,
    total_withdrawals = EXCLUDED.total_withdrawals,
    total_credit = EXCLUDED.total_credit,
    open_positions = EXCLUDED.open_positions,
    floating_pl = EXCLUDED.floating_pl,
    closed_trades = EXCLUDED.closed_trades,
    closed_profit = EXCLUDED.closed_profit,
    last_seen = EXCLUDED.last_seen,
    connected = EXCLUDED.connected,
    updated_at = EXCLUDED.updated_at;
$$;

REVOKE ALL ON FUNCTION take_account_snapshots() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-snapshots') THEN
    PERFORM cron.unschedule('account-snapshots');
  END IF;
  PERFORM cron.schedule('account-snapshots', '5 * * * *', 'SELECT public.take_account_snapshots()');
END $$;

SELECT take_account_snapshots();
