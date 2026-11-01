/*
# VDS monitor: public IP and per-terminal state

Supports the new VDS Monitor page, which lists every PC/VDS running installed terminals.

1. Modified Tables
- `terminal_installations`
  - `public_ip` (text, nullable): public IP the PC's control program last connected from (captured by the server).
  - `terminal_state` (jsonb, nullable): latest per-MT report from the PC, an array of
    { account_name, running, login_ok, restarts, login_error }.
  - `terminal_state_at` (timestamptz, nullable): when that report arrived.

2. Security
- No policy changes. The columns are written only by the terminal-installer server function
  (service role) and are readable under the table's existing operator policies.
*/

ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS public_ip text;
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS terminal_state jsonb;
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS terminal_state_at timestamptz;
