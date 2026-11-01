/*
# Let funding staff read the account list

1. Security
  - New SELECT policy on `accounts` for members where `can_manage_funding()` is true,
    so finance staff can pick any account when logging a deposit/withdrawal.
  - Read-only; no write access is granted.
*/

DROP POLICY IF EXISTS "funding_staff_select_accounts" ON accounts;
CREATE POLICY "funding_staff_select_accounts" ON accounts FOR SELECT
  TO authenticated USING (can_manage_funding());
