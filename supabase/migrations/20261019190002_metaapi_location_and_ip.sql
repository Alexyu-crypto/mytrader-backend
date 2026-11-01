/*
# MetaApi server location, IP and region-move tracking

1. Modified Tables
- `accounts`
  - `metaapi_zone` (text, nullable): data-centre zone inside the MetaApi region (e.g. "b").
  - `metaapi_ip` (text, nullable): IP address the cloud terminal logs in from, when MetaApi reports one (dedicated IP).
  - `metaapi_moving_to` (text, nullable): target region while a "switch region" request is in progress, so a repeated click reuses the same request instead of creating a duplicate.

2. Security
- No policy changes. Columns are written only by the server function and read under existing account policies.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_zone text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_ip text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS metaapi_moving_to text;