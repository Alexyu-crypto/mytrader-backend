/*
# Record the sender IP address on collected server files

## 1. Modified table `broker_file_harvest`
- New column `sender_ip` (text, nullable): the internet address of the PC that sent the file
  (company PC or collector). Older rows stay empty.

## Security
- No policy changes. Rows are only written by the server; staff read them through the existing policies.
*/

ALTER TABLE broker_file_harvest ADD COLUMN IF NOT EXISTS sender_ip text;
