/*
# MetaApi live status fields

1. Modified Tables
- `accounts`
  - `metaapi_state` (text) - MetaApi deployment state (DEPLOYED, UNDEPLOYED, DEPLOYING, ...)
  - `metaapi_connection` (text) - MetaApi broker connection (CONNECTED, DISCONNECTED, DISCONNECTED_FROM_BROKER)
  - `metaapi_region` (text) - MetaApi region the cloud terminal runs in
  - `metaapi_error` (text) - last error message from MetaApi, if any
  - `metaapi_synced_at` (timestamptz) - last time the server checked MetaApi
  - `metaapi_pending_tx` (text) - transaction id of an account creation still in progress at MetaApi, reused on retry so no duplicate cloud accounts are created

2. Security
- No policy changes. These fields are written only by the server-side MetaApi function (service role); existing accounts policies continue to apply.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_state text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_connection text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_region text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_error text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_synced_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_pending_tx text;
