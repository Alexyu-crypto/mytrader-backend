/*
# Add optional broker server to accounts

1. Modified Tables
- `accounts`
  - `broker_server` (text, nullable): the MT4/MT5 server name (e.g. ICMarkets-Live01), kept for the owner's records only.
2. Security
- No policy changes; existing accounts policies apply. Used for reference only, never for connecting.
*/
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS broker_server text;